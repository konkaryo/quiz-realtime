"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLeaderboard = buildLeaderboard;
/* ---------------------------------------------------------------------------------------- */
async function buildLeaderboard(prisma, gameId, onlyPgIds) {
    const where = onlyPgIds && onlyPgIds.length
        ? { id: { in: onlyPgIds } }
        : { gameId }; // fallback (dev)
    const rows = await prisma.playerGame.findMany({
        where,
        orderBy: [{ score: "desc" }],
        select: { id: true, score: true, player: { select: { name: true } } },
    });
    return rows.map((r) => ({
        id: r.id,
        name: r.player.name,
        score: r.score,
    }));
}
/* ---------------------------------------------------------------------------------------- */ 
