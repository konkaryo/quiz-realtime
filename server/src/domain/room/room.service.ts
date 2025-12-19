//server/src/domain/room/room.service.ts
import { PrismaClient, Prisma } from "@prisma/client"; 
import type { Client } from "../../types";
import { Server } from "socket.io";
import { randomInt } from "crypto";

/* ---------------------------------------------------------------------------------------- */
// génération de code pour une "Room"
export function genCode(n = 4) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
const ROOM_ID_LENGTH = 16;
const ROOM_ID_GROUP_SIZE = 4;
const ROOM_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz"; // sans i, l, o
const ROOM_ID_DIGITS = "0123456789";

export function genRoomId() {
  const chars: string[] = [];

  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    const pool = randomInt(2) === 0 ? ROOM_ID_DIGITS : ROOM_ID_ALPHABET;
    chars.push(pool[randomInt(pool.length)]);
  }

  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += ROOM_ID_GROUP_SIZE) {
    groups.push(chars.slice(i, i + ROOM_ID_GROUP_SIZE).join(""));
  }

  return groups.join("-");
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
  // joueurs actuellement connectés (humains ET bots déjà “branchés” dans clients)
  const members = clientsInRoom(clients, roomId);

  // upsert pour tous les membres présents
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const m of members) {
      await tx.playerGame.upsert({
        where: { gameId_playerId: { gameId, playerId: m.playerId } },
        update: {},
        create: { gameId, playerId: m.playerId, score: 0 },
      });
    }
  });

  // retourne tous les PG de la game (ceux des membres présents)
  const pgs = await prisma.playerGame.findMany({
    where: { gameId },
    select: { id: true, playerId: true },
  });

  // MAJ des ids côté clients connectés (humains et bots)
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