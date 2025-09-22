import "dotenv/config";
import path from "path";
import fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import { Server } from "socket.io";

import { CFG } from "./config";
import { prisma } from "./infra/prisma";
import { getCookie } from "./infra/cookies";

import type { Client, GameState } from "./types";
import { authRoutes } from "./routes/auth";
import { registerSocketHandlers } from "./sockets/handlers";
import { clientsInRoom } from "./domain/room/room.service";

/* ---------------- runtime maps ---------------- */
const clients = new Map<string, Client>();
const gameStates = new Map<string, GameState>();

async function main() {
  const app = fastify({ logger: true });

  // CORS / Static / Cookies / Routes
  await app.register(cors, {
    origin(origin, cb) {
      const allowed = new Set([CFG.CLIENT_URL, "http://localhost:5173", "https://synapz.online"].filter(Boolean));
      if (!origin) return cb(null, true);
      cb(null, allowed.has(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
    strictPreflight: false,
  });

  await app.register(fastifyStatic, { root: path.resolve(CFG.IMG_DIR), prefix: "/img/", decorateReply: false });

  await app.register(fastifyCookie, { secret: process.env.COOKIE_SECRET || "dev-secret", hook: "onRequest" });

  await app.register(authRoutes({ prisma }), { prefix: "/auth" });

  app.get("/health", async () => ({ ok: true }));

  // ---------- HTTP: Rooms ----------
  app.post("/rooms", async (req, reply) => {
    try {
      // 1) Auth via cookie "sid"
      const sid = (req.cookies as any)?.sid as string | undefined;
      if (!sid) return reply.code(401).send({ error: "Unauthorized" });

      const session = await prisma.session.findUnique({
        where: { token: sid },
        select: { userId: true, expiresAt: true },
      });
      if (!session || session.expiresAt.getTime() < Date.now()) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const body = (req.body as any) ?? {};
      const raw = Number(body?.difficulty);
      const difficulty = Number.isFinite(raw) ? Math.min(10, Math.max(1, Math.round(raw))) : 5;

      // 2) Génération code room (4 chars non ambigus)
      const code = [..."ABCDEFGHJKLMNPQRSTUVWXYZ23456789"]
        .sort(() => 0.5 - Math.random())
        .slice(0, 4)
        .join("");

      // 3) Création room + game (owner = session.userId)
      const result = await prisma.$transaction(async (tx) => {
        const room = await tx.room.create({
          data: {
            code,
            ownerId: session.userId,
            difficulty
          },
          select: { id: true },
        });

        await tx.game.create({ data: { roomId: room.id, state: "lobby" } });

        return { id: room.id };
      });

      return reply.code(201).send({ result });
    } catch (e) {
      req.log.error(e, "POST /rooms failed");
      return reply.code(500).send({ error: "Server error" });
    }
  });

  app.get("/rooms/:id", async (req, reply) => {
    const id = (req.params as any).id as string;
    const room = await prisma.room.findUnique({
      where: { id },
      select: { id: true, code: true, status: true },
    });
    if (!room) return reply.code(404).send({ error: "Room not found" });
    if (room.status === "CLOSED") { return reply.code(410).send({ error: "Room closed" }); }
    return { room };
  });

  app.get("/rooms", async (_req, reply) => {
    const rows = await prisma.room.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        difficulty: true,
        owner: { select: { id: true, displayName: true } },
      },
    });
    const rooms = rows.map((r) => ({
      ...r,
      playerCount: clientsInRoom(clients, r.id).length,
    }));
    reply.send({ rooms });
  });

  app.delete("/rooms/:id", async (req, reply) => {
    try {
      const sid = (req.cookies as any)?.sid as string | undefined;
      if (!sid) return reply.code(401).send({ error: "Unauthorized" });

      const session = await prisma.session.findUnique({
        where: { token: sid },
        select: { userId: true, expiresAt: true },
      });
      if (!session || session.expiresAt.getTime() < Date.now()) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true, role: true },
      });
      if (!user) return reply.code(401).send({ error: "Unauthorized" });

      const id = (req.params as any).id as string;
      const room = await prisma.room.findUnique({
        where: { id },
        select: { id: true, ownerId: true, status: true },
      });
      if (!room) return reply.code(404).send({ error: "Room not found" });
      if (room.status === "CLOSED") return reply.code(204).send();

      const isOwner = room.ownerId === user.id;
      const isAdmin = user.role === "ADMIN";
      if (!isOwner && !isAdmin) return reply.code(403).send({ error: "Forbidden" });

      // 1) Marque la room fermée
      await prisma.room.update({
        where: { id },
        data: { status: "CLOSED", closedAt: new Date() },
      });

      // 2) Arrête le jeu runtime + notifie
      const st = gameStates.get(id);
      if (st?.timer) clearTimeout(st.timer);
      gameStates.delete(id);

      io.to(id).emit("room_closed", { roomId: id });
      io.in(id).socketsLeave(id);

      // 3) (Optionnel) basculer les Game liés en "closed"
      await prisma.game.updateMany({
        where: { roomId: id },
        data: { state: "closed" },
      });

      return reply.code(204).send();
    } catch (e) {
      req.log.error(e, "DELETE /rooms/:id (soft close) failed");
      return reply.code(500).send({ error: "Server error" });
    }
  });

  // ---------- Socket.IO ----------
  const io = new Server(app.server, {
    path: "/socket.io",
    cors: { origin: CFG.CLIENT_URL, methods: ["GET", "POST"], credentials: true },
  });

  // Auth middleware (via cookie "sid")
  io.use(async (socket, next) => {
    try {
      const sid = getCookie("sid", socket.handshake.headers.cookie);
      if (!sid) return next(new Error("unauthorized"));

      const session = await prisma.session.findUnique({
        where: { token: sid },
        select: { userId: true, expiresAt: true },
      });
      if (!session || session.expiresAt.getTime() < Date.now()) {
        return next(new Error("unauthorized"));
      }

      socket.data.userId = session.userId;
      next();
    } catch (e) {
      next(new Error("unauthorized"));
    }
  });

  // Register all socket handlers
  registerSocketHandlers(io, clients, gameStates);

  await app.listen({ port: CFG.PORT, host: "localhost" });
  app.log.info(`HTTP + WS on http://localhost:${CFG.PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
