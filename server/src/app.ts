import "dotenv/config";
import path from "path";
import fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import { Server } from "socket.io";
import { z } from "zod";
import { CFG } from "./config";
import { prisma } from "./infra/prisma";
import { getCookie } from "./infra/cookies";

import type { Client, GameState } from "./types";
import { authRoutes } from "./routes/auth";
import { dailyRoutes } from "./routes/daily";
import { leaderboardRoutes } from "./routes/leaderboard";
import { playerRoutes } from "./routes/players";
import { registerSocketHandlers } from "./sockets/handlers";
import { clientsInRoom, isCodeValid, genCode, genRoomId, getNextArenaRoomName } from "./domain/room/room.service";
import { getInterfaceImages, resolveRoomImage } from "./domain/room/room-images";
import { raceRoutes } from "./routes/race";
import { Theme, RoomVisibility } from "@prisma/client";

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
  await app.register(dailyRoutes({ prisma }), { prefix: "/daily" });
  await app.register(leaderboardRoutes({ prisma }), { prefix: "/leaderboard" });
  await app.register(playerRoutes({ prisma }), { prefix: "/players" });
  await app.register(raceRoutes({ prisma }), { prefix: "/race" });

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

      const Body = z.object({
        difficulty:    z.number().int().min(0).max(100).optional(),
        bannedThemes:  z.array(z.nativeEnum(Theme)).optional(),
        questionCount: z.number().int().min(10).max(30).optional(),
        roundSeconds:  z.number().int().min(10).max(30).optional(),
        code:          z.string().trim().toUpperCase().optional(),
        visibility:    z.nativeEnum(RoomVisibility).optional(),
      });
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) { return reply.code(400).send({ error: parsed.error.message }); }
      const {
        difficulty = 50,
        bannedThemes = [],
        questionCount = 10,
        roundSeconds = 10,
        code: requestedCodeRaw,
        visibility = RoomVisibility.PRIVATE,
      } = parsed.data;

      const roundMs = roundSeconds * 1000;

      const requestedCode = (requestedCodeRaw || "").toUpperCase().trim();
      const useRequested = requestedCode && isCodeValid(requestedCode);
      const code = useRequested ? requestedCode : "AAAA";
      const roomId = genRoomId();

      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true },
      });
      if (!user) return reply.code(401).send({ error: "Unauthorized" });

      const interfaceImages = getInterfaceImages();
      const roomImage =
        visibility === "PUBLIC"
          ? resolveRoomImage(roomId, interfaceImages)
          : null;

      // 3) Création room + game (owner = session.userId)
      const result = await prisma.$transaction(async (tx) => {
        const roomName = await getNextArenaRoomName(tx);
        const room = await tx.room.create({
          data: {
            id: roomId,
            code,
            ownerId: session.userId,
            name: roomName,
            difficulty,
            bannedThemes,
            questionCount,
            roundMs,
            visibility,
            image: roomImage,
          },
          select: { id: true },
        });

        await tx.game.create({ data: { roomId: room.id, state: "lobby" } });

        return { id: room.id };
      });

      return reply.code(201).send({ result });
    } catch (e) {
      req.log.error(e, "[POST /rooms] failed");
      return reply.code(500).send({ error: "Server error" });
    }
  });

  app.get("/rooms/:id", async (req, reply) => {
    const id = (req.params as any).id as string;
    const room = await prisma.room.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        status: true,
        visibility: true,
        name: true,
        image: true,
        difficulty: true,
        questionCount: true,
        roundMs: true,
        bannedThemes: true,
      },
    });
    if (!room) return reply.code(404).send({ error: "Room not found" });
    if (room.status === "CLOSED") {
      return reply.code(410).send({ error: "Room closed" });
    }

    const normalizedImage = normalizeRoomImage(room.image);
    const resolvedImage =
      normalizedImage ??
      (room.visibility === "PUBLIC"
        ? resolveRoomImage(room.id, getInterfaceImages())
        : null);

    if (resolvedImage && normalizedImage !== resolvedImage) {
      await prisma.room.update({
        where: { id: room.id },
        data: { image: resolvedImage },
      });
    }

    return { room: { ...room, image: resolvedImage } };
  });

  app.get("/rooms/new-code", async (_req, reply) => {
    try {
      // On tente quelques fois pour éviter un code déjà pris (unicité DB)
      for (let i = 0; i < 8; i++) {
        const code = genCode(4);
        const existing = await prisma.room.findUnique({ where: { code, status: 'OPEN' }, select: { id: true } });
        if (!existing) { return reply.send({ code }); }
      }
      return reply.code(503).send({ error: "no_code_available" });
    } catch (e) { return reply.code(500).send({ error: "Server error" }); }
  });

  app.post("/rooms/resolve", async (req, reply) => {
    try {
      const Body = z.object({ code: z.string().trim().toUpperCase().length(4) });
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Bad code" });

      const code = parsed.data.code;
      if (!isCodeValid(code)) return reply.code(400).send({ error: "Bad code" });

      const room = await prisma.room.findUnique({ where: { code }, select: { id: true, status: true, code: true } });

      if (!room) return reply.code(404).send({ error: "Room not found" });
      if (room.status === "CLOSED") return reply.code(410).send({ error: "Room closed" });

      return reply.send({ roomId: room.id, room: { id: room.id } });
    } catch (e) { return reply.code(500).send({ error: "Server error" }); }
  });

  function normalizeRoomImage(image: string | null) {
    if (!image) return null;
    const base = path.basename(image);
    return base.replace(/\.avif$/i, "");
  }

  app.get("/rooms", async (req, reply) => {
    // 1) Qui est connecté ? (optionnel : si pas de cookie => userId=null)
    const sid = (req.cookies as any)?.sid as string | undefined;
    let userId: string | null = null;
    let userRole: "USER" | "ADMIN" | null = null;
    if (sid) {
      const session = await prisma.session.findUnique({
        where: { token: sid },
        select: { userId: true, expiresAt: true },
      });
      if (session && session.expiresAt.getTime() > Date.now()) {
        const u = await prisma.user.findUnique({
          where: { id: session.userId },
          select: { id: true, role: true },
        });
        if (u) {
          userId = u.id;
          // @ts-ignore enum Prisma
          userRole = (u.role as any) ?? "USER";
        }
      }
    }

    // 2) Liste des rooms ouvertes
    const rows = await prisma.room.findMany({
      where: { status: "OPEN", visibility: "PUBLIC" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        difficulty: true,
        image: true,
        owner: { select: { id: true, displayName: true } },
      },
    });

    // 3) Ajoute canClose selon user courant (owner ou ADMIN)
    const interfaceImages = getInterfaceImages();
    const updates: { id: string; image: string }[] = [];
    const rooms = rows.map((r) => {
      const normalizedImage = normalizeRoomImage(r.image);
      const resolvedImage = normalizedImage ?? resolveRoomImage(r.id, interfaceImages);
      if (resolvedImage && normalizedImage !== resolvedImage) {
        updates.push({ id: r.id, image: resolvedImage });
      }
      return {
        ...r,
        image: resolvedImage,
        playerCount: clientsInRoom(clients, r.id).length,
        canClose:
          (!!userId && r.owner?.id === userId) ||
          userRole === "ADMIN",
      };
    });

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((r) => prisma.room.update({ where: { id: r.id }, data: { image: r.image } })),
      );
    }

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
