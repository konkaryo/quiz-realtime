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
import { awardPendingDailyChallengeBitRewards } from "./domain/daily/daily-score.service";
import { scheduleDailyChallengeBotSimulations } from "./domain/daily/daily-bot-simulation.service";
import { leaderboardRoutes } from "./routes/leaderboard";
import { playerRoutes } from "./routes/players";
import { registerSocketHandlers } from "./sockets/handlers";
import { clientsInRoom, isCodeValid, genCode, genRoomId, getNextArenaRoomName } from "./domain/room/room.service";
import { getInterfaceImages, resolveRoomImage } from "./domain/room/room-images";
import { emitPublicRoomsUpdated } from "./domain/room/public-room-events";
import { questionRoutes } from "./routes/questions";
import { notificationRoutes } from "./routes/notifications";
import { adminRoutes } from "./routes/admin";
import { Theme, RoomVisibility } from "@prisma/client";
import { toProfileUrl } from "./domain/media/media.service";
import { startPublicBotTraffic } from "./domain/bot/traffic";
import { startGameForRoom } from "./domain/game/game.service";
import { HTTP_LIMITS, installSocketRateLimits, opaqueSessionKey, rateLimiter, rateLimitPreHandler, requestIpKey } from "./security/rate-limit";
import { identifierSchema, roomCodeSchema } from "./security/input-validation";

/* ---------------- runtime maps ---------------- */
const clients = new Map<string, Client>();
const gameStates = new Map<string, GameState>();

