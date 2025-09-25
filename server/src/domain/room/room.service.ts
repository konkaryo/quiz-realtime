import { PrismaClient, Prisma } from "@prisma/client"; 
import type { Client } from "../../types";
import { Server } from "socket.io";

/* ---------------------------------------------------------------------------------------- */
// génération de code pour une "Room"
export function genCode(n = 4) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export function isCodeValid(s: string) {
  return /^[A-Z0-9]{4}$/.test(s) && !/[IO01]/.test(s);
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export function clientsInRoom(clients: Map<string, Client>, roomId: string) {
    return [...clients.values()].filter(c => c.roomId === roomId);
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export async function ensurePlayerGamesForRoom(
  clients: Map<string, Client>,
  gameId: string,
  io: Server,
  prisma: PrismaClient,
  roomId: string
) {
  // joueurs humains actuellement connectés dans la room
  const members = clientsInRoom(clients, roomId);

  // on ne lit que la visibilité : PUBLIC => on ajoute des bots
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { visibility: true },
  });

  // upsert pour les joueurs connectés
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const m of members) {
      await tx.playerGame.upsert({
        where: { gameId_playerId: { gameId, playerId: m.playerId } },
        update: {},
        create: { gameId, playerId: m.playerId, score: 0 },
      });
    }

    // si room publique, compléter avec des bots (nombre via env)
    if (room?.visibility === "PUBLIC") {
      const desired = Number(process.env.BOT_SLOTS ?? 10);

      // bots déjà inscrits à cette game
      const alreadyBotPGs = await tx.playerGame.findMany({
        where: { gameId, player: { isBot: true } },
        select: { playerId: true },
      });
      const alreadyCount = alreadyBotPGs.length;

      const missing = Math.max(0, desired - alreadyCount);
      if (missing > 0) {
        // bots disponibles = isBot:true qui n'ont pas encore de PG pour cette game
        const freeBots = await tx.player.findMany({
          where: {
            isBot: true,
            playerGames: { none: { gameId } },
          },
          select: { id: true },
          take: missing, // pas random, mais suffisant; on peut randomiser plus tard
        });

        for (const b of freeBots) {
          await tx.playerGame.upsert({
            where: { gameId_playerId: { gameId, playerId: b.id } },
            update: {},
            create: { gameId, playerId: b.id, score: 0 },
          });
        }
      }
    }
  });

  // retourne tous les PG de la game (humains + bots)
  const pgs = await prisma.playerGame.findMany({
    where: { gameId },
    select: { id: true, playerId: true },
  });

  // MAJ des ids côté clients connectés (les bots n'ont pas de socket)
  const mapByPlayer = new Map<string, string>(pgs.map((x) => [x.playerId, x.id]));
  for (const [sid, c] of clients) {
    if (c.roomId !== roomId) continue;
    const newPgId = mapByPlayer.get(c.playerId);
    if (newPgId) {
      c.playerGameId = newPgId;
      c.gameId = gameId;
      const s = io.sockets.sockets.get(sid);
      if (s) s.data.gameId = gameId;
    }
  }

  return pgs;
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export async function getOrCreateCurrentGame(prisma: PrismaClient, roomId: string) {
    // Si une partie est en cours, on la garde.
    const running = await prisma.game.findFirst({ where: { roomId, state: "running" }, orderBy: { createdAt: "desc" } });
    if (running) return running;

    await prisma.game.updateMany({ where: { roomId, state: { in: ["lobby", "ended"] } }, data: { state: "ended" } });

    // Crée une nouvelle partie prête à démarrer
    const fresh = await prisma.game.create({ data: { roomId, state: "lobby" } });
    return fresh;
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
// crée la prochaine game dans la room et recopie les joueurs (PlayerGame)
export async function createNextGameFrom(prisma: PrismaClient, gameId: string): Promise<{ gameId: string }> {
    const oldGame = await prisma.game.findUnique({ where: { id: gameId } });
    if (!oldGame) throw new Error("Old game not found");

    const pgs: { playerId: string }[] = await prisma.playerGame.findMany({
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