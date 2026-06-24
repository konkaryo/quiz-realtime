import { Prisma, type PrismaClient, type Theme } from "@prisma/client";

type ThemeStat = { total: number; correct: number };
type ThemeStats = Partial<Record<Theme, ThemeStat>>;

type DifficultyStats = {
  easy: number;
  moderate: number;
  difficult: number;
  extreme: number;
};

const emptyDifficultyStats = (): DifficultyStats => ({
  easy: 0,
  moderate: 0,
  difficult: 0,
  extreme: 0,
});

function normalizeThemeStats(value: Prisma.JsonValue | null | undefined): ThemeStats {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const stats: ThemeStats = {};
  for (const [theme, rawStat] of Object.entries(value)) {
    if (!rawStat || typeof rawStat !== "object" || Array.isArray(rawStat)) continue;
    const entry = rawStat as Record<string, unknown>;
    const total = typeof entry.total === "number" && Number.isFinite(entry.total) ? entry.total : 0;
    const correct = typeof entry.correct === "number" && Number.isFinite(entry.correct) ? entry.correct : 0;
    stats[theme as Theme] = {
      total: Math.max(0, Math.trunc(total)),
      correct: Math.max(0, Math.trunc(correct)),
    };
  }

  return stats;
}

function difficultyKey(difficulty: string | null | undefined): keyof DifficultyStats | null {
  switch (difficulty) {
    case "1":
      return "easy";
    case "2":
      return "moderate";
    case "3":
      return "difficult";
    case "4":
      return "extreme";
    default:
      return null;
  }
}

async function getBitsRank(prisma: PrismaClient, playerId: string) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, name: true, bits: true },
  });
  if (!player) return null;

  const allPlayers = await prisma.player.findMany({
    select: { id: true, name: true, bits: true },
  });

  const playerBits = player.bits ?? 0;
  const playersBefore = allPlayers.filter((candidate) => {
    if (candidate.id === player.id) return false;
    const candidateBits = candidate.bits ?? 0;
    if (candidateBits !== playerBits) return candidateBits > playerBits;
    const byName = candidate.name.localeCompare(player.name, "fr", { sensitivity: "base" });
    if (byName !== 0) return byName < 0;
    return candidate.id.localeCompare(player.id, "fr", { sensitivity: "base" }) < 0;
  });

  return playersBefore.length + 1;
}

function serializeThemeStats(stats: ThemeStats): Prisma.InputJsonObject {
  const payload: Record<string, Prisma.InputJsonValue> = {};
  for (const [theme, entry] of Object.entries(stats)) {
    payload[theme] = {
      total: entry?.total ?? 0,
      correct: entry?.correct ?? 0,
    };
  }
  return payload as Prisma.InputJsonObject;
}

export async function refreshPlayerStats(prisma: PrismaClient, playerId: string) {
  const existing = await prisma.playerStats.upsert({
    where: { playerId },
    create: { playerId, lastUpdatedAt: new Date(0) },
    update: {},
  });

  const previousLastUpdatedAt = existing.lastUpdatedAt;
  const nextLastUpdatedAt = new Date();

  const answers = await prisma.answer.findMany({
    where: {
      playerGame: { playerId },
      questionId: { not: null },
      createdAt: {
        gt: previousLastUpdatedAt,
        lte: nextLastUpdatedAt,
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      correct: true,
      playerGameId: true,
      questionId: true,
      question: { select: { theme: true, difficulty: true } },
    },
  });

  const questionResults = new Map<
    string,
    { theme: Theme | null; difficulty: string | null; correct: boolean }
  >();

  for (const answer of answers) {
    if (!answer.questionId) continue;
    const key = `${answer.playerGameId}:${answer.questionId}`;
    const current = questionResults.get(key);
    if (!current) {
      questionResults.set(key, {
        theme: answer.question?.theme ?? null,
        difficulty: answer.question?.difficulty ?? null,
        correct: answer.correct,
      });
    } else if (!current.correct && answer.correct) {
      questionResults.set(key, { ...current, correct: true });
    }
  }

  const themeStats = normalizeThemeStats(existing.themeStats);
  const difficultyStats = emptyDifficultyStats();
  difficultyStats.easy = existing.easyQuestions;
  difficultyStats.moderate = existing.moderateQuestions;
  difficultyStats.difficult = existing.difficultQuestions;
  difficultyStats.extreme = existing.extremeQuestions;

  let totalQuestions = existing.totalQuestions;
  for (const result of questionResults.values()) {
    totalQuestions += 1;

    const key = difficultyKey(result.difficulty);
    if (key) difficultyStats[key] += 1;

    if (result.theme) {
      const entry = themeStats[result.theme] ?? { total: 0, correct: 0 };
      entry.total += 1;
      if (result.correct) entry.correct += 1;
      themeStats[result.theme] = entry;
    }
  }

  const updated = await prisma.playerStats.update({
    where: { playerId },
    data: {
      totalQuestions,
      easyQuestions: difficultyStats.easy,
      moderateQuestions: difficultyStats.moderate,
      difficultQuestions: difficultyStats.difficult,
      extremeQuestions: difficultyStats.extreme,
      themeStats: serializeThemeStats(themeStats),
      lastUpdatedAt: nextLastUpdatedAt,
    },
  });

  const stats: Record<string, { total: number; correct: number; accuracy: number }> = {};
  const updatedThemeStats = normalizeThemeStats(updated.themeStats);
  for (const [theme, entry] of Object.entries(updatedThemeStats)) {
    const total = entry?.total ?? 0;
    const correct = entry?.correct ?? 0;
    stats[theme] = {
      total,
      correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    };
  }

  const difficultyTotal =
    updated.easyQuestions + updated.moderateQuestions + updated.difficultQuestions + updated.extremeQuestions;
  const [bitsRank, distinctQuestions] = await Promise.all([
    getBitsRank(prisma, playerId),
    prisma.answer
      .findMany({
        where: { playerGame: { playerId }, questionId: { not: null } },
        distinct: ["questionId"],
        select: { questionId: true },
      })
      .then((answers) => answers.length),
  ]);

  return {
    stats,
    totalQuestions: updated.totalQuestions,
    distinctQuestions,
    bitsRank,
    difficulty: {
      easy: updated.easyQuestions,
      moderate: updated.moderateQuestions,
      difficult: updated.difficultQuestions,
      extreme: updated.extremeQuestions,
      easyPercent: difficultyTotal > 0 ? Math.round((updated.easyQuestions / difficultyTotal) * 100) : 0,
      moderatePercent: difficultyTotal > 0 ? Math.round((updated.moderateQuestions / difficultyTotal) * 100) : 0,
      difficultPercent: difficultyTotal > 0 ? Math.round((updated.difficultQuestions / difficultyTotal) * 100) : 0,
      extremePercent: difficultyTotal > 0 ? Math.round((updated.extremeQuestions / difficultyTotal) * 100) : 0,
    },
    lastUpdatedAt: updated.lastUpdatedAt,
  };
}