function utcDateIso(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function msUntilNextUtcDay(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
}

async function getManualQuestionLaunch(roomId: string) {
  const rows = await prisma.$queryRaw<Array<{ manualQuestionLaunch: boolean }>>`
    SELECT "manualQuestionLaunch" FROM "Room" WHERE "id" = ${roomId} LIMIT 1
  `;
  return rows[0]?.manualQuestionLaunch ?? false;
}

async function getSpeedBonusEnabled(roomId: string) {
  const rows = await prisma.$queryRaw<Array<{ speedBonusEnabled: boolean }>>`
    SELECT "speedBonusEnabled" FROM "Room" WHERE "id" = ${roomId} LIMIT 1
  `;
  return rows[0]?.speedBonusEnabled ?? true;
}

async function main() {
  const app = fastify({
    logger: true,
    bodyLimit: 1024 * 1024,
    // Caddy is expected on the same host/container network namespace. Only a
    // direct loopback peer may supply forwarding headers; public peers cannot.
    trustProxy: (address) => address === "127.0.0.1" || address === "::1",
  });

  setInterval(() => rateLimiter.sweep(), 60_000).unref();
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health" || req.url.startsWith("/img/") || req.url.startsWith("/socket.io/")) return;
    const result = rateLimiter.consume(HTTP_LIMITS.global, requestIpKey(req));
    reply.header("RateLimit-Limit", HTTP_LIMITS.global.max)
      .header("RateLimit-Remaining", result.remaining)
      .header("RateLimit-Reset", Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)));
    if (result.allowed) return;
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    req.log.warn({ rateLimit: HTTP_LIMITS.global.name, ip: requestIpKey(req) }, "HTTP global rate limit exceeded");
    return reply.header("Retry-After", retryAfter).code(429).send({ error: "too-many-requests" });
  });

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
  await app.register(questionRoutes({ prisma }), { prefix: "/questions" });
  await app.register(notificationRoutes({ prisma }), { prefix: "/notifications" });
  await app.register(adminRoutes({ prisma }), { prefix: "/admin" });

  const runDailyRewardJob = () => {
    awardPendingDailyChallengeBitRewards(prisma).catch((err) =>
      app.log.error({ err }, "daily challenge bit reward job failed"),
    );
  };
  runDailyRewardJob();
  setInterval(runDailyRewardJob, 60 * 60 * 1000).unref();

  const planDailyBotSimulations = () => {
    const dateIso = utcDateIso();
    scheduleDailyChallengeBotSimulations(prisma, dateIso, (err, botId) =>
      app.log.error({ err, botId, dateIso }, "daily challenge bot simulation failed"),
    )
      .then((schedule) => app.log.info({ dateIso, scheduled: schedule.participantCount }, "daily challenge bot simulations scheduled"))
      .catch((err) => {
        if (err instanceof Error && err.message === "daily_challenge_not_found") return;
        app.log.error({ err, dateIso }, "daily challenge bot scheduling failed");
      });
  };
  const planDailyBotSimulationsLoop = () => {
    planDailyBotSimulations();
    setTimeout(planDailyBotSimulationsLoop, msUntilNextUtcDay() + 1000).unref();
  };
  planDailyBotSimulationsLoop();

  app.get("/health", async () => ({ ok: true }));

  // ---------- HTTP: Rooms ----------
  app.get("/rooms/owned/open", async (req, reply) => {
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

      const room = await prisma.room.findFirst({
        where: {
          ownerId: session.userId,
          status: "OPEN",
          visibility: RoomVisibility.PRIVATE,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, name: true },
      });

      return reply.send({ room });
    } catch (e) {
      req.log.error(e, "GET /rooms/owned/open failed");
      return reply.code(500).send({ error: "Server error" });
    }
  });

  app.post("/rooms", { preHandler: rateLimitPreHandler([{ rule: HTTP_LIMITS.roomCreateSession, key: opaqueSessionKey }]) }, async (req, reply) => {
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

      const Body = z.strictObject({
        difficulty:    z.number().int().min(0).max(100).optional(),
        bannedThemes:  z.array(z.nativeEnum(Theme)).optional(),
        questionCount: z.number().int().min(1).max(50).optional(),
        answerAttempts: z.number().int().min(1).max(4).optional(),
        qcmUses: z.number().int().min(0).max(50).optional(),
        roundSeconds:  z.number().int().min(10).max(30).optional(),
        dynamicQuestionDisplay: z.boolean().optional(),
        manualQuestionLaunch: z.boolean().optional(),
        speedBonusEnabled: z.boolean().optional(),
        code:          roomCodeSchema.optional(),
        visibility:    z.nativeEnum(RoomVisibility).optional(),
      });
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) { return reply.code(400).send({ error: parsed.error.message }); }
      const {
        difficulty = 45,
        bannedThemes = [],
        questionCount = 10,
        answerAttempts = 3,
        qcmUses = 3,
        roundSeconds = 10,
        dynamicQuestionDisplay = true,
        manualQuestionLaunch = false,
        speedBonusEnabled = true,
        code: requestedCodeRaw,
        visibility = RoomVisibility.PRIVATE,
      } = parsed.data;

      const roundMs = roundSeconds * 1000;

      const code = requestedCodeRaw ?? "AAAA";
      const roomId = genRoomId();

      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true },
      });
      if (!user) return reply.code(401).send({ error: "Unauthorized" });

      const existingOwnedRoom = await prisma.room.findFirst({
        where: {
          ownerId: session.userId,
          status: "OPEN",
          visibility: RoomVisibility.PRIVATE,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, name: true },
      });
      if (visibility === RoomVisibility.PRIVATE && existingOwnedRoom) {
        return reply.code(200).send({ result: existingOwnedRoom, existing: true });
      }

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
            answerAttempts,
            qcmUses: Math.min(qcmUses, questionCount),
            roundMs,
            dynamicQuestionDisplay,
            visibility,
            image: roomImage,
          },
          select: { id: true, name: true },
        });

        await tx.$executeRaw`UPDATE "Room" SET "manualQuestionLaunch" = ${manualQuestionLaunch}, "speedBonusEnabled" = ${speedBonusEnabled} WHERE "id" = ${room.id}`;

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
    const parsedParams = z.strictObject({ id: identifierSchema }).safeParse(req.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "invalid_room_id" });
    const id = parsedParams.data.id;
    const room = await prisma.room.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        status: true,
        visibility: true,
        name: true,
        image: true,
        ownerId: true,
        difficulty: true,
        questionCount: true,
        answerAttempts: true,
        qcmUses: true,
        roundMs: true,
        bannedThemes: true,
        dynamicQuestionDisplay: true,
      },
    });
    if (!room) return reply.code(404).send({ error: "Room not found" });
    if (room.status === "CLOSED") {
      return reply.code(410).send({ error: "Room closed" });
    }

    const [manualQuestionLaunch, speedBonusEnabled] = await Promise.all([
      getManualQuestionLaunch(room.id),
      getSpeedBonusEnabled(room.id),
    ]);

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

    return { room: { ...room, image: resolvedImage, manualQuestionLaunch, speedBonusEnabled } };
  });

  app.patch("/rooms/:id/settings", { preHandler: rateLimitPreHandler([{ rule: HTTP_LIMITS.roomMutationSession, key: opaqueSessionKey }]) }, async (req, reply) => {
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

      const parsedParams = z.strictObject({ id: identifierSchema }).safeParse(req.params);
      if (!parsedParams.success) return reply.code(400).send({ error: "invalid_room_id" });
      const id = parsedParams.data.id;
      const room = await prisma.room.findUnique({
        where: { id },
        select: { id: true, ownerId: true, status: true, questionCount: true, qcmUses: true },
      });
      if (!room) return reply.code(404).send({ error: "Room not found" });
      if (room.status === "CLOSED") return reply.code(410).send({ error: "Room closed" });
      if (room.ownerId !== session.userId) return reply.code(403).send({ error: "Forbidden" });

      const Body = z.strictObject({
        difficulty: z.number().int().min(0).max(100).optional(),
        bannedThemes: z.array(z.nativeEnum(Theme)).optional(),
        questionCount: z.number().int().min(1).max(50).optional(),
        answerAttempts: z.number().int().min(1).max(4).optional(),
        qcmUses: z.number().int().min(0).max(50).optional(),
        roundSeconds: z.number().int().min(10).max(30).optional(),
        dynamicQuestionDisplay: z.boolean().optional(),
        manualQuestionLaunch: z.boolean().optional(),
        speedBonusEnabled: z.boolean().optional(),
      });
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

      const data: {
        difficulty?: number;
        bannedThemes?: Theme[];
        questionCount?: number;
        answerAttempts?: number;
        qcmUses?: number;
        roundMs?: number;
        dynamicQuestionDisplay?: boolean;
      } = {};
      if (typeof parsed.data.difficulty === "number") data.difficulty = parsed.data.difficulty;
      if (parsed.data.bannedThemes) data.bannedThemes = parsed.data.bannedThemes;
      if (typeof parsed.data.questionCount === "number") data.questionCount = parsed.data.questionCount;
      if (typeof parsed.data.answerAttempts === "number") data.answerAttempts = parsed.data.answerAttempts;
      if (typeof parsed.data.qcmUses === "number" || typeof parsed.data.questionCount === "number") {
        const nextQuestionCount = parsed.data.questionCount ?? room.questionCount;
        const requestedQcmUses = parsed.data.qcmUses ?? room.qcmUses;
        data.qcmUses = Math.min(requestedQcmUses, nextQuestionCount);
      }
      if (typeof parsed.data.roundSeconds === "number") data.roundMs = parsed.data.roundSeconds * 1000;
      if (typeof parsed.data.dynamicQuestionDisplay === "boolean") {
        data.dynamicQuestionDisplay = parsed.data.dynamicQuestionDisplay;
      }

      const manualQuestionLaunch = parsed.data.manualQuestionLaunch;
      const speedBonusEnabled = parsed.data.speedBonusEnabled;

      const updated = await prisma.room.update({
        where: { id },
        data,
        select: {
          id: true,
          difficulty: true,
          bannedThemes: true,
          questionCount: true,
          answerAttempts: true,
          qcmUses: true,
          roundMs: true,
          dynamicQuestionDisplay: true,
        },
      });

      if (typeof manualQuestionLaunch === "boolean" || typeof speedBonusEnabled === "boolean") {
        const nextManualQuestionLaunch = manualQuestionLaunch ?? (await getManualQuestionLaunch(id));
        const nextSpeedBonusEnabled = speedBonusEnabled ?? (await getSpeedBonusEnabled(id));
        await prisma.$executeRaw`UPDATE "Room" SET "manualQuestionLaunch" = ${nextManualQuestionLaunch}, "speedBonusEnabled" = ${nextSpeedBonusEnabled} WHERE "id" = ${id}`;
      }

      const roomPayload = {
        ...updated,
        manualQuestionLaunch: manualQuestionLaunch ?? (await getManualQuestionLaunch(id)),
        speedBonusEnabled: speedBonusEnabled ?? (await getSpeedBonusEnabled(id)),
      };
      io.to(id).emit("room_settings_updated", { room: roomPayload });
      emitPublicRoomsUpdated(io);
      return { room: roomPayload };
    } catch (e) {
      req.log.error(e, "PATCH /rooms/:id/settings failed");
      return reply.code(500).send({ error: "Server error" });
    }
  });

  app.patch("/rooms/:id/code", { preHandler: rateLimitPreHandler([{ rule: HTTP_LIMITS.roomMutationSession, key: opaqueSessionKey }]) }, async (req, reply) => {
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

      const parsedParams = z.strictObject({ id: identifierSchema }).safeParse(req.params);
      if (!parsedParams.success) return reply.code(400).send({ error: "invalid_room_id" });
      const id = parsedParams.data.id;
      const room = await prisma.room.findUnique({
        where: { id },
        select: { id: true, ownerId: true, status: true },
      });
      if (!room) return reply.code(404).send({ error: "Room not found" });
      if (room.status === "CLOSED") return reply.code(410).send({ error: "Room closed" });
      if (room.ownerId !== session.userId) return reply.code(403).send({ error: "Forbidden" });

      for (let i = 0; i < 8; i++) {
        const code = genCode(4);
        const existing = await prisma.room.findUnique({
          where: { code },
          select: { id: true },
        });
        if (existing && existing.id !== id) continue;

        const updated = await prisma.room.update({
          where: { id },
          data: { code },
          select: { id: true, code: true },
        });
        io.to(id).emit("room_code_updated", { roomId: updated.id, code: updated.code });
        emitPublicRoomsUpdated(io);
        return reply.send({ code: updated.code });
      }

      return reply.code(503).send({ error: "no_code_available" });
    } catch (e) {
      req.log.error(e, "PATCH /rooms/:id/code failed");
      return reply.code(500).send({ error: "Server error" });
    }
  });

  app.get("/rooms/new-code", { preHandler: rateLimitPreHandler([{ rule: HTTP_LIMITS.roomLookupIp, key: requestIpKey }]) }, async (_req, reply) => {
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

  app.post("/rooms/resolve", { preHandler: rateLimitPreHandler([{ rule: HTTP_LIMITS.roomLookupIp, key: requestIpKey }]) }, async (req, reply) => {
    try {
      const Body = z.strictObject({ code: roomCodeSchema });
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
        questionCount: true,
        owner: { select: { id: true, displayName: true } },
      },
    });

    // 3) Ajoute canClose selon user courant (owner ou ADMIN)
    const interfaceImages = getInterfaceImages();
    const updates: { id: string; image: string }[] = [];
    const membersByRoom = new Map(rows.map((room) => {
      const members = clientsInRoom(clients, room.id);
      const uniqueMembers = Array.from(new Map(members.map((member) => [member.playerId, member])).values());
      return [room.id, uniqueMembers] as const;
    }));
    const connectedPlayerIds = Array.from(new Set(
      Array.from(membersByRoom.values()).flatMap((members) => members.map((member) => member.playerId)),
    ));
    const connectedPlayers = connectedPlayerIds.length > 0
      ? await prisma.player.findMany({
          where: { id: { in: connectedPlayerIds } },
          select: { id: true, name: true, img: true },
        })
      : [];
    const connectedPlayersById = new Map(connectedPlayers.map((player) => [player.id, player]));
    const rooms = rows.map((r) => {
      const normalizedImage = normalizeRoomImage(r.image);
      const resolvedImage = normalizedImage ?? resolveRoomImage(r.id, interfaceImages);
      const state = gameStates.get(r.id);
      const members = membersByRoom.get(r.id) ?? [];
      const totalQuestions =
        typeof r.questionCount === "number" && Number.isFinite(r.questionCount)
          ? r.questionCount
          : Array.isArray(state?.questions)
            ? state.questions.length
            : 0;
      const progressCount = state && !state.finished
        ? Math.max(0, Math.min(state.index + 1, totalQuestions || state.questions.length))
        : 0;
      if (resolvedImage && normalizedImage !== resolvedImage) {
        updates.push({ id: r.id, image: resolvedImage });
      }
      return {
        ...r,
        image: resolvedImage,
        playerCount: members.length,
        players: members.slice(0, 3).map((member) => {
          const player = connectedPlayersById.get(member.playerId);
          return {
            id: member.playerId,
            name: player?.name ?? member.name,
            img: toProfileUrl(player?.img ?? null),
          };
        }),
        questionCount: totalQuestions,
        progressCount,
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

  app.delete("/rooms/:id", { preHandler: rateLimitPreHandler([{ rule: HTTP_LIMITS.roomMutationSession, key: opaqueSessionKey }]) }, async (req, reply) => {
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

      const parsedParams = z.strictObject({ id: identifierSchema }).safeParse(req.params);
      if (!parsedParams.success) return reply.code(400).send({ error: "invalid_room_id" });
      const id = parsedParams.data.id;
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
      emitPublicRoomsUpdated(io);

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
    maxHttpBufferSize: 64 * 1024,
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

  io.on("connection", installSocketRateLimits);

  // Register all socket handlers
  registerSocketHandlers(io, clients, gameStates);

  const stopPublicBotTraffic = startPublicBotTraffic({
    prisma,
    io,
    clients,
    gameStates,
    xMax: Number(process.env.BOT_TRAFFIC_MAX || 100),
    onBotsJoined: (roomId) => startGameForRoom(clients, gameStates, io, prisma, roomId),
  });
  app.addHook("onClose", async () => stopPublicBotTraffic());

  await app.listen({ port: CFG.PORT, host: "localhost" });
  app.log.info(`HTTP + WS on http://localhost:${CFG.PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
