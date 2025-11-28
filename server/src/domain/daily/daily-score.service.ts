// server/src/domain/daily/daily-score.service.ts
import { Prisma, PrismaClient } from "@prisma/client";

export type DailyChallengeLeaderboardEntry = {
  playerId: string;
  playerName: string;
  score: number;
};

function isMissingDailyScoreTableError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2021"
  );
}

function monthRange(year: number, monthIndex: number) {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { start, end };
}

export async function recordDailyScoreIfFirst(
  prisma: PrismaClient,
  challengeId: string,
  playerId: string,
  score: number,
): Promise<{ created: boolean }>
{
  try {
    await prisma.dailyChallengeScore.create({
      data: { challengeId, playerId, score },
    });
    return { created: true };
  } catch (err: any) {
    if (isMissingDailyScoreTableError(err)) {
      return { created: false };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Duplicate (challengeId, playerId) -> first score already recorded
      return { created: false };
    }
    throw err;
  }
}

export async function getDailyChallengeStats(
  prisma: PrismaClient,
  challengeId: string,
  limit = 50,
): Promise<{
  averageScore: number | null;
  attemptCount: number;
  bestScore: number | null;
  leaderboard: DailyChallengeLeaderboardEntry[];
}>
{
  const [aggregate, leaderboard] = await Promise.all([
    prisma.dailyChallengeScore.aggregate({
      where: { challengeId },
      _avg: { score: true },
      _count: { _all: true },
      _max: { score: true },
    }).catch((err) => {
      if (isMissingDailyScoreTableError(err)) {
        return {
          _avg: { score: null },
          _count: { _all: 0 },
          _max: { score: null },
        } as const;
      }
      throw err;
    }),
    prisma.dailyChallengeScore
      .findMany({
        where: { challengeId },
        orderBy: [
          { score: "desc" },
          { createdAt: "asc" },
        ],
        select: {
          score: true,
          player: { select: { id: true, name: true } },
        },
        take: limit,
      })
      .catch((err) => {
        if (isMissingDailyScoreTableError(err)) return [];
        throw err;
      }),
  ]);

  return {
    averageScore: aggregate._avg.score ?? null,
    attemptCount: aggregate._count._all,
    bestScore: aggregate._max.score ?? null,
    leaderboard: leaderboard.map((row) => ({
      playerId: row.player.id,
      playerName: row.player.name,
      score: row.score,
    })),
  };
}

export async function getPlayerMonthlyDailyScore(
  prisma: PrismaClient,
  playerId: string,
  year: number,
  monthIndex: number,
): Promise<{ totalScore: number; challengesPlayed: number }>
{
  const { start, end } = monthRange(year, monthIndex);
  const aggregate = await prisma.dailyChallengeScore
    .aggregate({
      where: {
        playerId,
        challenge: { date: { gte: start, lt: end } },
      },
      _sum: { score: true },
      _count: { _all: true },
    })
    .catch((err) => {
      if (isMissingDailyScoreTableError(err)) {
        return { _sum: { score: null }, _count: { _all: 0 } } as const;
      }
      throw err;
    });

  return {
    totalScore: aggregate._sum.score ?? 0,
    challengesPlayed: aggregate._count._all,
  };
}

export async function getMonthlyDailyLeaderboard(
  prisma: PrismaClient,
  year: number,
  monthIndex: number,
  limit = 10,
): Promise<DailyChallengeLeaderboardEntry[]> {
  const { start, end } = monthRange(year, monthIndex);

  const aggregates = await prisma.dailyChallengeScore
    .groupBy({
      by: ["playerId"],
      where: {
        challenge: { date: { gte: start, lt: end } },
      },
      _sum: { score: true },
      _min: { createdAt: true },
      orderBy: [
        { _sum: { score: "desc" } },
        { _min: { createdAt: "asc" } },
      ],
      take: limit,
    })
    .catch((err): Prisma.DailyChallengeScoreGroupByOutputType[] => {
      if (isMissingDailyScoreTableError(err)) return [];
      throw err;
    });

  if (aggregates.length === 0) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: aggregates.map((row) => row.playerId) } },
    select: { id: true, name: true },
  });

  const playerNameById = new Map(players.map((p) => [p.id, p.name]));

  return aggregates.map((row) => ({
    playerId: row.playerId,
    playerName: playerNameById.get(row.playerId) ?? "",
    score: row._sum?.score ?? 0,
  }));
}

export async function getDailyLeaderboardForDate(
  prisma: PrismaClient,
  dateIso: string,
  limit = 10,
): Promise<{ leaderboard: DailyChallengeLeaderboardEntry[]; found: boolean }> {
  const [year, month, day] = dateIso.split("-").map((v) => Number(v));
  if (!year || !month || !day) return { leaderboard: [], found: false };

  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(Date.UTC(year, month - 1, day + 1));

  const challenge = await prisma.dailyChallenge.findFirst({
    where: { date: { gte: start, lt: end } },
    select: { id: true },
  });

  if (!challenge) {
    return { leaderboard: [], found: false };
  }

  let rows: Array<{ score: number; player: { id: string; name: string } }> = [];

  try {
    rows = await prisma.dailyChallengeScore.findMany({
      where: { challengeId: challenge.id },
      orderBy: [
        { score: "desc" },
        { createdAt: "asc" },
      ],
      select: {
        score: true,
        player: { select: { id: true, name: true } },
      },
      take: limit,
    });
  } catch (err: unknown) {
    if (isMissingDailyScoreTableError(err)) {
      return { leaderboard: [], found: true };
    }
    throw err;
  }

  return {
    leaderboard: rows.map((row) => ({
      playerId: row.player.id,
      playerName: row.player.name,
      score: row.score,
    })),
    found: true,
  };
}