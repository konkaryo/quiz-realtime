import { PrismaClient, Prisma } from "@prisma/client"; 
import type { Client, RoundQuestion, GameState } from "./types";
import { Server } from "socket.io";

/* ---------------------------------------------------------------------------------------- */
export function toImgUrl(name?: string | null): string | null {
  if (!name) return null;

  if (/^https?:\/\//i.test(name) || name.startsWith("/")) { return name; }

  const cleaned = name
    .replace(/^\.?\/?img\//i, "")
    .replace(/\.(avif|webp|png|jpg|jpeg)$/i, "");

  return `/img/${encodeURIComponent(cleaned)}.avif`;
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
// game "courante" d'une room: dernier createdAt non "ended", sinon null
export async function getOrCreateCurrentGame(prisma: PrismaClient, roomId: string) {
  let game = await prisma.game.findFirst({
    where: { roomId, state: { in: ["lobby", "running"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!game) {
    game = await prisma.game.create({
      data: { roomId, state: "lobby" },
    });
  }
  return game;
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
// crée la prochaine game dans la room et recopie les joueurs (PlayerGame)
export async function createNextGameFrom(prisma: PrismaClient, gameId: string): Promise<{ gameId: string }> {
  const oldGame = await prisma.game.findUnique({ where: { id: gameId } });
  if (!oldGame) throw new Error("Old game not found");

  const pgs = await prisma.playerGame.findMany({
    where: { gameId: oldGame.id },
    select: { playerId: true },
  });

  const next = await prisma.game.create({
    data: {
      roomId: oldGame.roomId,
      state: "lobby",
      playerGames: {
        create: pgs.map((p) => ({ playerId: p.playerId, score: 0 })),
      },
    },
  });

  return { gameId: next.id };
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
// génération de code pour une "Room"
export function genCode(n = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export function clientsInRoom(clients: Map<string, Client>, roomId: string) {
  return [...clients.values()].filter(c => c.roomId === roomId);
}
/* ---------------------------------------------------------------------------------------- */


/* ---------------------------------------------------------------------------------------- */
export async function ensurePlayerGamesForRoom(clients: Map<string, Client>, gameId: string, io: Server, prisma: PrismaClient, roomId: string) {
  const members = clientsInRoom(clients, roomId);
  if (members.length === 0) return [];

  // 👇 typer le client de transaction
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
  const mapByPlayer = new Map<string, string>(
    pgs.map((x: { id: string; playerId: string }) => [x.playerId, x.id])
  );

  for (const [sid, c] of clients) {
    if (c.roomId !== roomId) continue;
    const newPgId = mapByPlayer.get(c.playerId); // string | undefined
    if (newPgId) {
      c.playerGameId = newPgId; // OK: string
      c.gameId = gameId;
      const s = io.sockets.sockets.get(sid);
      if (s) s.data.gameId = gameId;
    }
  }

  return pgs;
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export async function startGameForRoom(clients: Map<string, Client>, gameStates: Map<string, GameState>, io: Server, prisma: PrismaClient, roomId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return;

  const game = await getOrCreateCurrentGame(prisma, room.id);
  const pgs = await ensurePlayerGamesForRoom(clients, game.id, io, prisma, room.id);

  type Row = { id: string };
  const QUESTION_COUNT = Number(process.env.QUESTION_COUNT || 10);
  const picked = await prisma.$queryRaw<Row[]>`SELECT "id" FROM "Question" ORDER BY random() LIMIT ${QUESTION_COUNT};`;

  if (picked.length === 0) {
    io.to(room.id).emit("error_msg", "No questions in database.");
    return;
  }

  const qIds: string[] = picked.map((r: Row) => r.id);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const pg of pgs) {
      await tx.playerGame.update({ where: { id: pg.id }, data: { questions: { set: [] } } });
      await tx.playerGame.update({
        where: { id: pg.id },
        data: { questions: { connect: qIds.map((id: string) => ({ id })) } },
      });
    }
    await tx.game.update({ where: { id: game.id }, data: { state: "running" } });
  });
  const raw = await prisma.question.findMany({
    where: { id: { in: qIds } },
    select: {
      id: true, text: true, theme: true, difficulty: true, img: true,
      choices: { select: { id: true, label: true, isCorrect: true } },
      acceptedAnswers: { select: { norm: true } },
    },
  });

  const full: RoundQuestion[] = raw.map((q: typeof raw[number]) => {
    const correct = q.choices.find((c: typeof q.choices[number]) => c.isCorrect);
    return {
      id: q.id,
      text: q.text,
      theme: q.theme ?? null,
      difficulty: q.difficulty ?? null,
      img: toImgUrl(q.img),
      choices: q.choices,
      acceptedNorms: q.acceptedAnswers.map((a: typeof q.acceptedAnswers[number]) => a.norm),
      correctLabel: correct ? correct.label : "",
    };
  });
  const byId = new Map(full.map((q) => [q.id, q]));
  const ordered: RoundQuestion[] = qIds.map((id: string) => byId.get(id)!).filter(Boolean) as RoundQuestion[];

  // reset état mémoire pour la room
  const prev = gameStates.get(room.id);
  if (prev?.timer) clearTimeout(prev.timer);

  const st: GameState = {
    roomId: room.id,
    gameId: game.id,
    questions: ordered,
    index: 0,
    answeredThisRound: new Set(),
    pgIds: new Set(pgs.map((p: { id: string }) => p.id))
  };
  gameStates.set(room.id, st);
  await startRound(clients, gameStates, io, prisma, st);
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
function maskCorrect(q: RoundQuestion) {
  return { ...q, choices: q.choices.map((c) => ({ id: c.id, label: c.label })) };
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
async function startRound(clients: Map<string, Client>, gameStates: Map<string, GameState>, io: Server, prisma: PrismaClient, st: GameState) {
  const q = st.questions[st.index];
  if (!q) return;

  const ROUND_MS = Number(process.env.ROUND_MS || 10000); // Variable d'environnement inexistante ?

  st.answeredThisRound.clear();
  st.roundStartMs = Date.now();
  st.endsAt = st.roundStartMs + ROUND_MS;

  console.log("[round_begin]", { roomId: st.roomId, gameId: st.gameId, index: st.index, endsAt: st.endsAt });

  // ⚠️ N'ENVOIE PAS LES CHOIX
  const masked = { id: q.id, text: q.text, img: q.img, theme: q.theme, difficulty: q.difficulty };

  io.to(st.roomId).emit("round_begin", {
    index: st.index,
    total: st.questions.length,
    endsAt: st.endsAt,
    question: masked, // pas de .choices ici
  });

  buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds))
    .then(lb => io.to(st.roomId).emit("leaderboard_update", { leaderboard: lb }))
    .catch(err => console.error("[leaderboard startRound]", err));

  st.timer = setTimeout(() => {
    endRound(clients, gameStates, io, prisma, st).catch((err) => {
      console.error("[endRound error]", err);
    });
  }, ROUND_MS);
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
async function endRound(clients: Map<string, Client>, gameStates: Map<string, GameState>, io: Server, prisma: PrismaClient, st: GameState) { // Choisir entre gameStates et st ??

  const q = st.questions[st.index];
  if (!q) return;

  // ✅ Ne prendre que les joueurs liés à la Game courante
  const leaderboard = await buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds));

  const correct = q.choices.find((c) => c.isCorrect) || null;

  io.to(st.roomId).emit("round_end", {
    index: st.index,
    correctChoiceId: correct ? correct.id : null,
    correctLabel: correct ? correct.label : null,
    leaderboard
  });

  st.endsAt = undefined;

  const hasNext = st.index + 1 < st.questions.length;
  if (!hasNext) {
    await prisma.game.update({ where: { id: st.gameId }, data: { state: "ended" } });

    const { gameId: nextGameId } = await createNextGameFrom(prisma, st.gameId);

    if (st.timer) clearTimeout(st.timer);
    gameStates.delete(st.roomId);

    io.to(st.roomId).emit("game_over", {
      nextGameReady: true,
    });

    const GAP_MS = Number(process.env.GAP_MS || 3000);

    setTimeout(async () => {
      // Assigne les PlayerGame pour la nouvelle game aux joueurs connectés
      await ensurePlayerGamesForRoom(clients, nextGameId, io, prisma, st.roomId);
      // Démarre la prochaine game
      await startGameForRoom(clients, gameStates, io, prisma, st.roomId);
    }, GAP_MS);

    

    // Optionnel: auto-démarrer la prochaine game après X secondes (sinon, host clique Start)
    // -> laisse comme ça pour garder le contrôle côté host
    return;
  }

  const GAP_MS = Number(process.env.GAP_MS || 3000);
  st.index += 1;
  st.timer = setTimeout(() => {
    startRound(clients, gameStates, io, prisma, st).catch((err) => {
      console.error("[startRound error]", err);
    });
  },  GAP_MS);
}
/* ---------------------------------------------------------------------------------------- */


/* ---------------------------------------------------------------------------------------- */
// Deterministic PRNG (Mulberry32) from a 32-bit seed
function mulberry32(seed: number) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
// Simple 32-bit hash of a string (for seeding)
function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/* ---------------------------------------------------------------------------------------- */


/* ---------------------------------------------------------------------------------------- */
function seededShuffle<T>(arr: T[], seedStr: string): T[] {
  const rnd = mulberry32(hash32(seedStr));
  const copy = arr.slice();
  // Fisher–Yates with seeded RNG
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export function getShuffledChoicesForSocket(st: GameState, socketId: string) {
  const q = st.questions[st.index];
  const base = q.choices.map(c => ({ id: c.id, label: c.label })); // pas d'isCorrect
  return seededShuffle(base, `${q.id}:${socketId}`);
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export function norm(s: string): string {
  let t = (s ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/['’`´]/g, "'");
  t = t.replace(/[^a-z0-9]+/g, " ").trim();
  if (!t) return "";
  const STOP = new Set(["le","la","les","l","un","une","des","du","de","d","au","aux","et",
    "&","à","en","sur","sous","dans","par","pour","the","a","an","of"]);
  const tokens = t.split(/\s+/).filter(tok => tok && !STOP.has(tok));
  return tokens.join(" ");
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
function maxEditsFor(refLen: number): number {
  if (refLen <= 3)  return 0;           // "Lyon" → tolérance 0
  if (refLen <= 6)  return 1;           // "Paris" → 1 erreur typique
  if (refLen <= 10)  return 2;           // "Manchester" court → 2
  if (refLen <= 15) return 3;
  return Math.min(4, Math.floor(refLen * 0.15));
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
function damerauLevenshteinWithCutoff(a: string, b: string, maxEdits: number): number {
  const n = a.length, m = b.length;
  const diff = Math.abs(n - m);
  if (diff > maxEdits) return maxEdits + 1;  // impossible de rattraper

  // rangées précédentes / courantes (fenêtre bandée)
  const INF = maxEdits + 1;
  const prev = new Array(m + 1).fill(0);
  const curr = new Array(m + 1).fill(0);
  const prevPrev = new Array(m + 1).fill(0); // pour transpositions

  for (let j = 0; j <= m; j++) prev[j] = Math.min(j, INF);

  for (let i = 1; i <= n; i++) {
    // bande autour de la diagonale
    const from = Math.max(1, i - maxEdits);
    const to   = Math.min(m, i + maxEdits);

    curr[0] = Math.min(i, INF);

    // borne optimiste: si la cellule la plus "centrale" de la ligne dépasse le seuil,
    // on sortira à la fin (on garde néanmoins le calcul local)
    let rowMin = INF;

    for (let j = from; j <= to; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      let val = Math.min(
        prev[j] + 1,        // suppression
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost  // substitution
      );

      // transposition (Damerau)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, prevPrev[j - 2] + 1);
      }

      if (val > INF) val = INF;
      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }

    // si même le meilleur de la ligne dépasse le seuil → on peut couper
    if (rowMin > maxEdits) return maxEdits + 1;

    // rotation des buffers
    for (let j = 0; j <= m; j++) {
      prevPrev[j] = prev[j];
      prev[j] = curr[j];
      curr[j] = 0;
    }
  }

  const dist = prev[m];
  return dist > maxEdits ? maxEdits + 1 : dist;
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export function isFuzzyMatch(userNorm: string, accepted: string[]): boolean {
  if (!userNorm) return false;
  // 1) exact rapide
  if (accepted.includes(userNorm)) return true;

  // 2) sinon fuzzy avec early exit
  for (const acc of accepted) {
    if (!acc) continue;
    const refLen = acc.length;
    const maxEdits = maxEditsFor(refLen);
    if (Math.abs(userNorm.length - refLen) > maxEdits) continue;
    if (userNorm === acc) return true;
    const d = damerauLevenshteinWithCutoff(userNorm, acc, maxEdits);
    if (d <= maxEdits) return true;
  }
  return false;
}
/* ---------------------------------------------------------------------------------------- */

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