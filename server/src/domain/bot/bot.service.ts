// server/src/domain/bot/bot.service.ts
import { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import type { Client, GameState } from "../../types";
import { CFG } from "../../config";
import * as lb_service from "../game/leaderboard.service";
import { addEnergy, getEnergy, scoreMultiplier } from "../player/energy.service";
import { logBot } from "../../utils/botLogger";

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

/** proba d'utiliser le mode texte (plus fort => plus souvent texte) */
function botChooseMode(skill: number): "text" | "mc" {
  const pText = 0.35 + (skill / 100) * 0.45; // 35..80%
  return Math.random() < pText ? "text" : "mc";
}

/** retrouve le client factice d’un PG */
function clientForPg(clients: Map<string, Client>, pgId: string): Client | undefined {
  for (const c of clients.values()) if (c.playerGameId === pgId) return c;
  return undefined;
}

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
  st: GameState
) {
  const q = st.questions[st.index];
  if (!q) return;

  const roundMs = (st.endsAt ?? 0) - (st.roundStartMs ?? Date.now());
  if (roundMs <= 0) return;

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

    const baseProb   = skill / 100;
    const diff       = Number(q.difficulty ?? 2);
    const diffFactor = 1 - (Math.max(1, Math.min(diff, 4)) - 1) * 0.12;
    const pCorrect   = Math.min(0.95, Math.max(0.05, baseProb * diffFactor));

    const now = Date.now();
    const remainingMs = Math.max(0, (st.endsAt ?? now) - now);
    const totalRoundMs = st.roundMs ?? Number(process.env.ROUND_MS || 10000);
    const delay = delayFromSpeed(speed, totalRoundMs, remainingMs);
    const mode  : "text" | "mc" = botChooseMode(skill);

    setTimeout(async () => {
      try {
        if (!st.endsAt || Date.now() > st.endsAt) return;
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
          logBot("attach", {
            pgId: pg.id, name: client.name, reason: "created-ephemeral-client"
          });
        }

        const willBeCorrect = Math.random() < pCorrect;
        const responseMs    = Math.max(0, Date.now() - (st.roundStartMs ?? Date.now()));

        if (mode === "mc") {
          const choice = willBeCorrect && correctChoice ? correctChoice : pick(wrongChoices);
          if (!choice) return;
          st.answeredThisRound.add(pg.id);
          await botApplyMcScoring(prisma, st, client, q.id, choice.label, !!choice.isCorrect, responseMs);
        } else {
          const rawText =
            willBeCorrect && correctChoice
              ? correctChoice.label
              : wrongChoices.length ? pick(wrongChoices).label : "???";
          st.answeredThisRound.add(pg.id);
          await botApplyTextScoring(prisma, st, client, { id: q.id }, rawText, willBeCorrect, responseMs);
        }

        const lb = await lb_service.buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds));
        io.to(st.roomId).emit("leaderboard_update", { leaderboard: lb });
        io.to(st.roomId).emit("answer_received");
      } catch (err) {
        console.error("[bot answer]", err);
      }
    }, delay);
  }
}


/* -------------------------------------------------------------------------- */
/* Scoring + logs détaillés                                                    */
/* -------------------------------------------------------------------------- */

async function botApplyMcScoring(
  prisma: PrismaClient,
  _st: GameState,
  client: Client,
  questionId: string,
  label: string,
  correct: boolean,
  responseMs: number
) {
  const before = await getEnergy(prisma, client);
  const beforeE = before.ok ? before.energy! : undefined;

  const gain = CFG.AUTO_ENERGY_GAIN + (correct ? CFG.MC_ANSWER_ENERGY_GAIN : 0);
  const res = await addEnergy(prisma, client, gain);
  if (!res.ok) return;

  await prisma.$transaction(async (tx) => {
    await tx.answer.create({
      data: { playerGameId: client.playerGameId, questionId, text: label, correct, responseMs },
    });
    if (correct) {
      await tx.playerGame.update({
        where: { id: client.playerGameId },
        data: { energy: res.energy!, score: { increment: CFG.MC_ANSWER_POINTS_GAIN } },
      });
    } else {
      await tx.playerGame.update({ where: { id: client.playerGameId }, data: { energy: res.energy! } });
    }
  });

  const after = await prisma.playerGame.findUnique({ where: { id: client.playerGameId }, select: { score: true, energy: true } });
  logBot(`mc\tpg=${client.playerGameId}\tcorr=${correct ? 1 : 0}\tq=${questionId}\tE=${beforeE ?? "?"}->${res.energy!}\tS=${after?.score ?? "?"}\t${responseMs}ms`);
}

async function botApplyTextScoring(
  prisma: PrismaClient,
  _st: GameState,
  client: Client,
  q: { id: string },
  rawText: string,
  correct: boolean,
  responseMs: number
) {
  const before = await getEnergy(prisma, client);
  if (!before.ok) return;
  const beforeE = before.energy!;

  const gain = CFG.AUTO_ENERGY_GAIN + (correct ? CFG.TXT_ANSWER_ENERGY_GAIN : 0);
  const res = await addEnergy(prisma, client, gain);
  if (!res.ok) return;

  await prisma.$transaction(async (tx) => {
    await tx.answer.create({
      data: { playerGameId: client.playerGameId, questionId: q.id, text: rawText, correct, responseMs },
    });
    if (correct) {
      const mult = scoreMultiplier(beforeE);
      await tx.playerGame.update({
        where: { id: client.playerGameId },
        data: { energy: res.energy!, score: { increment: mult * CFG.TXT_ANSWER_POINTS_GAIN } },
      });
    } else {
      await tx.playerGame.update({ where: { id: client.playerGameId }, data: { energy: res.energy! } });
    }
  });

  const after = await prisma.playerGame.findUnique({ where: { id: client.playerGameId }, select: { score: true, energy: true } });
  logBot(`text\tpg=${client.playerGameId}\tcorr=${correct ? 1 : 0}\tq=${q.id}\tE=${beforeE}->${res.energy!}\tS=${after?.score ?? "?"}\t${responseMs}ms`);
}
