// server/src/domain/daily/daily.service.ts
import { PrismaClient } from "@prisma/client";
import { toImgUrl } from "../media/media.service";

type ChallengeSummaryRow = {
  date: Date;
  entries: {
    slotLabel: string | null;
    position: number;
    question: {
      id: string;
      theme: string | null;
      difficulty: string | null;
    } | null;
  }[];
};

type ChallengeDetailRow = {
  date: Date;
  entries: {
    slotLabel: string | null;
    position: number;
    question: {
      id: string;
      text: string;
      theme: string | null;
      difficulty: string | null;
      img: string | null;
      choices: { id: string; label: string; isCorrect: boolean }[];
      acceptedAnswers: { norm: string }[];
    } | null;
  }[];
};

export type DailyChallengeSummary = {
  date: string;
  questionCount: number;
  slotLabels: string[];
  themeCounts: Record<string, number>;
  difficultyAverage: number | null;
};

export type DailyChallengeQuestionDto = {
  id: string;
  text: string;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  choices: { id: string; label: string; isCorrect: boolean }[];
  acceptedNorms: string[];
  correctLabel: string;
  slotLabel: string | null;
  position: number;
};

export type DailyChallengeQuestionPublicDto = {
  id: string;
  text: string;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  choices: { id: string; label: string }[];
  slotLabel: string | null;
  position: number;
};


export type DailyChallengeDetail = {
  date: string;
  questionCount: number;
  questions: DailyChallengeQuestionDto[];
};

export type DailyChallengePublicDetail = {
  date: string;
  questionCount: number;
  questions: DailyChallengeQuestionPublicDto[];
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthRange(year: number, monthIndex: number) {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { start, end };
}

export async function listChallengesForMonth(
  prisma: PrismaClient,
  year: number,
  monthIndex: number,
): Promise<DailyChallengeSummary[]> {
  const { start, end } = monthRange(year, monthIndex);
  const rows = (await (prisma as any).dailyChallenge.findMany({
    where: { date: { gte: start, lt: end } },
    include: {
      entries: {
        orderBy: { position: "asc" },
        include: {
          question: {
            select: { id: true, theme: true, difficulty: true },
          },
        },
      },
    },
    orderBy: { date: "asc" },
  })) as ChallengeSummaryRow[];

  return rows.map((row) => {
    const slotLabels = row.entries.map((entry) => entry.slotLabel ?? "");
    const themeCounts: Record<string, number> = {};
    let diffSum = 0;
    let diffCount = 0;

    row.entries.forEach((entry) => {
      const theme = entry.question?.theme;
      if (theme) {
        themeCounts[theme] = (themeCounts[theme] ?? 0) + 1;
      }
      const diff = entry.question?.difficulty;
      const n = diff ? Number(diff) : NaN;
      if (Number.isFinite(n)) {
        diffSum += n;
        diffCount += 1;
      }
    });

    const difficultyAverage = diffCount > 0 ? diffSum / diffCount : null;

    return {
      date: isoDate(row.date),
      questionCount: row.entries.length,
      slotLabels,
      themeCounts,
      difficultyAverage,
    };
  });
}

export async function getChallengeByDate(prisma: PrismaClient, dateIso: string): Promise<DailyChallengeDetail | null> {
  const [year, month, day] = dateIso.split("-").map((v) => Number(v));
  if (!year || !month || !day) return null;
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(Date.UTC(year, month - 1, day + 1));

  const row = (await (prisma as any).dailyChallenge.findFirst({
    where: { date: { gte: start, lt: end } },
    include: {
      entries: {
        orderBy: { position: "asc" },
        include: {
          question: {
            select: {
              id: true,
              text: true,
              theme: true,
              difficulty: true,
              img: true,
              choices: { select: { id: true, label: true, isCorrect: true } },
              acceptedAnswers: { select: { norm: true } },
            },
          },
        },
      },
    },
  })) as ChallengeDetailRow | null;

  if (!row) return null;

  const questions: DailyChallengeQuestionDto[] = row.entries
    .filter((entry) => entry.question)
    .map((entry) => {
      const q = entry.question!;
      const correct = q.choices.find((choice) => choice.isCorrect);
      return {
        id: q.id,
        text: q.text,
        theme: q.theme ?? null,
        difficulty: q.difficulty ?? null,
        img: toImgUrl(q.img),
        choices: q.choices.map((choice) => ({
          id: choice.id,
          label: choice.label,
          isCorrect: choice.isCorrect,
        })),
        acceptedNorms: q.acceptedAnswers.map((ans) => ans.norm),
        correctLabel: correct?.label ?? "",
        slotLabel: entry.slotLabel ?? null,
        position: entry.position,
      };
    });

  return {
    date: isoDate(row.date),
    questionCount: questions.length,
    questions,
  };

}

export function toPublicChallenge(detail: DailyChallengeDetail | null): DailyChallengePublicDetail | null {
  if (!detail) return null;
  return {
    date: detail.date,
    questionCount: detail.questionCount,
    questions: detail.questions.map((q) => ({
      id: q.id,
      text: q.text,
      theme: q.theme,
      difficulty: q.difficulty,
      img: q.img,
      slotLabel: q.slotLabel,
      position: q.position,
      // Strip correctness/accepted norms
      choices: q.choices.map((c) => ({ id: c.id, label: c.label })),
    })),
  };
}