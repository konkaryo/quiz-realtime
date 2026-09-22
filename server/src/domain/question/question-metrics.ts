import { norm } from "./textmatch";

export type QuestionCharacterMetrics = {
  questionCharCount: number;
  defaultAnswerCharCount: number;
  shortestAnswerCharCount: number;
};

/** Computes persisted metrics from the same normalized forms used for text matching. */
export function questionCharacterMetrics(
  question: string,
  defaultAnswer: string,
  acceptedAnswers: string[],
): QuestionCharacterMetrics {
  const normalizedDefault = norm(defaultAnswer);
  const normalizedAccepted = [defaultAnswer, ...acceptedAnswers]
    .map(norm)
    .filter((answer) => answer.length > 0);

  return {
    questionCharCount: question.length,
    defaultAnswerCharCount: normalizedDefault.length,
    shortestAnswerCharCount: normalizedAccepted.length
      ? Math.min(...normalizedAccepted.map((answer) => answer.length))
      : normalizedDefault.length,
  };
}