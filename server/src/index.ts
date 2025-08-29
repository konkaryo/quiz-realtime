import fastify from "fastify";
import cors from "@fastify/cors";
import * as dotenv from "dotenv";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";

dotenv.config();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 3000);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

type Client = { id: string; name: string; playerId: string; gameId: string };

async function main() {
  const app = fastify({ logger: true });
  await app.register(cors, { origin: CLIENT_URL, credentials: true });
  app.get("/health", async () => ({ ok: true }));

  const io = new Server(app.server, {
    cors: { origin: CLIENT_URL, methods: ["GET","POST"], credentials: true },
  });

  const clientMap = new Map<string, Client>();

  io.on("connection", (socket) => {
    socket.emit("welcome", { id: socket.id });

    socket.on("join_game", async (p: { code: string; name: string }) => {
      const game = await prisma.game.findUnique({ where: { code: p.code.toUpperCase() }});
      if (!game) return socket.emit("error_msg", "Game not found");

      const player = await prisma.player.create({
        data: { name: p.name, gameId: game.id }
      });

      clientMap.set(socket.id, { id: socket.id, name: p.name, playerId: player.id, gameId: game.id });
      socket.join(game.code);
      io.to(game.code).emit("lobby_update");
    });

    socket.on("start_game", async (code: string) => {
      const game = await prisma.game.update({ where: { code }, data: { state: "running" }});
      const questions = await prisma.question.findMany({
        where: { gameId: game.id },
        orderBy: { order: "asc" },
        include: { choices: true }
      });
      io.to(code).emit("round_begin", { index: 0, question: maskCorrect(questions[0]) });
    });

    socket.on("submit_answer", async (p: { code: string; questionId: string; choiceId: string }) => {
      const client = clientMap.get(socket.id);
      if (!client) return;

      await prisma.answer.create({
        data: { playerId: client.playerId, questionId: p.questionId, choiceId: p.choiceId }
      });

      const q = await prisma.question.findUnique({ where: { id: p.questionId }});
      if (q && q.correctId === p.choiceId) {
        await prisma.player.update({ where: { id: client.playerId }, data: { score: { increment: 1 } }});
      }

      io.to(p.code).emit("answer_received");
    });

    socket.on("disconnect", () => {
      clientMap.delete(socket.id);
    });
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`HTTP + WS on http://localhost:${PORT}`);
}

function maskCorrect(q: any) {
  if (!q) return q;
  const { correctId, ...rest } = q;
  return rest;
}

main();
