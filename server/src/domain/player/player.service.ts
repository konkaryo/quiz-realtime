// server/src/domain/player/player.service.ts
import { PrismaClient } from "@prisma/client";

export async function ensurePlayerForUser(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true },
  });

  if (!user) {
    throw new Error("user_not_found");
  }

  const name = user.displayName.trim();
  return prisma.player.upsert({
    where: { userId: user.id },
    update: { name },
    create: { userId: user.id, name },
  });
}