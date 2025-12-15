// server/src/domain/bot/bot.service.ts
import { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import type { Client, GameState, StoredAnswer } from "../../types";
import { CFG } from "../../config";
import * as lb_service from "../game/leaderboard.service";
import { computeSpeedBonus } from "../player/scoring.service";

const THEME_FALLBACK = "DIVERS" as const;

/* -------------------------------------------------------------------------- */
/* Utils                                                                       */
/* -------------------------------------------------------------------------- */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** délai dépendant de la vitesse mais borné pour arriver avant la fin */
function delayFromSpeed(speed: number, roundMs: number, remainingMs: number): number {
  const base = 0.15 + (1 - speed / 100) * 0.65;
  const jitter = 0.9 + Math.random() * 0.2; // ±10%
  const raw = Math.floor(roundMs * base * jitter);
  const SAFETY = 150;
  const maxAllowed = Math.max(120, (remainingMs ?? roundMs) - SAFETY);
  return Math.min(Math.max(120, raw), maxAllowed);
}

/** choix “cosmétique” du mode quand on veut varier (uniquement pour les mauvaises réponses) */
function botChooseMode(skill: number): "text" | "mc" {
  const pText = 0.35 + (skill / 100) * 0.45; // 35..80%
  return Math.random() < pText ? "text" : "mc";
}

/** retrouve le client factice d’un PG */
function clientForPg(clients: Map<string, Client>, pgId: string): Client | undefined {
  for (const c of clients.values()) if (c.playerGameId === pgId) return c;
  return undefined;
}

/** tirage gaussien (Box–Muller), centré sur mean, borné [0,100] */
function sampleNormalClamped(mean: number, sigma = 18): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v); // N(0,1)
  const x = mean + sigma * z;
  return Math.max(0, Math.min(100, x));
}

/** seuils par difficulté (seuils utilisés par la logique de décision) */
const DIFF_THRESHOLD: Record<number, number> = {
  1: 25,
  2: 45,
  3: 65,
  4: 85,
};

const ensurePlayerData = (st: GameState, pgId: string) => {
  if (!st.playerData) st.playerData = new Map();
  let entry = st.playerData.get(pgId);
  if (!entry) {
    entry = { score: 0, answers: [] as StoredAnswer[] };
    st.playerData.set(pgId, entry);
  }
  return entry;
};

const recordAnswer = (st: GameState, pgId: string, answer: StoredAnswer, gained: number) => {
  const entry = ensurePlayerData(st, pgId);
  entry.answers.push(answer);
  if (gained > 0) entry.score += gained;
};

/* -------------------------------------------------------------------------- */
/* Attachement des bots                                                        */
/* -------------------------------------------------------------------------- */

type WithId = { id: string };

