// server/src/routes/players.ts
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { toProfileUrl } from "../domain/media/media.service";
import { currentUser } from "../auth";
import { CFG } from "../config";

type HistoryQuestionResult = {
  questionId: string;
  text: string;
  result: "correct" | "wrong" | "skipped";
  points: number;
};

type PlayerHistoryRow = {
  playerGameId: string;
  playedAt: Date;
  gameId: string;
  finalScore: number;
  gameDifficulty: number;
  totalPlayers: number;
  finalRank: number;
  xpGained: number;
  bitsGained: number;
  questionResults: HistoryQuestionResult[];
};

const XP_TEXT_CORRECT = 10;
const XP_MC_CORRECT = 6;

const WINNER_PERCENT = 0.3;
const WINNER_MIN = 1;
const WINNER_MAX = 20;

function computeWinnerCount(totalPlayers: number) {
  if (!Number.isFinite(totalPlayers) || totalPlayers <= 0) return 0;
  const raw = Math.floor(WINNER_PERCENT * totalPlayers);
  return Math.min(WINNER_MAX, Math.max(WINNER_MIN, raw, 0), totalPlayers);
}

function computeTotalPot(totalPlayers: number) {
  if (!Number.isFinite(totalPlayers) || totalPlayers <= 0) return 0;
  const scale = CFG.BITS_POT_SCALE;
  const m = CFG.BITS_POT_SMALL_ROOM_M;
  const q = CFG.BITS_POT_PENALTY_Q;
  const ratio = totalPlayers / (totalPlayers + m);
  const pot = scale * Math.sqrt(totalPlayers) * Math.pow(ratio, q);
  return Math.max(0, Math.round(pot));
}

function computeBitsRewards(totalPlayers: number): number[] {
  const winnersCount = computeWinnerCount(totalPlayers);
  const totalPot = computeTotalPot(totalPlayers);
  if (!winnersCount || !totalPot) return [];

  const p = CFG.BITS_WINNER_POWER;
  const weights = Array.from({ length: winnersCount }, (_, idx) => 1 / Math.pow(idx + 1, p));
  const weightSum = weights.reduce((acc, w) => acc + w, 0);

  const rewards = weights.map((weight) => Math.round(totalPot * (weight / weightSum)));
  const roundedTotal = rewards.reduce((acc, reward) => acc + reward, 0);
  const diff = totalPot - roundedTotal;
  if (diff !== 0 && rewards.length > 0) {
    rewards[0] = Math.max(0, rewards[0] + diff);
  }

  return rewards;
}

function safeQuestionResults(value: unknown): HistoryQuestionResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const questionId = typeof entry.questionId === "string" ? entry.questionId : null;
      const text = typeof entry.text === "string" ? entry.text : null;
      const result =
        entry.result === "correct" || entry.result === "wrong" || entry.result === "skipped"
          ? entry.result
          : null;
      const points = typeof entry.points === "number" ? entry.points : 0;
      if (!questionId || !text || !result) return null;
      return { questionId, text, result, points } as HistoryQuestionResult;
    })
    .filter(Boolean) as HistoryQuestionResult[];
}

