import { PrismaClient } from "@prisma/client";

const XP_TEXT_CORRECT = 10;
const XP_MC_CORRECT = 6;

type LeaderboardEntry = { id: string };

export type XpRewardRecipient = {
  playerId: string;
  playerGameId: string;
  xp: number;
};

export async function awardXpForGame(
  prisma: PrismaClient,
  gameId: string,
  leaderboard: LeaderboardEntry[],
) {
  if (!leaderboard.length) return [] as XpRewardRecipient[];

  const playerGames = await prisma.playerGame.findMany({
    where: { gameId, id: { in: leaderboard.map((row) => row.id) } },
    select: { id: true, playerId: true },
  });

  const playerGameIds = playerGames.map((pg) => pg.id);
  if (!playerGameIds.length) return [] as XpRewardRecipient[];

  const answers = await prisma.answer.findMany({
    where: {
      playerGameId: { in: playerGameIds },
      correct: true,
    },
    select: { playerGameId: true, mode: true },
  });

  const xpByPgId = new Map<string, number>();
  playerGameIds.forEach((id) => xpByPgId.set(id, 0));

  answers.forEach((answer) => {
    if (!answer.playerGameId) return;
    const current = xpByPgId.get(answer.playerGameId) ?? 0;
    if (answer.mode === "text") xpByPgId.set(answer.playerGameId, current + XP_TEXT_CORRECT);
    else if (answer.mode === "mc") xpByPgId.set(answer.playerGameId, current + XP_MC_CORRECT);
  });

  const rewards = playerGames
    .filter((pg) => !!pg.playerId)
    .map((pg) => ({
      playerId: pg.playerId,
      playerGameId: pg.id,
      xp: xpByPgId.get(pg.id) ?? 0,
    }));

  const updates = rewards
    .filter((reward) => reward.xp > 0)
    .map((reward) =>
      prisma.player.update({
        where: { id: reward.playerId },
        data: { experience: { increment: reward.xp } },
      }),
    );

  if (updates.length) {
    await prisma.$transaction(updates);
  }

  return rewards;
}