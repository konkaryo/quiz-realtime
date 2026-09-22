export type CorrectTextDelayQuestion = {
  questionCharCount: number;
  defaultAnswerCharCount: number;
  shortestAnswerCharCount: number;
  difficulty: string | number | null;
  hasImage: boolean;
  progressiveDisplay: boolean;
};

export type RandomSource = () => number;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function baseQuestionReadingScore(questionCharCount: number): number {
  return clamp((60 * (questionCharCount - 25)) / 125, 0, 60);
}

export function questionModifier(hasImage: boolean, progressiveDisplay: boolean): number {
  return 1 - (hasImage ? 0.3 : 0) + (progressiveDisplay ? 0.8 : 0);
}

export function questionReadingScore(
  questionCharCount: number,
  hasImage: boolean,
  progressiveDisplay: boolean,
): number {
  return clamp(
    baseQuestionReadingScore(questionCharCount) * questionModifier(hasImage, progressiveDisplay),
    0,
    60,
  );
}

export function answerTypingScoreForLength(answerCharCount: number): number {
  return clamp((40 * (answerCharCount - 1)) / 29, 0, 40);
}

export function combinedAnswerTypingScore(defaultCount: number, shortestCount: number): number {
  return clamp(
    0.6 * answerTypingScoreForLength(defaultCount) + 0.4 * answerTypingScoreForLength(shortestCount),
    0,
    40,
  );
}

export function minimumResponseDelaySeconds(baseDelayScore: number): number {
  return 2 + (4 * clamp(baseDelayScore, 0, 100)) / 100;
}

/** Maps difficulties 1..4 at equal intervals across the complete 0..100 scale. */
export function questionDifficultyScore(difficulty: string | number | null): number {
  const parsed = Number(difficulty ?? 2);
  const level = clamp(Number.isFinite(parsed) ? Math.round(parsed) : 2, 1, 4);
  return ((level - 1) / 3) * 100;
}

export function speedModifierForSkillGap(skillGap: number): number {
  if (skillGap <= -30) return 0.5;
  if (skillGap < 0) return 0.5 + ((skillGap + 30) / 30) * 0.5;
  if (skillGap < 50) return 1 + (skillGap / 50) * 0.5;
  return 1.5;
}

export function effectiveFastResponseProbability(speed: number, speedModifier: number): number {
  return clamp(speed * speedModifier, 0, 100);
}

function randomBetween(min: number, max: number, random: RandomSource): number {
  if (max <= min) return min;
  return min + random() * (max - min);
}

/** Returns milliseconds; random injection keeps fast/slow selection testable. */
export function calculateBotCorrectTextDelayMs(
  question: CorrectTextDelayQuestion,
  speed: number,
  botThemeSkill: number,
  maxResponseDelayMs: number,
  random: RandomSource = Math.random,
): number {
  const readingScore = questionReadingScore(
    question.questionCharCount,
    question.hasImage,
    question.progressiveDisplay,
  );
  const typingScore = combinedAnswerTypingScore(
    question.defaultAnswerCharCount,
    question.shortestAnswerCharCount,
  );
  const baseDelayScore = clamp(readingScore + typingScore, 0, 100);
  const minResponseDelayMs = minimumResponseDelaySeconds(baseDelayScore) * 1000;
  const skillGap = clamp(botThemeSkill, 0, 100) - questionDifficultyScore(question.difficulty);
  const probability = effectiveFastResponseProbability(speed, speedModifierForSkillGap(skillGap));
  const isFastResponse = random() * 100 < probability;

  return isFastResponse
    ? randomBetween(minResponseDelayMs, minResponseDelayMs * 1.5, random)
    : randomBetween(minResponseDelayMs * 1.5, maxResponseDelayMs, random);
}

export function correctAnswerFitsAvailableTime(responseDelayMs: number, availableResponseTimeMs: number): boolean {
  return responseDelayMs <= availableResponseTimeMs;
}