async function refreshPlayerHistory(prisma: PrismaClient, playerId: string): Promise<PlayerHistoryRow[]> {
  const playerGames = await prisma.playerGame.findMany({
    where: {
      playerId,
      game: { state: "ended" },
      answers: { some: { questionId: { not: null } } },
    },
    select: {
      id: true,
      score: true,
      gameId: true,
      game: {
        select: {
          createdAt: true,
          room: {
            select: {
              difficulty: true,
            },
          },
          playerGames: {
            select: {
              id: true,
              score: true,
              playerId: true,
              player: { select: { name: true } },
            },
          },
        },
      },
      questions: {
        select: {
          id: true,
          text: true,
        },
      },
      answers: {
        select: {
          questionId: true,
          createdAt: true,
          correct: true,
          points: true,
          mode: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { game: { createdAt: "desc" } },
    take: 100,
  });

  const eligibleGameIds = playerGames.map((pg) => pg.gameId);

  if (eligibleGameIds.length === 0) {
    await prisma.playerGameHistory.deleteMany({ where: { playerId } });
    return [];
  }

  await prisma.playerGameHistory.deleteMany({
    where: {
      playerId,
      gameId: { notIn: eligibleGameIds },
    },
  });

  const upserts = playerGames.map(async (pg) => {
    const gamePlayers = [...pg.game.playerGames].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.player.name.localeCompare(b.player.name, "fr", { sensitivity: "base" });
    });
    const rank = Math.max(1, gamePlayers.findIndex((entry) => entry.id === pg.id) + 1);

    const bitsRewards = computeBitsRewards(gamePlayers.length);
    const bitsByPlayerGameId = new Map<string, number>();
    gamePlayers.forEach((entry, index) => {
      bitsByPlayerGameId.set(entry.id, index < bitsRewards.length ? bitsRewards[index] : 0);
    });

    const xp = pg.answers.reduce((acc, answer) => {
      if (!answer.correct) return acc;
      if (answer.mode === "text") return acc + XP_TEXT_CORRECT;
      if (answer.mode === "mc") return acc + XP_MC_CORRECT;
      return acc;
    }, 0);

    const answersByQuestionId = new Map<string, { correct: boolean; points: number }>();
    pg.answers.forEach((answer) => {
      if (!answer.questionId) return;
      const current = answersByQuestionId.get(answer.questionId);
      if (!current) {
        answersByQuestionId.set(answer.questionId, {
          correct: answer.correct,
          points: answer.points ?? 0,
        });
        return;
      }
      if (!current.correct && answer.correct) {
        answersByQuestionId.set(answer.questionId, {
          correct: true,
          points: Math.max(current.points, answer.points ?? 0),
        });
      }
    });

    const questionResults: HistoryQuestionResult[] = pg.questions.map((question) => {
      const answer = answersByQuestionId.get(question.id);
      if (!answer) {
        return {
          questionId: question.id,
          text: question.text,
          result: "skipped",
          points: 0,
        };
      }
      return {
        questionId: question.id,
        text: question.text,
        result: answer.correct ? "correct" : "wrong",
        points: answer.correct ? answer.points : 0,
      };
    });

    await prisma.playerGameHistory.upsert({
      where: { playerGameId: pg.id },
      create: {
        playerId,
        gameId: pg.gameId,
        playerGameId: pg.id,
        playedAt: pg.game.createdAt,
        finalRank: rank,
        totalPlayers: gamePlayers.length,
        finalScore: pg.score,
        gameDifficulty: pg.game.room.difficulty,
        questionResults,
        xpGained: xp,
        bitsGained: bitsByPlayerGameId.get(pg.id) ?? 0,
      },
      update: {
        playedAt: pg.game.createdAt,
        finalRank: rank,
        totalPlayers: gamePlayers.length,
        finalScore: pg.score,
        gameDifficulty: pg.game.room.difficulty,
        questionResults,
        xpGained: xp,
        bitsGained: bitsByPlayerGameId.get(pg.id) ?? 0,
      },
    });
  });

  await Promise.all(upserts);

  const historyRows = await prisma.playerGameHistory.findMany({
    where: {
      playerId,
      gameId: { in: eligibleGameIds },
    },
    orderBy: [{ playedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return historyRows.map((row) => ({
    playerGameId: row.playerGameId,
    playedAt: row.playedAt,
    gameId: row.gameId,
    finalScore: row.finalScore,
    gameDifficulty: row.gameDifficulty,
    totalPlayers: row.totalPlayers,
    finalRank: row.finalRank,
    xpGained: row.xpGained,
    bitsGained: row.bitsGained,
    questionResults: safeQuestionResults(row.questionResults),
  }));
}

export function playerRoutes({ prisma }: { prisma: PrismaClient }) {
  return async function register(app: FastifyInstance) {
    app.get("/me/history", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const player = await prisma.player.findUnique({
        where: { userId: user.id },
        select: { id: true, name: true },
      });

      if (!player) {
        return reply.code(404).send({ error: "player_not_found" });
      }

      const history = await refreshPlayerHistory(prisma, player.id);

      return reply.send({
        player: {
          id: player.id,
          name: player.name,
        },
        history,
      });
    });
    app.get("/search", async (req, reply) => {
      const Query = z.object({
        q: z.string().trim().min(1).max(40),
        limit: z.coerce.number().int().min(1).max(10).optional(),
      });

      const parsed = Query.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_search_query" });
      }

      const { q, limit = 6 } = parsed.data;
      const players = await prisma.player.findMany({
        where: {
          name: {
            contains: q,
            mode: "insensitive",
          },
        },
        orderBy: [{ experience: "desc" }, { createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          name: true,
          img: true,
        },
      });

      return reply.send({
        players: players.map((player) => ({
          id: player.id,
          name: player.name,
          img: toProfileUrl(player.img ?? null),
        })),
      });
    });
    app.get("/:playerId", async (req, reply) => {
      const Params = z.object({ playerId: z.string().min(1) });
      const parsed = Params.safeParse(req.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_player_id" });
      }

      const player = await prisma.player.findUnique({
        where: { id: parsed.data.playerId },
        select: { id: true, name: true, img: true, bits: true, experience: true },
      });

      if (!player) {
        return reply.code(404).send({ error: "player_not_found" });
      }

      return reply.send({
        player: {
          id: player.id,
          name: player.name,
          img: toProfileUrl(player.img ?? null),
          bits: player.bits ?? 0,
          experience: player.experience ?? 0,
        },
      });
    });

    app.get("/:playerId/stats", async (req, reply) => {
      const Params = z.object({ playerId: z.string().min(1) });
      const parsed = Params.safeParse(req.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_player_id" });
      }

      const player = await prisma.player.findUnique({
        where: { id: parsed.data.playerId },
        select: { id: true },
      });

      if (!player) {
        return reply.code(404).send({ stats: {}, totalQuestions: 0 });
      }

      const answerStatsFilter = {
        playerGame: { playerId: player.id },
        questionId: { not: null },
      };

      const [answers, totalQuestions, avgTextResponse] = await Promise.all([
        prisma.answer.findMany({
          where: answerStatsFilter,
          orderBy: { createdAt: "desc" },
          take: 1000,
          select: {
            correct: true,
            playerGameId: true,
            questionId: true,
            question: { select: { theme: true } },
          },
        }),
        prisma.answer
          .groupBy({
            by: ["playerGameId", "questionId"],
            where: answerStatsFilter,
          })
          .then((rows) => rows.length),
        prisma.answer.aggregate({
          where: {
            playerGame: { playerId: player.id },
            mode: "text",
            correct: true,
            responseMs: { gte: 0 },
          },
          _avg: { responseMs: true },
        }),
      ]);

      const seenQuestions = new Map<string, { theme: string; correct: boolean }>();
      for (const ans of answers) {
        if (!ans.questionId) continue;
        const theme = ans.question?.theme;
        if (!theme) continue;

        const key = `${ans.playerGameId}:${ans.questionId}`;
        const existing = seenQuestions.get(key);
        if (!existing) {
          seenQuestions.set(key, { theme, correct: ans.correct });
        } else if (!existing.correct && ans.correct) {
          seenQuestions.set(key, { ...existing, correct: true });
        }
      }

      const stats = new Map<string, { total: number; correct: number }>();
      for (const entry of seenQuestions.values()) {
        const statEntry = stats.get(entry.theme) ?? { total: 0, correct: 0 };
        statEntry.total += 1;
        if (entry.correct) statEntry.correct += 1;
        stats.set(entry.theme, statEntry);
      }

      const payload: Record<string, { total: number; correct: number; accuracy: number }> = {};
      for (const [theme, entry] of stats) {
        const accuracy = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0;
        payload[theme] = { ...entry, accuracy };
      }

      return reply.send({
        stats: payload,
        totalQuestions,
        avgTextResponseMs: avgTextResponse._avg.responseMs ?? null,
      });
    });
  };
}

export default playerRoutes;