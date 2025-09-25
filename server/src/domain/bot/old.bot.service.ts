// server/src/domain/bot/bot.service.ts
import path from "path";
import { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import type { Client, GameState } from "../../types";
import { CFG } from "../../config";
import * as lb_service from "../game/leaderboard.service";
import { addEnergy, getEnergy, scoreMultiplier } from "../player/energy.service";
import { logBot } from "../../utils/botLogger";

const THEME_FALLBACK = "DIVERS" as const;

/* ------------------------------ Utils ----------------------------------- */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** vitesse 0 -> ~80% du temps, vitesse 100 -> ~15% (±10%) */
function delayFromSpeed(speed: number, roundMs: number): number {
  const base = 0.15 + (1 - speed / 100) * 0.65;
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.max(300, Math.floor(roundMs * base * jitter));
}

/** Probabilité d’utiliser la réponse texte (le reste = QCM). */
function botChooseMode(skill: number): "text" | "mc" {
  const pText = 0.35 + (skill / 100) * 0.45; // 35%..80%
  return Math.random() < pText ? "text" : "mc";
}

/** Retrouve le Client factice d’un bot pour un PG donné. */
function clientForPg(clients: Map<string, Client>, pgId: string): Client | undefined {
  for (const c of clients.values()) if (c.playerGameId === pgId) return c;
  return undefined;
}

/* --------- Attachement des bots pour les rooms publiques ---------------- */
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
      const player = await prisma.player.create({ data: { name: bot.name, isBot: true }, select: { id: true } });
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

/* -------------------- Planifie les réponses des bots --------------------- */
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
  const wrongChoices = q.choices.filter((c) => !c.isCorrect);

  const pgs = await prisma.playerGame.findMany({
    where: { id: { in: Array.from(st.pgIds) } },
    select: {
      id: true,
      player: {
        select: {
          isBot: true,
          name: true,
          bot: { select: { speed: true, skills: { select: { theme: true, value: true } } } },
        },
      },
    },
  });

  const totalBots = pgs.filter(p => p.player.isBot).length;
  logBot(`[sched]\troom=${st.roomId}\tgame=${st.gameId}\tround=${st.index}/${st.questions.length}\tbots=${totalBots}\tpgIds=${st.pgIds.size}`);

  for (const pg of pgs) {
    if (!pg.player.isBot) continue;

    const speed = pg.player.bot?.speed ?? 50;
    const themeKey = (q.theme ?? THEME_FALLBACK) as any;
    const skill =
      pg.player.bot?.skills.find((s) => s.theme === themeKey)?.value ??
      pg.player.bot?.skills.find((s) => s.theme === THEME_FALLBACK)?.value ??
      30;

    const baseProb = skill / 100;
    const diff = Number(q.difficulty ?? 2);
    const diffFactor = 1 - (Math.max(1, Math.min(diff, 4)) - 1) * 0.12;
    const pCorrect = Math.min(0.95, Math.max(0.05, baseProb * diffFactor));

    const mode: "text" | "mc" = botChooseMode(skill);
    const delay = delayFromSpeed(speed, roundMs);

    setTimeout(async () => {
      try {
        if (!st.endsAt || Date.now() > st.endsAt) return;
        if (st.answeredThisRound.has(pg.id)) return;

        const willBeCorrect = Math.random() < pCorrect;
        const client = clientForPg(clients, pg.id);
        if (!client) return;

        const responseMs = Math.max(0, Date.now() - (st.roundStartMs ?? Date.now()));

        if (mode === "mc") {
          const choice = willBeCorrect && correctChoice ? correctChoice : pick(wrongChoices);
          if (!choice) return;
          st.answeredThisRound.add(pg.id);
          await botApplyMcScoring(prisma, st, client, q.id, choice.label, !!choice.isCorrect, responseMs);
        } else {
          const rawText =
            willBeCorrect && correctChoice
              ? correctChoice.label
              : wrongChoices.length
              ? pick(wrongChoices).label
              : "???";
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

/* ---------------------- Scoring aligné + LOG fichier -------------------- */
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
  if (!before.ok) return;

  const gain = CFG.AUTO_ENERGY_GAIN + (correct ? CFG.MC_ANSWER_ENERGY_GAIN : 0);
  const res = await addEnergy(prisma, client, gain);
  if (!res.ok) return;

  let newScore = 0;
  const delta = correct ? CFG.MC_ANSWER_POINTS_GAIN : 0;

  await prisma.$transaction(async (tx) => {
    await tx.answer.create({
      data: { playerGameId: client.playerGameId, questionId, text: label, correct, responseMs },
    });
    const updated = await tx.playerGame.update({
      where: { id: client.playerGameId },
      data: { energy: res.energy!, ...(correct ? { score: { increment: delta } } : {}) },
      select: { score: true },
    });
    newScore = updated.score;
  });

  logBot([
    new Date().toISOString(),
    client.name || "BOT",
    "mc",
    correct ? 1 : 0,
    `q=${questionId}`,
    `E=${before.energy!}->${res.energy!}`,
    `dS=${delta}`,
    `S=${newScore}`,
    `${responseMs}ms`,
  ].join("\t"));
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

  const gain = CFG.AUTO_ENERGY_GAIN + (correct ? CFG.TXT_ANSWER_ENERGY_GAIN : 0);
  const res = await addEnergy(prisma, client, gain);
  if (!res.ok) return;

  const mult = scoreMultiplier(before.energy!);
  const delta = correct ? mult * CFG.TXT_ANSWER_POINTS_GAIN : 0;

  let newScore = 0;
  await prisma.$transaction(async (tx) => {
    await tx.answer.create({
      data: { playerGameId: client.playerGameId, questionId: q.id, text: rawText, correct, responseMs },
    });
    const updated = await tx.playerGame.update({
      where: { id: client.playerGameId },
      data: { energy: res.energy!, ...(correct ? { score: { increment: delta } } : {}) },
      select: { score: true },
    });
    newScore = updated.score;
  });

  logBot([
    new Date().toISOString(),
    client.name || "BOT",
    "text",
    correct ? 1 : 0,
    `q=${q.id}`,
    `E=${before.energy!}->${res.energy!}`,
    `dS=${delta}`,
    `S=${newScore}`,
    `${responseMs}ms`,
  ].join("\t"));
}
