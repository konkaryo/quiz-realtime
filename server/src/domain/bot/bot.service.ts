// server/src/domain/bot/bot.service.ts
import { PrismaClient, type Theme } from "@prisma/client";
import type { Server } from "socket.io";
import { emitPublicRoomsUpdated } from "../room/public-room-events";
import type { Client, GameState, StoredAnswer } from "../../types";
import { CFG } from "../../config";
import * as lb_service from "../game/leaderboard.service";
import { computeSpeedBonus, computeTextAnswerPoints } from "../player/scoring.service";

const THEME_FALLBACK = "CULTURE_GENERALE" as Theme;
const botInactivityByRoom = new Map<string, number>();
const botRoomByPlayerId = new Map<string, string>();

export function releaseBotFromRoom(playerId: string, roomId: string) {
  if (botRoomByPlayerId.get(playerId) === roomId) botRoomByPlayerId.delete(playerId);
}

/* -------------------------------------------------------------------------- */
/* Utils                                                                       */
/* -------------------------------------------------------------------------- */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Délai humain : la lecture dynamique ralentit, et un QCM arrive plus tard. */
function delayFromSpeed(
  speed: number,
  roundMs: number,
  remainingMs: number,
  mode: "text" | "mc",
  dynamicQuestionDisplay: boolean,
  questionLength: number,
  hasImage: boolean,
): number {
  const readingDelay = dynamicQuestionDisplay ? 0.12 : 0;
  const qcmDelay = mode === "mc" ? 0.1 : 0;
  const lengthDelay = Math.max(-0.08, Math.min(0.14, (questionLength - 100) / 600));
  const imageDelay = hasImage ? -0.09 : 0;
  const base = Math.max(
    0.12,
    Math.min(0.92, 0.15 + (1 - speed / 100) * 0.58 + readingDelay + qcmDelay + lengthDelay + imageDelay),
  );
  const jitter = 0.85 + Math.random() * 0.3; // ±15%
  const raw = Math.floor(roundMs * base * jitter);
  const SAFETY = 150;
  const maxAllowed = Math.max(120, (remainingMs ?? roundMs) - SAFETY);
  return Math.min(Math.max(120, raw), maxAllowed);
}

/** retrouve le client factice d’un PG */
function clientForPg(clients: Map<string, Client>, pgId: string): Client | undefined {
  for (const c of clients.values()) if (c.playerGameId === pgId) return c;
  return undefined;
}

type DifficultyParams = {
  pMin: number;
  pMax: number;
  t: number;
  s: number;
  k: number;
};

const TEXT_SUCCESS_PARAMS: Record<number, DifficultyParams> = {
  1: { pMin: 0.000894, pMax: 0.987059, t: -0.6738, s: 31.4048, k: 3.3622 },
  2: { pMin: 0.000128, pMax: 0.996224, t: 40.0608, s: 25.9796, k: 1.9613 },
  3: { pMin: 0.000085, pMax: 0.789855, t: 41.4811, s: 21.362, k: 3.4659 },
  4: { pMin: 0.000147, pMax: 0.646214, t: 84.9999, s: 13.44, k: 2.1857 },
};

const MC_SUCCESS_PARAMS: Record<number, DifficultyParams> = {
  1: { pMin: 0.25, pMax: 0.80, t: 55, s: 20, k: 1.30 },
  2: { pMin: 0.25, pMax: 0.68, t: 60, s: 18, k: 1.40 },
  3: { pMin: 0.25, pMax: 0.62, t: 65, s: 17, k: 1.50 },
  4: { pMin: 0.25, pMax: 0.55, t: 70, s: 16, k: 1.70 },
};

function computeSuccessProbability(level: number, params: DifficultyParams): number {
  const exponent = -(level - params.t) / params.s;
  const sigmoid = 1 / (1 + Math.exp(exponent));
  const probability = params.pMin + (params.pMax - params.pMin) * Math.pow(sigmoid, params.k);
  return Math.min(1, Math.max(0, probability));
}

function drawRandom(): number {
  return Number(Math.random().toFixed(5));
}


const ensurePlayerData = (st: GameState, pgId: string) => {
  if (!st.playerData) st.playerData = new Map();
  let entry = st.playerData.get(pgId);
  st.attemptedThisRound.add(pgId);
  if (!entry) {
    entry = { score: 0, answers: [] as StoredAnswer[] };
    st.playerData.set(pgId, entry);
  }
  return entry;
};

