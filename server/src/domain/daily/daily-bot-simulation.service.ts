import type { PrismaClient } from "@prisma/client";
import { CFG } from "../../config";
import {
  type DailyQuestionResultDetail,
  recordDailyQuestionResults,
  recordDailyScoreIfFirst,
  updateDailyQuestionAverageScores,
} from "./daily-score.service";
import { getChallengeByDate } from "./daily.service";

const THEME_FALLBACK = "DIVERS" as const;
const DAILY_ROUND_MS = Number(process.env.DAILY_ROUND_MS || 20000);

// Same probability curves as multiplayer bot answers, so daily simulations react
// to bot skill + question difficulty in a coherent way.
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

export type DailyBotSimulationResult = {
  botId: string;
  playerId: string;
  name: string;
  score: number;
  recorded: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeSuccessProbability(level: number, params: DifficultyParams): number {
  const exponent = -(level - params.t) / params.s;
  const sigmoid = 1 / (1 + Math.exp(exponent));
  const probability = params.pMin + (params.pMax - params.pMin) * Math.pow(sigmoid, params.k);
  return clamp(probability, 0, 1);
}

function difficultyNumber(difficulty: string | null): number {
  const parsed = Number(difficulty ?? 2);
  return clamp(Number.isFinite(parsed) ? Math.round(parsed) : 2, 1, 4);
}

function simulatedResponseMs(speed: number): number {
  const base = 0.15 + (1 - clamp(speed, 0, 100) / 100) * 0.65;
  const jitter = 0.9 + Math.random() * 0.2;
  return clamp(Math.floor(DAILY_ROUND_MS * base * jitter), 120, Math.max(120, DAILY_ROUND_MS - 150));
}

function dailyTimeBonus(responseMs: number): number {
  const remainingMs = Math.max(0, DAILY_ROUND_MS - responseMs);
  const secsLeft = Math.floor(remainingMs / 1000);
  return Math.floor(secsLeft / 2) * 5;
}

function skillWithRegularity(skill: number, regularity: number): number {
  const normalizedRegularity = clamp(regularity, 0, 1);
  const volatility = (1 - normalizedRegularity) * 12;
  const noise = (Math.random() * 2 - 1) * volatility;
  return clamp(Math.round(skill + noise), 0, 100);
}

async function ensureBotPlayer(
  prisma: PrismaClient,
  bot: { id: string; name: string; playerId: string | null },
): Promise<string> {
  if (bot.playerId) return bot.playerId;

  const player = await prisma.player.create({
    data: { name: bot.name, isBot: true },
    select: { id: true },
  });
  await prisma.bot.update({ where: { id: bot.id }, data: { playerId: player.id } });
  return player.id;
}

export async function simulateDailyChallengeForBots(
  prisma: PrismaClient,
  dateIso: string,
  botCount: number,
): Promise<{ challengeId: string; results: DailyBotSimulationResult[] }> {
  const challenge = await getChallengeByDate(prisma, dateIso);
  if (!challenge) throw new Error("daily_challenge_not_found");
  if (!challenge.questions.length) throw new Error("daily_challenge_empty");

  const safeBotCount = clamp(Math.round(botCount), 1, 100);
  const sampled = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Bot" ORDER BY random() LIMIT ${safeBotCount};
  `;

  if (!sampled.length) {
    return { challengeId: challenge.id, results: [] };
  }

  const bots = await prisma.bot.findMany({
    where: { id: { in: sampled.map((row) => row.id) } },
    select: {
      id: true,
      name: true,
      speed: true,
      regularity: true,
      averageSkill: true,
      playerId: true,
      skills: { select: { theme: true, value: true } },
    },
  });

  const results: DailyBotSimulationResult[] = [];

  for (const bot of bots) {
    const playerId = await ensureBotPlayer(prisma, bot);
    let score = 0;
    const questionResults: DailyQuestionResultDetail[] = [];

    for (const question of challenge.questions) {
      const theme = question.theme ?? THEME_FALLBACK;
      const baseSkill =
        bot.skills.find((skill) => skill.theme === theme)?.value ??
        bot.skills.find((skill) => skill.theme === THEME_FALLBACK)?.value ??
        bot.averageSkill ??
        30;
      const skill = skillWithRegularity(baseSkill, bot.regularity);
      const diff = difficultyNumber(question.difficulty);
      const responseMs = simulatedResponseMs(bot.speed);
      const textSuccessProb = computeSuccessProbability(skill, TEXT_SUCCESS_PARAMS[diff]);

      let points = 0;
      let correct = false;
      let mode: DailyQuestionResultDetail["mode"] = "text";
      let attempts = 1;
      let answer: string | null = question.correctLabel || null;
      if (Math.random() < textSuccessProb) {
        correct = true;
        points = CFG.TXT_ANSWER_POINTS_GAIN + dailyTimeBonus(responseMs);
      } else {
        const mcSuccessProb = computeSuccessProbability(skill, MC_SUCCESS_PARAMS[diff]);
        mode = "choice";
        if (Math.random() < mcSuccessProb) {
          points = 60 + dailyTimeBonus(responseMs);
        } else {
          answer = null;
        }
      }

      score += points;
      questionResults.push({
        entryId: question.entryId,
        questionId: question.id,
        correct,
        attempts,
        responseMs,
        mode,
        answer,
        points,
      });
    }

    const record = await recordDailyScoreIfFirst(prisma, challenge.id, playerId, score);
    if (record.created && record.scoreId) {
      await recordDailyQuestionResults(prisma, record.scoreId, playerId, questionResults);
      await updateDailyQuestionAverageScores(prisma, challenge.id, questionResults);
    }

    results.push({
      botId: bot.id,
      playerId,
      name: bot.name,
      score,
      recorded: record.created,
    });
  }

  return { challengeId: challenge.id, results };
}