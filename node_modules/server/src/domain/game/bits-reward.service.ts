import { PrismaClient } from "@prisma/client";
import { CFG } from "../../config";

type LeaderboardEntry = { id: string };

type RewardRecipient = {
  playerId: string;
  playerGameId: string;
  rank: number;
  bits: number;
};

const WINNER_PERCENT = 0.3;
const WINNER_MIN = 1;
const WINNER_MAX = 20;

function computeWinnerCount(totalPlayers: number) {
  if (!Number.isFinite(totalPlayers) || totalPlayers <= 0) return 0;
  const raw = Math.floor(WINNER_PERCENT * totalPlayers);
  return Math.min(WINNER_MAX, Math.max(WINNER_MIN, raw, 0), totalPlayers);
}

function computeTotalPot(totalPlayers: number) {
  if (!Number.isFinite(totalPlayers) || totalPlayers <= 0) return 0;
  const scale = CFG.BITS_POT_SCALE;
  const m = CFG.BITS_POT_SMALL_ROOM_M;
  const q = CFG.BITS_POT_PENALTY_Q;
  const ratio = totalPlayers / (totalPlayers + m);
  const pot = scale * Math.sqrt(totalPlayers) * Math.pow(ratio, q);
  return Math.max(0, Math.round(pot));
}

function computeRewards(totalPot: number, winners: RewardRecipient[]) {
  if (!Number.isFinite(totalPot) || totalPot <= 0 || winners.length === 0) return winners;
  const p = CFG.BITS_WINNER_POWER;
  const weights = winners.map((_, idx) => 1 / Math.pow(idx + 1, p));
  const weightSum = weights.reduce((acc, w) => acc + w, 0);

  let total = 0;
  winners.forEach((winner, idx) => {
    const reward = Math.round(totalPot * (weights[idx] / weightSum));
    winner.bits = reward;
    total += reward;
  });

  const diff = totalPot - total;
  if (diff !== 0 && winners.length > 0) {
    winners[0].bits = Math.max(0, winners[0].bits + diff);
    const newTotal = winners.reduce((acc, w) => acc + w.bits, 0);
    if (newTotal !== totalPot) {
      const delta = totalPot - newTotal;
      const last = winners.length - 1;
      winners[last].bits = Math.max(0, winners[last].bits + delta);
    }
  }

  return winners;
}

export async function awardBitsForGame(
  prisma: PrismaClient,
  gameId: string,
  leaderboard: LeaderboardEntry[],
) {
  if (!leaderboard.length) return [] as RewardRecipient[];

  const playerGames = await prisma.playerGame.findMany({
    where: { gameId, id: { in: leaderboard.map((row) => row.id) } },
    select: { id: true, playerId: true },
  });

  const metaByPgId = new Map(playerGames.map((pg) => [pg.id, { playerId: pg.playerId }]));

  const eligible = leaderboard
    .map((row) => {
      const meta = metaByPgId.get(row.id);
      if (!meta?.playerId) return null;
      return { playerId: meta.playerId, playerGameId: row.id, rank: 0, bits: 0 } as RewardRecipient;
    })
    .filter(Boolean) as RewardRecipient[];

  const totalPlayers = leaderboard.length;
  const winnersCount = computeWinnerCount(totalPlayers);
  if (winnersCount === 0) return [] as RewardRecipient[];

  const totalPot = computeTotalPot(totalPlayers);
  if (totalPot === 0) return [] as RewardRecipient[];

  const winners = eligible.slice(0, winnersCount).map((winner, idx) => ({
    ...winner,
    rank: idx + 1,
  }));

  computeRewards(totalPot, winners);

  const updates = winners
    .filter((winner) => winner.bits > 0)
    .map((winner) =>
      prisma.player.update({
        where: { id: winner.playerId },
        data: { bits: { increment: winner.bits } },
      }),
    );

  if (updates.length) {
    await prisma.$transaction(updates);
  }

  return winners;
}