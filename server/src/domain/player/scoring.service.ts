// server/src/domain/player/scoring.service.ts

/* ---------------------------------------------------------------------------------------- */
export function computeSpeedBonus(rank: number, totalPlayers: number): number {
  if (!Number.isFinite(rank) || !Number.isFinite(totalPlayers) || totalPlayers <= 1) return 0;
  const raw = 50 - (50 * (rank - 1)) / (totalPlayers - 1);
  return Math.max(0, Math.round(raw));
}
/* ---------------------------------------------------------------------------------------- */