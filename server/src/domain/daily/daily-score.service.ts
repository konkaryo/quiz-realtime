// server/src/domain/daily/daily-score.service.ts
import { Prisma, PrismaClient } from "@prisma/client";
import { toProfileUrl } from "../media/media.service";

export type DailyChallengeLeaderboardEntry = {
  playerId: string;
  playerName: string;
  score: number;
  gamesPlayed?: number;
  img?: string | null;
};

export type DailyChallengeSelfLeaderboard = {
  rank: number;
  entry: DailyChallengeLeaderboardEntry;
} | null;

export type RankingDistributionBucket = {
  index: number;
  count: number;
  minScore: number;
  maxScore: number;
  highlighted: boolean;
};

export type DailyChallengeRankingSnapshot = {
  totalScore: number;
  rank: number | null;
  totalPlayers: number;
  percentile: number | null;
  bands: { label: string; percentile: number; score: number }[];
  distribution: RankingDistributionBucket[];
};

export type MonthlyDailyRankingSnapshot = DailyChallengeRankingSnapshot & {
  year: number;
  month: number;
};

function isMissingDailyScoreTableError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021"
  );
}

function monthParts(date: Date): { year: number; month: number } {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

async function incrementMonthlyDailyScore(
  prisma: PrismaClient,
  playerId: string,
  challengeDate: Date,
  score: number,
): Promise<void> {
  const { year, month } = monthParts(challengeDate);
  try {
    await (prisma as any).dailyChallengeMonthlyScore.upsert({
      where: { player_month_unique: { playerId, year, month } },
      update: {
        totalScore: { increment: score },
        challengesPlayed: { increment: 1 },
      },
      create: {
        playerId,
        year,
        month,
        totalScore: score,
        challengesPlayed: 1,
      },
    });
  } catch (err) {
    if (isMissingDailyScoreTableError(err)) return;
    throw err;
  }
}

export async function recordDailyScoreIfFirst(
  prisma: PrismaClient,
  challengeId: string,
  playerId: string,
  score: number,
): Promise<{ created: boolean; scoreId: string | null }> {
  try {
    const created = await prisma.dailyChallengeScore.create({ 
      data: { challengeId, playerId, score },
      select: { id: true, challenge: { select: { date: true } } },
    });
    await incrementMonthlyDailyScore(
      prisma,
      playerId,
      created.challenge.date,
      score,
    );
    return { created: true, scoreId: created.id };
  } catch (err: any) {
    if (isMissingDailyScoreTableError(err)) {
      return { created: false, scoreId: null };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Duplicate (challengeId, playerId) -> first score already recorded
      const existing = await prisma.dailyChallengeScore.findUnique({
        where: { challenge_player_unique: { challengeId, playerId } },
        select: { id: true },
      });
      return { created: false, scoreId: existing?.id ?? null };
    }
    throw err;
  }
}

export type DailyQuestionScoreResult = {
  entryId: string;
  points: number;
  correct: boolean;
};

export type DailyQuestionResultDetail = DailyQuestionScoreResult & {
  questionId: string;
  attempts: number;
  responseMs: number;
  mode: "text" | "choice" | "timeout" | "skip";
  answer?: string | null;
};

export async function recordDailyQuestionResults(
  prisma: PrismaClient,
  scoreId: string,
  playerId: string,
  results: DailyQuestionResultDetail[],
): Promise<void> {
  if (!results.length) return;

  await (prisma as any).dailyChallengeQuestionResult.createMany({
    data: results.map((result) => ({
      scoreId,
      playerId,
      entryId: result.entryId,
      questionId: result.questionId,
      correct: result.correct,
      attempts: Math.max(0, Math.round(result.attempts)),
      responseMs: Number.isFinite(result.responseMs) ? Math.max(0, Math.round(result.responseMs)) : -1,
      points: Number.isFinite(result.points) ? Math.max(0, Math.round(result.points)) : 0,
      mode: result.mode,
      answer: result.answer ?? null,
    })),
    skipDuplicates: true,
  });
}

export async function updateDailyQuestionAverageScores(
  prisma: PrismaClient,
  challengeId: string,
  results: DailyQuestionScoreResult[],
): Promise<{
  averageScores: Map<string, number>;
  correctRates: Map<string, number>;
}> {
  if (!results.length)
    return { averageScores: new Map(), correctRates: new Map() };

  const attemptCount = await prisma.dailyChallengeScore.count({
    where: { challengeId },
  });
  if (attemptCount <= 0)
    return { averageScores: new Map(), correctRates: new Map() };

  const previousAttemptCount = Math.max(0, attemptCount - 1);
  const nextAverages = new Map<string, number>();
  const nextCorrectRates = new Map<string, number>();

  for (const result of results) {
    const points = Number.isFinite(result.points) ? Math.max(0, result.points) : 0;
    const entry = await (prisma as any).dailyChallengeQuestion.findUnique({
      where: { id: result.entryId },
      select: { id: true, averageScore: true, correctRate: true },
    });
    if (!entry) continue;

    const previousAverage = Number.isFinite(entry.averageScore) ? entry.averageScore : 0;
    const previousCorrectRate = Number.isFinite(entry.correctRate) ? entry.correctRate : 0;
    const nextAverage = ((previousAverage * previousAttemptCount) + points) / attemptCount;
    const nextCorrectRate = ((previousCorrectRate * previousAttemptCount) + (result.correct ? 100 : 0)) / attemptCount;

    await (prisma as any).dailyChallengeQuestion.update({
      where: { id: result.entryId },
      data: { averageScore: nextAverage, correctRate: nextCorrectRate },
    });
    nextAverages.set(result.entryId, nextAverage);
    nextCorrectRates.set(result.entryId, nextCorrectRate);
  }

  return { averageScores: nextAverages, correctRates: nextCorrectRates };
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
          player: { select: { id: true, name: true, img: true } },
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
      img: toProfileUrl(row.player.img),
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
  const month = monthIndex + 1;
  const row = await (prisma as any).dailyChallengeMonthlyScore
    .findUnique({
      where: { player_month_unique: { playerId, year, month } },
      select: { totalScore: true, challengesPlayed: true },
    })
    .catch((err: unknown) => {
      if (isMissingDailyScoreTableError(err)) return null;
      throw err;
    });

  return {
    totalScore: row?.totalScore ?? 0,
    challengesPlayed: row?.challengesPlayed ?? 0,
  };
}

export async function getMonthlyDailyLeaderboard(
  prisma: PrismaClient,
  year: number,
  monthIndex: number,
  limit?: number,
  includeImages = true,
): Promise<DailyChallengeLeaderboardEntry[]> {
  const month = monthIndex + 1;

  const rows = await (prisma as any).dailyChallengeMonthlyScore
    .findMany({
      where: { year, month },
      orderBy: [
        { totalScore: "desc" },
        { createdAt: "asc" },
      ],
      select: {
        totalScore: true,
        challengesPlayed: true,
        player: { select: { id: true, name: true, img: true } },
      },
      ...(limit === undefined ? {} : { take: limit }),
    })
    .catch((err: unknown) => {
      if (isMissingDailyScoreTableError(err)) return [];
      throw err;
    });

  return rows.map((row: { totalScore: number; challengesPlayed: number; player: { id: string; name: string; img: string | null } }) => ({
    playerId: row.player.id,
    playerName: row.player.name,
    score: row.totalScore,
    gamesPlayed: row.challengesPlayed,
    img: includeImages ? toProfileUrl(row.player.img) : null,
  }));
}

export async function getMonthlyDailySelfLeaderboard(
  prisma: PrismaClient,
  playerId: string,
  year: number,
  monthIndex: number,
  includeImage = true,
): Promise<DailyChallengeSelfLeaderboard> {
  const month = monthIndex + 1;

  const rows = await (prisma as any).dailyChallengeMonthlyScore
    .findMany({
      where: { year, month },
      orderBy: [
        { totalScore: "desc" },
        { createdAt: "asc" },
      ],
      select: {
        playerId: true,
        totalScore: true,
        challengesPlayed: true,
        player: { select: { id: true, name: true, img: true } },
      },
    })
    .catch((err: unknown) => {
      if (isMissingDailyScoreTableError(err)) return [];
      throw err;
    }) as Array<{ totalScore: number; challengesPlayed: number; playerId: string; player: { id: string; name: string; img: string | null } }>;

  const index = rows.findIndex((row) => row.playerId === playerId);
  if (index < 0) return null;

  const row = rows[index];
  return {
    rank: index + 1,
    entry: {
      playerId: row.player.id,
      playerName: row.player.name,
      score: row.totalScore,
      gamesPlayed: row.challengesPlayed,
      img: includeImage ? toProfileUrl(row.player.img) : null,
    },
  };
}

function scoreAtPercentile(rows: { totalScore: number }[], percentile: number): number {
  if (!rows.length) return 0;
  const index = Math.min(rows.length - 1, Math.max(0, Math.ceil((percentile / 100) * rows.length) - 1));
  return rows[index]?.totalScore ?? 0;
}

export async function getDailyChallengeRankingSnapshot(
  prisma: PrismaClient,
  challengeId: string,
  playerId: string,
): Promise<DailyChallengeRankingSnapshot> {
  const rows = await prisma.dailyChallengeScore
    .findMany({
      where: { challengeId },
      orderBy: [{ score: "desc" }, { createdAt: "asc" }],
      select: { playerId: true, score: true },
    })
    .catch((err: unknown) => {
      if (isMissingDailyScoreTableError(err)) return [];
      throw err;
    });

  const normalizedRows = rows.map((row) => ({
    playerId: row.playerId,
    totalScore: row.score,
  }));
  const playerIndex = normalizedRows.findIndex((row) => row.playerId === playerId);
  const rank = playerIndex >= 0 ? playerIndex + 1 : null;
  const totalPlayers = normalizedRows.length;
  const totalScore = playerIndex >= 0 ? normalizedRows[playerIndex].totalScore : 0;
  const percentile = rank && totalPlayers > 0 ? Math.round((rank / totalPlayers) * 1000) / 10 : null;
  const barCount = 20;
  const highestScore = Math.max(0, ...normalizedRows.map((row) => row.totalScore));
  const segmentSize = highestScore > 0 ? highestScore / barCount : 1;
  const counts = Array.from({ length: barCount }, () => 0);

  for (const row of normalizedRows) {
    const segmentIndex = highestScore > 0
      ? Math.min(barCount - 1, Math.floor(row.totalScore / segmentSize))
      : 0;
    counts[segmentIndex] += 1;
  }

  const playerSegmentIndex = rank !== null
    ? highestScore > 0
      ? Math.min(barCount - 1, Math.floor(totalScore / segmentSize))
      : 0
    : null;

  return {
    totalScore,
    rank,
    totalPlayers,
    percentile,
    bands: [
      { label: "Top 1%", percentile: 1, score: scoreAtPercentile(normalizedRows, 1) },
      { label: "Top 10%", percentile: 10, score: scoreAtPercentile(normalizedRows, 10) },
      { label: "Top 50%", percentile: 50, score: scoreAtPercentile(normalizedRows, 50) },
      { label: "Top 90%", percentile: 90, score: scoreAtPercentile(normalizedRows, 90) },
      { label: "Top 100%", percentile: 100, score: scoreAtPercentile(normalizedRows, 100) },
    ],
    distribution: counts.map((count, index) => {
      const minScore = highestScore > 0 ? Math.round(index * segmentSize) : 0;
      const maxScore = highestScore > 0
        ? Math.round(index === barCount - 1 ? highestScore : (index + 1) * segmentSize)
        : 0;
      return {
        index,
        count,
        minScore,
        maxScore,
        highlighted: playerSegmentIndex === index,
      };
    }),
  };
}

export async function getMonthlyDailyRankingSnapshot(
  prisma: PrismaClient,
  playerId: string,
  year: number,
  monthIndex: number,
): Promise<MonthlyDailyRankingSnapshot> {
  const month = monthIndex + 1;
  const rows = await (prisma as any).dailyChallengeMonthlyScore
    .findMany({
      where: { year, month },
      orderBy: [
        { totalScore: "desc" },
        { createdAt: "asc" },
      ],
      select: { playerId: true, totalScore: true },
    })
    .catch((err: unknown) => {
      if (isMissingDailyScoreTableError(err)) return [];
      throw err;
    }) as { playerId: string; totalScore: number }[];

  const playerIndex = rows.findIndex((row) => row.playerId === playerId);
  const rank = playerIndex >= 0 ? playerIndex + 1 : null;
  const totalPlayers = rows.length;
  const totalScore = playerIndex >= 0 ? rows[playerIndex].totalScore : 0;
  const percentile = rank && totalPlayers > 0 ? Math.round((rank / totalPlayers) * 1000) / 10 : null;
  const barCount = 20;
  const highestScore = Math.max(0, ...rows.map((row) => row.totalScore));
  const segmentSize = highestScore > 0 ? highestScore / barCount : 1;
  const counts = Array.from({ length: barCount }, () => 0);

  for (const row of rows) {
    const segmentIndex = highestScore > 0
      ? Math.min(barCount - 1, Math.floor(row.totalScore / segmentSize))
      : 0;
    counts[segmentIndex] += 1;
  }

  const playerSegmentIndex = rank !== null
    ? highestScore > 0
      ? Math.min(barCount - 1, Math.floor(totalScore / segmentSize))
      : 0
    : null;

  const distribution = counts.map((count, index) => {
    const minScore = highestScore > 0 ? Math.round(index * segmentSize) : 0;
    const maxScore = highestScore > 0
      ? Math.round(index === barCount - 1 ? highestScore : (index + 1) * segmentSize)
      : 0;
    return {
      index,
      count,
      minScore,
      maxScore,
      highlighted: playerSegmentIndex === index,
    };
  });

  return {
    year,
    month,
    totalScore,
    rank,
    totalPlayers,
    percentile,
    bands: [
      { label: "Top 1%", percentile: 1, score: scoreAtPercentile(rows, 1) },
      { label: "Top 10%", percentile: 10, score: scoreAtPercentile(rows, 10) },
      { label: "Top 50%", percentile: 50, score: scoreAtPercentile(rows, 50) },
      { label: "Top 90%", percentile: 90, score: scoreAtPercentile(rows, 90) },
      { label: "Top 100%", percentile: 100, score: scoreAtPercentile(rows, 100) },
    ],
    distribution,
  };
}

export type DailyChallengeCompletedResult = {
  score: number;
  completedAt: string;
  questionCount: number;
  results: Array<{
    questionId: string;
    questionText: string;
    slotLabel: string | null;
    theme: string | null;
    difficulty: string | null;
    img: string | null;
    correct: boolean;
    attempts: number;
    answer: string | null;
    mode: "text" | "choice" | "timeout" | "skip";
    responseMs: number;
    correctLabel: string;
    points: number;
    averageScore: number;
    correctRate: number;
  }>;
  monthlyRanking: MonthlyDailyRankingSnapshot | null;
  dailyRanking: DailyChallengeRankingSnapshot | null;
};

function isDailyQuestionMode(
  value: string,
): value is "text" | "choice" | "timeout" | "skip" {
  return (
    value === "text" ||
    value === "choice" ||
    value === "timeout" ||
    value === "skip"
  );
}

export async function getPlayerDailyChallengeCompletedResult(
  prisma: PrismaClient,
  dateIso: string,
  playerId: string,
): Promise<{
  found: boolean;
  completed: DailyChallengeCompletedResult | null;
}> {
  const [year, month, day] = dateIso.split("-").map((v) => Number(v));
  if (!year || !month || !day) return { found: false, completed: null };

  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(Date.UTC(year, month - 1, day + 1));

  const challenge = await prisma.dailyChallenge.findFirst({
    where: { date: { gte: start, lt: end } },
    select: {
      id: true,
      date: true,
      _count: { select: { entries: true } },
      scores: {
        where: { playerId },
        select: {
          id: true,
          score: true,
          createdAt: true,
          questionResults: {
            orderBy: { entry: { position: "asc" } },
            select: {
              correct: true,
              attempts: true,
              responseMs: true,
              points: true,
              mode: true,
              answer: true,
              entry: {
                select: {
                  id: true,
                  position: true,
                  averageScore: true,
                  correctRate: true,
                },
              },
              question: {
                select: {
                  id: true,
                  text: true,
                  theme: true,
                  difficulty: true,
                  img: true,
                  choices: {
                    where: { isCorrect: true },
                    select: { label: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
        take: 1,
      },
    },
  });

  if (!challenge) return { found: false, completed: null };

  const score = challenge.scores[0];
  if (!score) return { found: true, completed: null };

  const monthPartsValue = monthParts(challenge.date);
  const [monthlyRanking, dailyRanking] = await Promise.all([
    getMonthlyDailyRankingSnapshot(
      prisma,
      playerId,
      monthPartsValue.year,
      monthPartsValue.month - 1,
    ),
    getDailyChallengeRankingSnapshot(prisma, challenge.id, playerId),
  ]);

  return {
    found: true,
    completed: {
      score: score.score,
      completedAt: score.createdAt.toISOString(),
      questionCount: challenge._count.entries,
      monthlyRanking,
      dailyRanking,
      results: score.questionResults.map((result) => ({
        questionId: result.question.id,
        questionText: result.question.text,
        slotLabel: result.entry.position
          ? `Question ${result.entry.position}`
          : null,
        theme: result.question.theme ?? null,
        difficulty: result.question.difficulty ?? null,
        img: result.question.img ?? null,
        correct: result.correct,
        attempts: result.attempts,
        answer: result.answer ?? null,
        mode: isDailyQuestionMode(result.mode) ? result.mode : "text",
        responseMs: result.responseMs,
        correctLabel: result.question.choices[0]?.label ?? "",
        points: result.points,
        averageScore: result.entry.averageScore,
        correctRate: result.entry.correctRate,
      })),
    },
  };
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

  let rows: Array<{ score: number; player: { id: string; name: string; img: string | null } }> = [];

  try {
    rows = await prisma.dailyChallengeScore.findMany({
      where: { challengeId: challenge.id },
      orderBy: [
        { score: "desc" },
        { createdAt: "asc" },
      ],
      select: {
        score: true,
        player: { select: { id: true, name: true, img: true } },
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
      img: toProfileUrl(row.player.img),
    })),
    found: true,
  };
}