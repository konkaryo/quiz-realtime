// server/src/domain/bot/traffic.ts

import { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import type { Client } from "../../types";
import { ensureBotsForRoomIfPublic } from "./bot.service";

export const HOURLY_TRAFFIC: number[] = [
  0.3, // 00:00
  0.2, // 01
  0.1, // 02
  0.1, // 03
  0.1, // 04
  0.1, // 05
  0.1, // 06
  0.2, // 07
  0.3, // 08
  0.4, // 09
  0.4, // 10
  0.5, // 11
  0.6, // 12
  0.6, // 13
  0.5, // 14
  0.5, // 15
  0.6, // 16
  0.7, // 17
  0.8, // 18
  0.9, // 19
  0.9, // 20
  0.7, // 21
  0.6, // 22
  0.4, // 23
];

type Daypart = "night" | "morning" | "afternoon" | "evening";
type RoomMinimal = { id: string; visibility: "PUBLIC" | "PRIVATE"; traffic: number };

const HOUR_TO_DAYPART: Daypart[] = [
  "night","night","night","night","night","night", // 0–5
  "morning","morning","morning","morning","morning","morning", // 6–11
  "afternoon","afternoon","afternoon","afternoon","afternoon","afternoon", // 12–17
  "evening","evening","evening","evening","evening","evening", // 18–23
];

type SessionCounter = { played: number; target: number };

const sessionGamesByPgId: Map<string, SessionCounter> = new Map();

function sampleGamesBeforeDisconnect(): number {
  const x = Math.floor(Math.random() * 10001); // 0–10000
  const p = x / 100;                           // 0–100
  const normalizedP = Math.min(0.999999, p / 100); // ramené sur [0,1[
  const n = 3.5 * Math.pow(-Math.log(1 - normalizedP), 1 / 0.9);
  return Math.max(1, Math.round(n));
}

function getOrInitSessionCounter(pgId: string): SessionCounter {
  let counter = sessionGamesByPgId.get(pgId);
  if (!counter) {
    counter = { played: 0, target: sampleGamesBeforeDisconnect() };
    sessionGamesByPgId.set(pgId, counter);
  }
  return counter;
}

/* -------------------------------------------------------------------------- */
function botHourAvailability(bot: { morning: number; afternoon: number; evening: number; night: number; }, hour: number): number {
  const dp = HOUR_TO_DAYPART[hour];
  const base =
    dp === "morning" ? bot.morning :
    dp === "afternoon" ? bot.afternoon :
    dp === "evening" ? bot.evening :
    bot.night;

  // petit bruit pour éviter l’effet “marche”
  const jitter = 0.9 + Math.random() * 0.2; // ±10%
  return Math.min(1, Math.max(0, base * jitter));
}
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
function globalTargetAtHour(xMax: number, hour: number): number {
  const base = xMax * HOURLY_TRAFFIC[hour];
  const jitter = 0.95 + Math.random() * 0.1; // ±5%
  return Math.max(0, Math.round(base * jitter));
}
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
function splitByRoomsTarget<T extends { id: string; traffic: number }>(rooms: T[], globalTarget: number): Record<string, number> {
  const weights = rooms.map(r => Math.max(1, Math.min(10, r.traffic)));
  const sum = weights.reduce((a,b) => a+b, 0) || 1;
  const targets: Record<string, number> = {};
  let assigned = 0;

  rooms.forEach((r, i) => {
    const t = i === rooms.length - 1
      ? Math.max(0, globalTarget - assigned)
      : Math.round(globalTarget * (weights[i] / sum));
    targets[r.id] = t;
    assigned += t;
  });
  return targets;
}
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
// Fonction utilitaire pour lister les bots connectés à un salon
function listConnectedBotPgs(clients: Map<string, Client>, roomId: string): string[] {
  const ids: string[] = [];
  for (const c of clients.values()) {
    if (c.roomId === roomId && c.playerId && c.socketId.startsWith("bot:")) {
      ids.push(c.playerGameId);
    }
  }
  return ids;
}
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
// P(connexion) ∝ manque et prob horaire du bot
function pConnect(need: number, targetRoom: number, botAvail: number) {
  if (need <= 0) return 0;
  const fill = Math.min(1, need / Math.max(1, targetRoom));
  return Math.max(0, Math.min(0.95, 0.15 + 0.6 * fill)) * botAvail; // 0.15–0.75 modulé par dispo bot
}
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
export async function rebalanceBotsAfterGame(opts: {
  prisma: PrismaClient;
  io: Server;
  clients: Map<string, Client>;
  room: RoomMinimal;
  gameId: string; 
  xMax: number;           // affluence max globale
  hour?: number;          // heure 0..23 (par défaut l’heure système côté serveur)
}) {
  const { prisma, io, clients, room, gameId, xMax } = opts;
  if (room.visibility !== "PUBLIC") return;

  const hour = typeof opts.hour === "number" ? opts.hour : new Date().getHours();
  const globalTarget = globalTargetAtHour(xMax, hour);

  // On ne rééquilibre que ce salon (pas besoin de tout lire en DB ici) :
  const roomTarget = splitByRoomsTarget([room], globalTarget)[room.id];

  const botPgIds = listConnectedBotPgs(clients, room.id);
  let current = botPgIds.length;

  // Marque: on note qu'une partie s'est finie → inc pour tous les bots présents
  for (const pgId of botPgIds) {
    const counter = getOrInitSessionCounter(pgId);
    counter.played += 1;
  }

  // Les bots sortent dès qu'ils ont atteint leur quota de parties
  const toDisconnect = botPgIds.filter((pgId) => {
    const counter = sessionGamesByPgId.get(pgId);
    return counter ? counter.played >= counter.target : false;
  });

  let removed = 0;
  for (const pgId of toDisconnect) {
    for (const [sid, c] of clients) {
      if (c.playerGameId === pgId) {
        clients.delete(sid);
        sessionGamesByPgId.delete(pgId);
        removed++;
        break;
      }
    }
  }
  if (removed > 0) {
    current -= removed;
    io.to(room.id).emit("lobby_update");
  }

  const need = roomTarget - current;

  if (need > 0) {
    // manque de bots → tenter d’en ajouter
    // On pioche des bots au hasard en DB et on filtre par dispo horaire
    const candidates = await prisma.$queryRaw<
      { id: string; name: string; playerId: string | null; morning: number; afternoon: number; evening: number; night: number }[]
    >`
      SELECT b."id", b."name", b."playerId", COALESCE(b."morning", 0.25) as "morning",
             COALESCE(b."afternoon", 0.25) as "afternoon",
             COALESCE(b."evening", 0.25) as "evening",
             COALESCE(b."night", 0.25) as "night"
      FROM "Bot" b
      ORDER BY random() LIMIT ${Math.max(need * 3, 10)};
    `;

    let added = 0;
    for (const cand of candidates) {
      const avail = botHourAvailability({
        morning: cand.morning, afternoon: cand.afternoon, evening: cand.evening, night: cand.night
      }, hour);
      const p = pConnect(need - added, roomTarget, avail);
      if (Math.random() < p) {
        // attacher 1 bot (réutilise ta fonction existante)
        const attached = await ensureBotsForRoomIfPublic(prisma, io, clients, { id: room.id, visibility: "PUBLIC" }, { id: gameId}, 1);
        for (const { id } of attached) {
          if (!sessionGamesByPgId.has(id)) {
            sessionGamesByPgId.set(id, { played: 0, target: sampleGamesBeforeDisconnect() });
          }
        }
        added += attached.length;
      }
      if (added >= need) break;
    }
    if (added > 0) io.to(room.id).emit("lobby_update");
  }
}
/* -------------------------------------------------------------------------- */