"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensurePlayerForUser = ensurePlayerForUser;
async function ensurePlayerForUser(prisma, userId) {
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