export async function ensureBotsForRoomIfPublic(
  prisma: PrismaClient,
  io: Server,
  clients: Map<string, Client>,
  room: { id: string; visibility: "PUBLIC" | "PRIVATE"; roundMs?: number },
  game: WithId,
  botCount = Number(process.env.DEFAULT_BOT_COUNT || 10)
) {
  if (room.visibility !== "PUBLIC" || botCount <= 0) return [] as { id: string }[];

  const bots = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Bot" ORDER BY random() LIMIT ${botCount};
  `;

  const attached: { id: string }[] = [];

  for (const b of bots) {
    const bot = await prisma.bot.findUnique({
      where: { id: b.id },
      select: { id: true, name: true, playerId: true },
    });
    if (!bot) continue;

    let playerId = bot.playerId;
    if (!playerId) {
      const player = await prisma.player.create({
        data: { name: bot.name, isBot: true },
        select: { id: true },
      });
      await prisma.bot.update({ where: { id: bot.id }, data: { playerId: player.id } });
      playerId = player.id;
    }

    const pg = await prisma.playerGame.upsert({
      where: { gameId_playerId: { gameId: game.id, playerId } },
      update: {},
      create: { gameId: game.id, playerId, score: 0 },
      select: { id: true },
    });

    const fakeSocketId = `bot:${bot.id}:${game.id}`;
    clients.set(fakeSocketId, {
      socketId: fakeSocketId,
      playerId,
      playerGameId: pg.id,
      gameId: game.id,
      roomId: room.id,
      name: bot.name,
    });

    attached.push({ id: pg.id });
  }

  io.to(room.id).emit("lobby_update");
  return attached;
}

/* -------------------------------------------------------------------------- */
/* Planification des réponses                                                  */
/* -------------------------------------------------------------------------- */

export async function scheduleBotAnswers(
  prisma: PrismaClient,
  io: Server,
  clients: Map<string, Client>,
  st: GameState,
  roundUid?: string
) {
  const q = st.questions[st.index];
  if (!q) return;

  const roundMs = (st.endsAt ?? 0) - (st.roundStartMs ?? Date.now());
  if (roundMs <= 0) return;

  const myUid = roundUid ?? st.roundUid;

  const correctChoice = q.choices.find((c) => c.isCorrect) || null;
  const wrongChoices  = q.choices.filter((c) => !c.isCorrect);

  // ⬇️ on récupère aussi playerId et le nom du joueur
  const pgs = await prisma.playerGame.findMany({
    where: { id: { in: Array.from(st.pgIds) } },
    select: {
      id: true,
      playerId: true,
      player: {
        select: {
          isBot: true,
          name: true,
          bot: { select: { speed: true, skills: { select: { theme: true, value: true } } } },
        },
      },
    },
  });

  for (const pg of pgs) {
    if (!pg.player.isBot) continue;

    const speed = pg.player.bot?.speed ?? 50;
    const themeKey = (q.theme ?? THEME_FALLBACK) as any;
    const skill =
      pg.player.bot?.skills.find((s) => s.theme === themeKey)?.value ??
      pg.player.bot?.skills.find((s) => s.theme === THEME_FALLBACK)?.value ?? 30;

    // --- Nouvelle logique : tirage gaussien et décision par seuil ---
    const diffNum = Math.max(1, Math.min(4, Number(q.difficulty ?? 2)));
    const threshold = DIFF_THRESHOLD[diffNum];
    const draw = sampleNormalClamped(skill); // 0..100 ~ N(skill, sigma)

    let outcome: "text-correct" | "mc-correct" | "wrong";
    if (draw > threshold) {
      outcome = "text-correct";                         // a) au-dessus du seuil -> texte correct
    } else if (threshold - draw <= 10 && threshold - draw >= 0) {
      outcome = "mc-correct";                           // b) dans la bande [0..10] sous le seuil -> QCM correct
    } else {
      outcome = "wrong";                                // c) sinon faux
    }
    // ---------------------------------------------------------------

    const now = Date.now();
    const remainingMs = Math.max(0, (st.endsAt ?? now) - now);
    const totalRoundMs = st.roundMs ?? Number(process.env.ROUND_MS || 10000);
    const delay = delayFromSpeed(speed, totalRoundMs, remainingMs);

    setTimeout(async () => {
      try {
        if (!st.endsAt || Date.now() > st.endsAt) return;
        if (st.roundUid !== myUid) return;
        if (st.answeredThisRound.has(pg.id))     return;

        // ⬇️ ASSURE UN CLIENT FACTICE SI ABSENT
        let client = clientForPg(clients, pg.id);
        if (!client) {
          const fakeSocketId = `bot:${pg.playerId}:${st.gameId}:${pg.id}`;
          client = {
            socketId:     fakeSocketId,
            playerId:     pg.playerId,
            playerGameId: pg.id,
            gameId:       st.gameId,
            roomId:       st.roomId,
            name:         pg.player.name ?? "Bot",
          };
          clients.set(fakeSocketId, client);
        }

        const responseMs = Math.max(0, Date.now() - (st.roundStartMs ?? Date.now()));

        // ==== Appliquer la réponse / scoring ====
        if (outcome === "mc-correct") {
          // QCM correct
          if (!correctChoice) return;
          st.answeredThisRound.add(pg.id);
          await botApplyMcScoring(prisma, st, client, q.id, correctChoice.label, true, responseMs);
        } else if (outcome === "text-correct") {
          // Texte correct + éventuel bonus de rapidité
          const rawText = correctChoice ? correctChoice.label : "???";
          let speedBonus = 0;
          if (!Array.isArray(st.answeredOrderText)) st.answeredOrderText = [];
          if (!st.answeredOrderText.includes(pg.id)) {
            st.answeredOrderText.push(pg.id);
            const rank = st.answeredOrderText.length;
            const totalPlayers = st.pgIds.size;
            speedBonus = computeSpeedBonus(rank, totalPlayers);
          }
          st.answeredThisRound.add(pg.id);
          await botApplyTextScoring(prisma, st, client, { id: q.id }, rawText, true, responseMs, speedBonus);
        } else {
          // Mauvaise réponse : varier (texte/QCM) pondéré par skill
          const mode = botChooseMode(skill);
          if (mode === "mc") {
            const wrong = wrongChoices.length ? pick(wrongChoices) : correctChoice; // fallback
            if (!wrong) return;
            st.answeredThisRound.add(pg.id);
            await botApplyMcScoring(prisma, st, client, q.id, wrong.label, false, responseMs);
          } else {
            const rawText =
              wrongChoices.length ? pick(wrongChoices).label :
              correctChoice ? correctChoice.label + "?" : "???";
            st.answeredThisRound.add(pg.id);
            await botApplyTextScoring(prisma, st, client, { id: q.id }, rawText, false, responseMs, 0);
          }
        }

        // 🔒 enregistré une seule fois dans answeredOrder (dédupliqué)
        if (!Array.isArray(st.answeredOrder)) st.answeredOrder = [];
        if (!st.answeredOrder.includes(pg.id)) st.answeredOrder.push(pg.id);

        // 🔁 rebâtir le leaderboard sur tout le game (pas de onlyPgIds)
        const lb = await lb_service.buildLeaderboard(prisma, st.gameId, /*onlyPgIds*/ undefined, st);
        io.to(st.roomId).emit("leaderboard_update", { leaderboard: lb });

        // badge "a répondu" + statut correct/incorrect
        const wasCorrect = outcome === "mc-correct" || outcome === "text-correct";
        io.to(st.roomId).emit("player_answered", { pgId: client.playerGameId, correct: wasCorrect });
      } catch (err) {
        console.error("[bot answer]", err);
      }
    }, delay);
  }
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

async function botApplyMcScoring(
  _prisma: PrismaClient,
  st: GameState,
  client: Client,
  questionId: string,
  label: string,
  correct: boolean,
  responseMs: number
) {


  recordAnswer(
    st,
    client.playerGameId,
    { questionId, text: label, correct, mode: "mc", responseMs },
    correct ? CFG.MC_ANSWER_POINTS_GAIN : 0,
  );
}

async function botApplyTextScoring(
  _prisma: PrismaClient,
  st: GameState,
  client: Client,
  q: { id: string },
  rawText: string,
  correct: boolean,
  responseMs: number,
  speedBonus = 0
) {

  const gained = correct ? CFG.TXT_ANSWER_POINTS_GAIN + speedBonus : 0;
  recordAnswer(
    st,
    client.playerGameId,
    { questionId: q.id, text: rawText, correct, mode: "text", responseMs },
    gained,
  );
}
