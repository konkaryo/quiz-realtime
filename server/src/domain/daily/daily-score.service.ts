// server/src/domain/daily/daily-score.service.ts
import { Prisma, PrismaClient } from "@prisma/client";

export type DailyChallengeLeaderboardEntry = {
  playerId: string;
  playerName: string;
  score: number;
};

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
    }),
    prisma.dailyChallengeScore.findMany({
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
  const aggregate = await prisma.dailyChallengeScore.aggregate({
    where: {
      playerId,
      challenge: { date: { gte: start, lt: end } },
    },
    _sum: { score: true },
    _count: { _all: true },
  });

  return {
    totalScore: aggregate._sum.score ?? 0,
    challengesPlayed: aggregate._count._all,
  };
}