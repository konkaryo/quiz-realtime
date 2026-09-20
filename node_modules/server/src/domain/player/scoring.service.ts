// server/src/domain/player/scoring.service.ts
import { CFG } from "../../config";

const MAX_SPEED_BONUS = 30;

/* ---------------------------------------------------------------------------------------- */
export function computeSpeedBonus(rank: number, totalPlayers: number): number {
  if (
    !Number.isFinite(rank) ||
    !Number.isFinite(totalPlayers) ||
    rank < 1 ||
    totalPlayers < 1 ||
    rank > totalPlayers
  ) {
    return 0;
  }

  if (totalPlayers === 1) return MAX_SPEED_BONUS;

  const raw = MAX_SPEED_BONUS - (MAX_SPEED_BONUS * (rank - 1)) / (totalPlayers - 1);
  return Math.max(0, Math.min(MAX_SPEED_BONUS, Math.round(raw)));
}
export function computeTextAnswerPoints(speedBonusEnabled: boolean, speedBonus = 0): number {
  if (!speedBonusEnabled) return CFG.TXT_ANSWER_POINTS_WITHOUT_SPEED_BONUS;

  const boundedBonus = Number.isFinite(speedBonus)
    ? Math.max(0, Math.min(MAX_SPEED_BONUS, Math.round(speedBonus)))
    : 0;
  return CFG.TXT_ANSWER_POINTS_GAIN + boundedBonus;
}
/* ---------------------------------------------------------------------------------------- */