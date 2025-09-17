import fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { Server } from "socket.io";
import { PrismaClient, Prisma } from "@prisma/client";
import type { Client, GameState } from "./types";
import * as helpers from "./helpers";
import fastifyCookie from "@fastify/cookie";
import { authRoutes } from "./routes/auth";

const prisma = new PrismaClient();

const PORT = Number(process.env.PORT || 3001);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const IMG_DIR = process.env.IMG_DIR || path.join(process.cwd(), "img");

const clients = new Map<string, Client>();
const gameStates = new Map<string, GameState>();

/* ---------------------- server ---------------------- */
async function main() {
  const app = fastify({ logger: true });

  await app.register(cors, { origin: CLIENT_URL, credentials: true });
  await app.register(fastifyStatic, {
    root: path.resolve(IMG_DIR),
    prefix: "/img/",
    decorateReply: false,
  });
  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || "dev-secret",
    hook: "onRequest"
  });
  await app.register(authRoutes({ prisma }), { prefix: "/auth" });

  app.get("/health", async () => ({ ok: true }));

  app.post("/rooms", async (req, reply) => {
    const code = helpers.genCode();
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const room = await tx.room.create({ data: { code } });
      await tx.game.create({ data: { roomId: room.id, state: "lobby" } });
      return { id: room.id };
    });
    return reply.code(201).send({ result });
  });

  app.get("/rooms/:id", async (req, reply) => {
    const id = (req.params as any).id as string;
    const room = await prisma.room.findUnique({ where: { id }, select: { id: true, code: true } });
    if (!room) return reply.code(404).send({ error: "Room not found" });
    return { room };
  });

  app.get("/rooms", async () => {
    const rooms = await prisma.room.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });
    return { rooms };
  });

  const io = new Server(app.server, {
    path: "/socket.io",
    cors: { origin: CLIENT_URL, methods: ["GET", "POST"], credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const sid = helpers.getCookie("sid", socket.handshake.headers.cookie);
      if (!sid) return next(new Error("unauthorized"));

      const session = await prisma.session.findUnique({ where: { token: sid }, select: { userId: true, expiresAt: true } });
      if (!session || session.expiresAt.getTime() < Date.now()) { return next(new Error("unauthorized")); }

      socket.data.userId = session.userId;

      return next();
    } catch (e) { return next(new Error("unauthorized")); }
  });

  io.on("connection", (socket) => {
    socket.emit("welcome", { id: socket.id });

    socket.on("join_game", async (p: { code: string; }) => {
      try {
        const roomCode = (p.code || "").trim().toUpperCase();
        if (!roomCode) return socket.emit("error_msg", "Missing room code");

        const userId = socket.data.userId as string | undefined;
        if (!userId) return socket.emit("error_msg", "Not authenticated");
        
        const room = await prisma.room.findUnique({ where: { code: roomCode } });
        if (!room) return socket.emit("error_msg", "Room not found.");

        const game = await helpers.getOrCreateCurrentGame(prisma, room.id);

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true, email: true } });
        if (!user) return socket.emit("error_msg", "User not found.");

        const playerName = user.displayName.trim();

        const player = await prisma.player.upsert({
          where: { userId: user.id },
          update: { name: playerName },
          create: { userId: user.id, name: playerName }
        });

        const pg = await prisma.playerGame.upsert({
          where: { gameId_playerId: { gameId: game.id, playerId: player.id } },
          update: {},
          create: { gameId: game.id, playerId: player.id, score: 0 }
        });

        clients.set(socket.id, {
          socketId: socket.id,
          playerId: player.id,
          playerGameId: pg.id,
          gameId: game.id,
          roomId: room.id,
          name: player.name
        });

        socket.data.roomId = room.id;
        socket.data.gameId = game.id;

        socket.join(room.id);
        io.to(room.id).emit("lobby_update");
        socket.emit("joined", { playerGameId: pg.id, name: player.name, roomId: room.id });
      } catch (err) {
        console.error("[join_game] error", err);
        socket.emit("error_msg", "Server error.");
      }
    });

    socket.on("start_game", async () => {
      const roomId = socket.data.roomId;
      if (!roomId) return socket.emit("error_msg", "Not in a room");
      try {
        await helpers.startGameForRoom(clients, gameStates, io, prisma, roomId);
        socket.emit("info_msg", "Game started");
      } catch (e) {
        console.error("[start_game error]", e);
        socket.emit("error_msg", "Server error");
      }
    });

    // ---- SUBMIT ANSWER (MC) ----
    socket.on(
      "submit_answer",
      async (p: { code: string; choiceId: string }, ack?: (res: { ok: boolean; reason?: string }) => void) => {
        const client = clients.get(socket.id);
        if (!client) return ack?.({ ok: false, reason: "no-client" });

        const st = gameStates.get(client.roomId);
        if (!st) return ack?.({ ok: false, reason: "no-state" });
        if (!st.endsAt || Date.now() > st.endsAt) {
          console.log("[submit_answer] late", { socket: socket.id, pg: client.playerGameId });
          return ack?.({ ok: false, reason: "too-late" });
        }
        if (st.answeredThisRound.has(client.playerGameId)) {
          console.log("[submit_answer] already-answered", { socket: socket.id, pg: client.playerGameId });
          return ack?.({ ok: false, reason: "already-answered" });
        }

        const q = st.questions[st.index];
        if (!q) return ack?.({ ok: false, reason: "no-question" });

        const choice = q.choices.find((c) => c.id === p.choiceId);
        if (!choice) return ack?.({ ok: false, reason: "bad-choice" });

        st.answeredThisRound.add(client.playerGameId);

        const AUTO_ENERGY_GAIN = Number(process.env.AUTO_ENERGY_GAIN || 5);
        const MC_ANSWER_ENERGY_GAIN = Number(process.env.MC_ANSWER_ENERGY_GAIN || 5);
        const MC_ANSWER_POINTS_GAIN = Number(process.env.MC_ANSWER_POINTS_GAIN || 100);
        const gain = AUTO_ENERGY_GAIN + (choice.isCorrect ? MC_ANSWER_ENERGY_GAIN : 0);

        const res = await helpers.addEnergy(prisma, client, gain);
        if (!res.ok) return ack?.({ ok: false, reason: "no-player" });

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.answer.create({
            data: { playerGameId: client.playerGameId, text: choice.label, correct: choice.isCorrect },
          });
          await tx.playerGame.update({
            where: { id: client.playerGameId },
            data: { energy: res.energy, score: { increment: choice.isCorrect ? MC_ANSWER_POINTS_GAIN : 0 } },
          });
        });

        socket.emit("energy_update", { energy: res.energy, multiplier: helpers.scoreMultiplier(res.energy) });

        const lb = await helpers.buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds));
        io.to(client.roomId).emit("leaderboard_update", { leaderboard: lb });

        ack?.({ ok: true });

        const correctChoice = q.choices.find((c) => c.isCorrect) || null;
        socket.emit("answer_feedback", {
          correct: !!choice.isCorrect,
          correctChoiceId: correctChoice ? correctChoice.id : null,
          correctLabel: correctChoice ? correctChoice.label : null,
        });

        io.to(client.roomId).emit("answer_received");
      }
    );

    // ---- SUBMIT ANSWER (TEXT + vies) ----
    socket.on(
      "submit_answer_text",
      async (p: { text: string }, ack?: (res: { ok: boolean; reason?: string }) => void) => {
        const client = clients.get(socket.id);
        if (!client) return ack?.({ ok: false, reason: "no-client" });

        const st = gameStates.get(client.roomId);
        if (!st) return ack?.({ ok: false, reason: "no-state" });
        if (!st.endsAt || Date.now() > st.endsAt) {
          console.log("[submit_answer_text] late", { socket: socket.id, pg: client.playerGameId });
          return ack?.({ ok: false, reason: "too-late" });
        }
        if (st.answeredThisRound.has(client.playerGameId)) {
          console.log("[submit_answer_text] already-answered", { socket: socket.id, pg: client.playerGameId });
          return ack?.({ ok: false, reason: "already-answered" });
        }

        const q = st.questions[st.index];
        if (!q) return ack?.({ ok: false, reason: "no-question" });

        const TEXT_LIVES = Number(process.env.TEXT_LIVES || 3);
        const prevAttempts = st.attemptsThisRound.get(client.playerGameId) || 0;
        if (prevAttempts >= TEXT_LIVES) {
          return ack?.({ ok: false, reason: "no-lives" });
        }

        const raw = (p.text || "").trim();
        const userNorm = helpers.norm(raw);
        if (!userNorm) return ack?.({ ok: false, reason: "empty" });

        const isCorrect = helpers.isFuzzyMatch(userNorm, q.acceptedNorms);

        // Gestion des tentatives
        let attemptsNow = prevAttempts + 1;
        const livesLeftAfter = TEXT_LIVES - attemptsNow; // vies restantes après cette tentative

        if (isCorrect || attemptsNow >= TEXT_LIVES) {
          // Bonne réponse OU plus de vies => on clôt pour ce joueur
          st.answeredThisRound.add(client.playerGameId);
        } else {
          // Mauvaise réponse et il reste des vies
          st.attemptsThisRound.set(client.playerGameId, attemptsNow);
        }

        // Énergie & score
        const playerEnergy = await helpers.getEnergy(prisma, client);
        if (!playerEnergy.ok) return ack?.({ ok: false, reason: "no-energy" });

        const AUTO_ENERGY_GAIN = Number(process.env.AUTO_ENERGY_GAIN || 5);
        const TXT_ANSWER_ENERGY_GAIN = Number(process.env.TXT_ANSWER_ENERGY_GAIN || 5);
        const TXT_ANSWER_POINTS_GAIN = Number(process.env.TXT_ANSWER_POINTS_GAIN || 100);

        const gain = AUTO_ENERGY_GAIN + (isCorrect ? TXT_ANSWER_ENERGY_GAIN : 0);

        const res = await helpers.addEnergy(prisma, client, gain);
        if (!res.ok) return ack?.({ ok: false, reason: "no-player" });

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.answer.create({
            data: { playerGameId: client.playerGameId, text: p.text, correct: isCorrect },
          });
          if (isCorrect) {
            await tx.playerGame.update({
              where: { id: client.playerGameId },
              data: {
                energy: res.energy,
                score: { increment: helpers.scoreMultiplier(playerEnergy.energy) * TXT_ANSWER_POINTS_GAIN },
              },
            });
            socket.emit("energy_update", { energy: res.energy, multiplier: helpers.scoreMultiplier(res.energy) });
          } 
        });        

        // Leaderboard live
        const lb = await helpers.buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds));
        io.to(client.roomId).emit("leaderboard_update", { leaderboard: lb });

        // ack
        ack?.({ ok: true });

        // feedback perso — NE PAS divulguer la solution tant qu’il reste des vies
        if (isCorrect || livesLeftAfter <= 0) {
          const correct = q.choices.find((c) => c.isCorrect) || null;
          socket.emit("answer_feedback", {
            correct: isCorrect,
            correctChoiceId: correct ? correct.id : null,
            correctLabel: correct ? correct.label : null,
          });
        } else {
          // encore des vies -> on n’envoie que correct=false sans solution
          socket.emit("answer_feedback", { correct: false });
        }

        io.to(client.roomId).emit("answer_received");
      }
    );

    // ---- REQUEST CHOICES (coût en énergie) ----
    socket.on("request_choices", async () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const st = gameStates.get(roomId);
      if (!st || !st.endsAt || Date.now() > st.endsAt) return;

      const client = clients.get(socket.id);
      if (!client) return;

      const MC_COST = Number(process.env.MC_COST || 5);

      const res = await helpers.spendEnergy(prisma, client, MC_COST);
      if (!res.ok) {
        return socket.emit("not_enough_energy");
      }
      socket.emit("energy_update", { energy: res.energy, multiplier: helpers.scoreMultiplier(res.energy) });

      const choices = helpers.getShuffledChoicesForSocket(st, socket.id);
      socket.emit("multiple_choice", { choices });
    });

    socket.on("disconnect", () => {
      clients.delete(socket.id);
    });
  });

  await app.listen({ port: PORT, host: "localhost" });
  app.log.info(`HTTP + WS on http://localhost:${PORT}`);
}

/* ---------------- Helpers rounds ---------------- */

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
