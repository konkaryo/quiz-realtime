import fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { Server } from "socket.io";
import { PrismaClient, Prisma } from "@prisma/client";
import type { Client, GameState } from "./types";
import * as helpers from "./helpers";

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

  io.on("connection", (socket) => {
    socket.emit("welcome", { id: socket.id });

    socket.on("join_game", async (p: { code: string; name: string }) => {
      const roomCode = (p.code || "").trim().toUpperCase();
      const name = (p.name || "").trim();
      if (!roomCode || !name) return socket.emit("error_msg", "Missing code or name.");

      const room = await prisma.room.findUnique({ where: { code: roomCode } });
      if (!room) return socket.emit("error_msg", "Room not found.");

      const game = await helpers.getOrCreateCurrentGame(prisma, room.id);

      const player = await prisma.player.create({ data: { name } });
      const pg = await prisma.playerGame.create({
        data: { gameId: game.id, playerId: player.id, score: 0 },
      });

      clients.set(socket.id, {
        socketId: socket.id,
        playerId: player.id,
        playerGameId: pg.id,
        gameId: game.id,
        roomId: room.id,
        name,
      });

      socket.data.roomId = room.id;
      socket.data.gameId = game.id;

      socket.join(room.id);
      io.to(room.id).emit("lobby_update");
      socket.emit("joined", { playerGameId: pg.id, name, roomId: room.id });
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
          } else {
            await tx.playerGame.update({
              where: { id: client.playerGameId },
              data: { energy: res.energy },
            });
          }
        });

        socket.emit("energy_update", { energy: res.energy, multiplier: helpers.scoreMultiplier(res.energy) });

        const lb = await helpers.buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds));
        io.to(client.roomId).emit("leaderboard_update", { leaderboard: lb });

        // ack
        ack?.({ ok: true });

        // feedback perso
        const correct = q.choices.find((c) => c.isCorrect) || null;
        socket.emit("answer_feedback", {
          correct: isCorrect,
          correctChoiceId: correct ? correct.id : null,
          correctLabel: correct ? correct.label : null,
        });

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

  await app.listen({ port: PORT, host: "127.0.0.1" });
  app.log.info(`HTTP + WS on http://127.0.0.1:${PORT}`);
}

/* ---------------- Helpers rounds ---------------- */

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
