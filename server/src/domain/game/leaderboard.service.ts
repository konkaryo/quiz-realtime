import { PrismaClient } from "@prisma/client"; 

/* ---------------------------------------------------------------------------------------- */
export async function buildLeaderboard(prisma: PrismaClient, gameId: string, onlyPgIds?: string[]) {
    const where = onlyPgIds && onlyPgIds.length
        ? { id: { in: onlyPgIds } }
        : { gameId }; // fallback (dev)

    const rows = await prisma.playerGame.findMany({
        where,
        orderBy: [{ score: "desc" }],
        select: { id: true, score: true, player: { select: { name: true } } },
    });

    return rows.map((r: { id: string; score: number; player: { name: string } }) => ({
        id: r.id,
        name: r.player.name,
        score: r.score,
    }));
}
/* ---------------------------------------------------------------------------------------- */