const recordAnswer = (st: GameState, pgId: string, answer: Omit<StoredAnswer, "points">, gained: number) => {
  const entry = ensurePlayerData(st, pgId);
  entry.answers.push({ ...answer, points: gained });
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
  room: { id: string; visibility: "PUBLIC" | "PRIVATE"; roundMs?: number; difficulty?: number },
  game: WithId,
  botCount = Number(process.env.DEFAULT_BOT_COUNT || 10)
) {
  if (room.visibility !== "PUBLIC" || botCount <= 0) return [] as { id: string; playerId: string }[];

  const roomDifficulty = Math.max(0, Math.min(100, room.difficulty ?? 50));
  const bots = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Bot"
    ORDER BY ABS(COALESCE("averageSkill", 50) - ${roomDifficulty}) + random() * 30
    LIMIT ${Math.max(10, botCount * 4)};
  `;

  const attached: { id: string; playerId: string }[] = [];
  const connectedPlayerIds = new Set(Array.from(clients.values(), (client) => client.playerId));

  for (const b of bots) {
    if (attached.length >= botCount) break;
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

    if (connectedPlayerIds.has(playerId) || botRoomByPlayerId.has(playerId)) continue;
    botRoomByPlayerId.set(playerId, room.id);

    let pg: { id: string };
    try {
      pg = await prisma.playerGame.upsert({
        where: { gameId_playerId: { gameId: game.id, playerId } },
        update: {},
        create: { gameId: game.id, playerId, score: 0 },
        select: { id: true },
      });
    } catch (error) {
      releaseBotFromRoom(playerId, room.id);
      throw error;
    }

    const fakeSocketId = `bot:${bot.id}:${game.id}`;
    clients.set(fakeSocketId, {
      socketId: fakeSocketId,
      playerId,
      playerGameId: pg.id,
      gameId: game.id,
      roomId: room.id,
      name: bot.name,
    });

    connectedPlayerIds.add(playerId);
    attached.push({ id: pg.id, playerId });
  }

  io.to(room.id).emit("lobby_update");
  emitPublicRoomsUpdated(io);
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

  // Les bots peuvent quitter ou rejoindre un salon public entre deux questions,
  // y compris pendant une partie. Un playerId reste toutefois attaché à un seul
  // salon à la fois grâce au filtrage réalisé dans ensureBotsForRoomIfPublic.
  if (st.isPublicRoom) {
    let membershipChanged = false;
    const connectedBots = Array.from(clients.entries()).filter(
      ([socketId, client]) => socketId.startsWith("bot:") && client.roomId === st.roomId,
    );
    for (const [socketId, client] of connectedBots) {
      if (Math.random() >= 0.012) continue;
      clients.delete(socketId);
      releaseBotFromRoom(client.playerId, st.roomId);
      st.pgIds.delete(client.playerGameId);
      st.playerData.delete(client.playerGameId);
      st.qcmUsesByPgId.delete(client.playerGameId);
      membershipChanged = true;
    }

    const targetBotCount = Math.max(0, Number(process.env.DEFAULT_BOT_COUNT || 10));
    const currentBotCount = Array.from(clients.entries()).filter(
      ([socketId, client]) => socketId.startsWith("bot:") && client.roomId === st.roomId,
    ).length;
    if (currentBotCount < targetBotCount && Math.random() < 0.12) {
      const attached = await ensureBotsForRoomIfPublic(
        prisma,
        io,
        clients,
        { id: st.roomId, visibility: "PUBLIC", roundMs: st.roundMs, difficulty: st.difficulty },
        { id: st.gameId },
        1,
      );
      for (const bot of attached) {
        st.pgIds.add(bot.id);
        ensurePlayerData(st, bot.id);
        membershipChanged = true;
      }
    }

    if (membershipChanged) {
      const leaderboard = await lb_service.buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds), st);
      io.to(st.roomId).emit("leaderboard_update", { leaderboard });
      io.to(st.roomId).emit("lobby_update");
      emitPublicRoomsUpdated(io);
    }
  }

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

    const inactivityKey = `${st.roomId}:${pg.playerId}`;
    const inactiveRoundsRemaining = botInactivityByRoom.get(inactivityKey) ?? 0;
    if (inactiveRoundsRemaining > 0) {
      if (inactiveRoundsRemaining === 1) botInactivityByRoom.delete(inactivityKey);
      else botInactivityByRoom.set(inactivityKey, inactiveRoundsRemaining - 1);
      continue;
    }
    // De rares pauses de 4 à 15 questions reproduisent une absence temporaire,
    // indépendamment de la capacité du bot à trouver la bonne réponse.
    if (Math.random() < 0.035) {
      botInactivityByRoom.set(inactivityKey, 3 + Math.floor(Math.random() * 12));
      continue;
    }

    const speed = pg.player.bot?.speed ?? 50;
    const themeKey = (q.theme ?? THEME_FALLBACK) as any;
    const skill =
      pg.player.bot?.skills.find((s) => s.theme === themeKey)?.value ??
      pg.player.bot?.skills.find((s) => s.theme === THEME_FALLBACK)?.value ?? 30;

    // Une mauvaise connaissance produit le plus souvent une absence de réponse.
    // Les mauvaises tentatives texte restent rares et un QCM n'est envisagé que
    // si le bot dispose encore d'un usage pour cette partie.
    const diffNum = Math.max(1, Math.min(4, Number(q.difficulty ?? 2)));
    const textParams = TEXT_SUCCESS_PARAMS[diffNum];
    const mcParams = MC_SUCCESS_PARAMS[diffNum];
    const textSuccessProb = computeSuccessProbability(skill, textParams);
    const textDraw = drawRandom();

    const qcmUsed = st.qcmUsesByPgId.get(pg.id) ?? 0;
    const canUseQcm = qcmUsed < st.qcmUses;
    let outcome: "text-correct" | "mc-correct" | "mc-wrong" | "text-wrong" | "no-attempt";
    if (textDraw < textSuccessProb) {
      outcome = "text-correct";
    } else if (canUseQcm && Math.random() < 0.28) {
      const mcSuccessProb = computeSuccessProbability(skill, mcParams);
      outcome = drawRandom() < mcSuccessProb ? "mc-correct" : "mc-wrong";
    } else if (Math.random() < 0.12) {
      outcome = "text-wrong";
    } else {
      outcome = "no-attempt";
    }
    if (outcome === "no-attempt") continue;

    const now = Date.now();
    const remainingMs = Math.max(0, (st.endsAt ?? now) - now);
    const totalRoundMs = st.roundMs ?? Number(process.env.ROUND_MS || 10000);
    const plannedMode = outcome.startsWith("mc-") ? "mc" : "text";
    const delay = delayFromSpeed(
      speed,
      totalRoundMs,
      remainingMs,
      plannedMode,
      st.dynamicQuestionDisplay,
      q.text.length,
      Boolean(q.img),
    );

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
        let answerMode: "mc" | "text" = "mc";
        if (outcome === "mc-correct") {
          // QCM correct
          if (!correctChoice) return;
          const used = st.qcmUsesByPgId.get(pg.id) ?? 0;
          if (used >= st.qcmUses) return;
          st.qcmUsesByPgId.set(pg.id, used + 1);
          st.answeredThisRound.add(pg.id);
          await botApplyMcScoring(prisma, st, client, q.id, correctChoice.label, true, responseMs);
        } else if (outcome === "text-correct") {
          // Texte correct + éventuel bonus de rapidité
          answerMode = "text";
          const rawText = correctChoice ? correctChoice.label : "???";
          let speedBonus = 0;
          if (st.speedBonusEnabled) {
            if (!Array.isArray(st.answeredOrderText)) st.answeredOrderText = [];
            if (!st.answeredOrderText.includes(pg.id)) {
              st.answeredOrderText.push(pg.id);
              const rank = st.answeredOrderText.length;
              const totalPlayers = st.pgIds.size;
              speedBonus = computeSpeedBonus(rank, totalPlayers);
            }
          }
          st.answeredThisRound.add(pg.id);
          await botApplyTextScoring(prisma, st, client, { id: q.id }, rawText, true, responseMs, speedBonus);
        } else if (outcome === "mc-wrong") {
          const used = st.qcmUsesByPgId.get(pg.id) ?? 0;
          if (used >= st.qcmUses) return;
          const wrong = wrongChoices.length ? pick(wrongChoices) : correctChoice;
          if (!wrong) return;
          st.qcmUsesByPgId.set(pg.id, used + 1);
          st.answeredThisRound.add(pg.id);
          await botApplyMcScoring(prisma, st, client, q.id, wrong.label, false, responseMs);
        } else {
          answerMode = "text";
          const rawText = wrongChoices.length ? pick(wrongChoices).label : correctChoice ? `${correctChoice.label}?` : "???";
          st.answeredThisRound.add(pg.id);
          await botApplyTextScoring(prisma, st, client, { id: q.id }, rawText, false, responseMs, 0);
        }

        // 🔒 enregistré une seule fois dans answeredOrder (dédupliqué)
        if (!Array.isArray(st.answeredOrder)) st.answeredOrder = [];
        if (!st.answeredOrder.includes(pg.id)) st.answeredOrder.push(pg.id);

        // 🔁 rebâtir le leaderboard sur tout le game (pas de onlyPgIds)
        const lb = await lb_service.buildLeaderboard(prisma, st.gameId, /*onlyPgIds*/ undefined, st);
        io.to(st.roomId).emit("leaderboard_update", { leaderboard: lb });

        // badge "a répondu" + statut correct/incorrect
        const wasCorrect = outcome === "mc-correct" || outcome === "text-correct";
        io.to(st.roomId).emit("player_answered", {
          pgId: client.playerGameId,
          correct: wasCorrect,
          mode: answerMode,
        });
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

  const gained = correct ? computeTextAnswerPoints(st.speedBonusEnabled, speedBonus) : 0;
  recordAnswer(
    st,
    client.playerGameId,
    { questionId: q.id, text: rawText, correct, mode: "text", responseMs },
    gained,
  );
}
