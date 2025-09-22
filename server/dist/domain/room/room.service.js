"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.genCode = genCode;
exports.clientsInRoom = clientsInRoom;
exports.ensurePlayerGamesForRoom = ensurePlayerGamesForRoom;
exports.getOrCreateCurrentGame = getOrCreateCurrentGame;
exports.createNextGameFrom = createNextGameFrom;
/* ---------------------------------------------------------------------------------------- */
// génération de code pour une "Room"
function genCode(n = 4) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
function clientsInRoom(clients, roomId) {
    return [...clients.values()].filter(c => c.roomId === roomId);
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
async function ensurePlayerGamesForRoom(clients, gameId, io, prisma, roomId) {
    const members = clientsInRoom(clients, roomId);
    if (members.length === 0)
        return [];
    // 👇 typer le client de transaction
    await prisma.$transaction(async (tx) => {
        for (const m of members) {
            await tx.playerGame.upsert({
                where: { gameId_playerId: { gameId, playerId: m.playerId } },
                update: {},
                create: { gameId, playerId: m.playerId, score: 0 },
            });
        }
    });
    const pgs = await prisma.playerGame.findMany({
        where: { gameId, playerId: { in: members.map((m) => m.playerId) } },
        select: { id: true, playerId: true },
    });
    // 👇 typer le Map pour éviter '{}' et permettre l’assignation string
    const mapByPlayer = new Map(pgs.map((x) => [x.playerId, x.id]));
    for (const [sid, c] of clients) {
        if (c.roomId !== roomId)
            continue;
        const newPgId = mapByPlayer.get(c.playerId); // string | undefined
        if (newPgId) {
            c.playerGameId = newPgId; // OK: string
            c.gameId = gameId;
            const s = io.sockets.sockets.get(sid);
            if (s)
                s.data.gameId = gameId;
        }
    }
    return pgs;
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
async function getOrCreateCurrentGame(prisma, roomId) {
    // Si une partie est en cours, on la garde.
    const running = await prisma.game.findFirst({ where: { roomId, state: "running" }, orderBy: { createdAt: "desc" } });
    if (running)
        return running;
    await prisma.game.updateMany({ where: { roomId, state: { in: ["lobby", "ended"] } }, data: { state: "ended" } });
    // Crée une nouvelle partie prête à démarrer
    const fresh = await prisma.game.create({ data: { roomId, state: "lobby" } });
    return fresh;
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
// crée la prochaine game dans la room et recopie les joueurs (PlayerGame)
async function createNextGameFrom(prisma, gameId) {
    const oldGame = await prisma.game.findUnique({ where: { id: gameId } });
    if (!oldGame)
        throw new Error("Old game not found");
    const pgs = await prisma.playerGame.findMany({
        where: { gameId: oldGame.id },
        select: { playerId: true },
    });
    const next = await prisma.game.create({
        data: {
            roomId: oldGame.roomId,
            state: "lobby",
            playerGames: {
                create: pgs.map(p => ({ playerId: p.playerId, score: 0 })),
            }
        }
    });
    return { gameId: next.id };
}
/* ---------------------------------------------------------------------------------------- */ 
