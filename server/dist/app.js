"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const path_1 = __importDefault(require("path"));
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const static_1 = __importDefault(require("@fastify/static"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const socket_io_1 = require("socket.io");
const zod_1 = require("zod");
const config_1 = require("./config");
const prisma_1 = require("./infra/prisma");
const cookies_1 = require("./infra/cookies");
const auth_1 = require("./routes/auth");
const daily_1 = require("./routes/daily");
const race_1 = require("./routes/race");
const handlers_1 = require("./sockets/handlers");
const room_service_1 = require("./domain/room/room.service");
const client_1 = require("@prisma/client");
/* ---------------- runtime maps ---------------- */
const clients = new Map();
const gameStates = new Map();
async function main() {
    const app = (0, fastify_1.default)({ logger: true });
    // CORS / Static / Cookies / Routes
    await app.register(cors_1.default, {
        origin(origin, cb) {
            const allowed = new Set([config_1.CFG.CLIENT_URL, "http://localhost:5173", "https://synapz.online"].filter(Boolean));
            if (!origin)
                return cb(null, true);
            cb(null, allowed.has(origin));
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        maxAge: 86400,
        strictPreflight: false,
    });
    await app.register(static_1.default, { root: path_1.default.resolve(config_1.CFG.IMG_DIR), prefix: "/img/", decorateReply: false });
    await app.register(cookie_1.default, { secret: process.env.COOKIE_SECRET || "dev-secret", hook: "onRequest" });
    await app.register((0, auth_1.authRoutes)({ prisma: prisma_1.prisma }), { prefix: "/auth" });
    await app.register((0, daily_1.dailyRoutes)({ prisma: prisma_1.prisma }), { prefix: "/daily" });
    await app.register((0, race_1.raceRoutes)({ prisma: prisma_1.prisma }), { prefix: "/race" });
    app.get("/health", async () => ({ ok: true }));
    // ---------- HTTP: Rooms ----------
    app.post("/rooms", async (req, reply) => {
        try {
            // 1) Auth via cookie "sid"
            const sid = req.cookies?.sid;
            if (!sid)
                return reply.code(401).send({ error: "Unauthorized" });
            const session = await prisma_1.prisma.session.findUnique({
                where: { token: sid },
                select: { userId: true, expiresAt: true },
            });
            if (!session || session.expiresAt.getTime() < Date.now()) {
                return reply.code(401).send({ error: "Unauthorized" });
            }
            const Body = zod_1.z.object({
                difficulty: zod_1.z.number().int().min(1).max(10).optional(),
                bannedThemes: zod_1.z.array(zod_1.z.nativeEnum(client_1.Theme)).optional(),
                questionCount: zod_1.z.number().int().min(10).max(30).optional(),
                roundSeconds: zod_1.z.number().int().min(10).max(30).optional(),
                code: zod_1.z.string().trim().toUpperCase().optional()
            });
            const parsed = Body.safeParse(req.body);
            if (!parsed.success) {
                return reply.code(400).send({ error: parsed.error.message });
            }
            const { difficulty = 5, bannedThemes = [], questionCount = 10, roundSeconds = 10, code: requestedCodeRaw } = parsed.data;
            const roundMs = roundSeconds * 1000;
            const requestedCode = (requestedCodeRaw || "").toUpperCase().trim();
            const useRequested = requestedCode && (0, room_service_1.isCodeValid)(requestedCode);
            let code = useRequested ? requestedCode : "AAAA";
            // 3) Création room + game (owner = session.userId)
            const result = await prisma_1.prisma.$transaction(async (tx) => {
                const room = await tx.room.create({
                    data: {
                        code,
                        ownerId: session.userId,
                        difficulty,
                        bannedThemes,
                        questionCount,
                        roundMs,
                        visibility: 'PRIVATE'
                    },
                    select: { id: true },
                });
                await tx.game.create({ data: { roomId: room.id, state: "lobby" } });
                return { id: room.id };
            });
            return reply.code(201).send({ result });
        }
        catch (e) {
            req.log.error(e, "[POST /rooms] failed");
            return reply.code(500).send({ error: "Server error" });
        }
    });
    app.get("/rooms/:id", async (req, reply) => {
        const id = req.params.id;
        const room = await prisma_1.prisma.room.findUnique({
            where: { id },
            select: { id: true, code: true, status: true, visibility: true },
        });
        if (!room)
            return reply.code(404).send({ error: "Room not found" });
        if (room.status === "CLOSED") {
            return reply.code(410).send({ error: "Room closed" });
        }
        return { room };
    });
    app.get("/rooms/new-code", async (_req, reply) => {
        try {
            // On tente quelques fois pour éviter un code déjà pris (unicité DB)
            for (let i = 0; i < 8; i++) {
                const code = (0, room_service_1.genCode)(4);
                const existing = await prisma_1.prisma.room.findUnique({ where: { code, status: 'OPEN' }, select: { id: true } });
                if (!existing) {
                    return reply.send({ code });
                }
            }
            return reply.code(503).send({ error: "no_code_available" });
        }
        catch (e) {
            return reply.code(500).send({ error: "Server error" });
        }
    });
    app.post("/rooms/resolve", async (req, reply) => {
        try {
            const Body = zod_1.z.object({ code: zod_1.z.string().trim().toUpperCase().length(4) });
            const parsed = Body.safeParse(req.body);
            if (!parsed.success)
                return reply.code(400).send({ error: "Bad code" });
            const code = parsed.data.code;
            if (!(0, room_service_1.isCodeValid)(code))
                return reply.code(400).send({ error: "Bad code" });
            const room = await prisma_1.prisma.room.findUnique({ where: { code }, select: { id: true, status: true, code: true } });
            if (!room)
                return reply.code(404).send({ error: "Room not found" });
            if (room.status === "CLOSED")
                return reply.code(410).send({ error: "Room closed" });
            return reply.send({ roomId: room.id, room: { id: room.id } });
        }
        catch (e) {
            return reply.code(500).send({ error: "Server error" });
        }
    });
    app.get("/rooms", async (req, reply) => {
        // 1) Qui est connecté ? (optionnel : si pas de cookie => userId=null)
        const sid = req.cookies?.sid;
        let userId = null;
        let userRole = null;
        if (sid) {
            const session = await prisma_1.prisma.session.findUnique({
                where: { token: sid },
                select: { userId: true, expiresAt: true },
            });
            if (session && session.expiresAt.getTime() > Date.now()) {
                const u = await prisma_1.prisma.user.findUnique({
                    where: { id: session.userId },
                    select: { id: true, role: true },
                });
                if (u) {
                    userId = u.id;
                    // @ts-ignore enum Prisma
                    userRole = u.role ?? "USER";
                }
            }
        }
        // 2) Liste des rooms ouvertes
        const rows = await prisma_1.prisma.room.findMany({
            where: { status: "OPEN", visibility: "PUBLIC" },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                createdAt: true,
                difficulty: true,
                owner: { select: { id: true, displayName: true } },
            },
        });
        // 3) Ajoute canClose selon user courant (owner ou ADMIN)
        const rooms = rows.map((r) => ({
            ...r,
            playerCount: (0, room_service_1.clientsInRoom)(clients, r.id).length,
            canClose: (!!userId && r.owner?.id === userId) ||
                userRole === "ADMIN",
        }));
        reply.send({ rooms });
    });
    app.delete("/rooms/:id", async (req, reply) => {
        try {
            const sid = req.cookies?.sid;
            if (!sid)
                return reply.code(401).send({ error: "Unauthorized" });
            const session = await prisma_1.prisma.session.findUnique({
                where: { token: sid },
                select: { userId: true, expiresAt: true },
            });
            if (!session || session.expiresAt.getTime() < Date.now()) {
                return reply.code(401).send({ error: "Unauthorized" });
            }
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: session.userId },
                select: { id: true, role: true },
            });
            if (!user)
                return reply.code(401).send({ error: "Unauthorized" });
            const id = req.params.id;
            const room = await prisma_1.prisma.room.findUnique({
                where: { id },
                select: { id: true, ownerId: true, status: true },
            });
            if (!room)
                return reply.code(404).send({ error: "Room not found" });
            if (room.status === "CLOSED")
                return reply.code(204).send();
            const isOwner = room.ownerId === user.id;
            const isAdmin = user.role === "ADMIN";
            if (!isOwner && !isAdmin)
                return reply.code(403).send({ error: "Forbidden" });
            // 1) Marque la room fermée
            await prisma_1.prisma.room.update({
                where: { id },
                data: { status: "CLOSED", closedAt: new Date() },
            });
            // 2) Arrête le jeu runtime + notifie
            const st = gameStates.get(id);
            if (st?.timer)
                clearTimeout(st.timer);
            gameStates.delete(id);
            io.to(id).emit("room_closed", { roomId: id });
            io.in(id).socketsLeave(id);
            // 3) (Optionnel) basculer les Game liés en "closed"
            await prisma_1.prisma.game.updateMany({
                where: { roomId: id },
                data: { state: "closed" },
            });
            return reply.code(204).send();
        }
        catch (e) {
            req.log.error(e, "DELETE /rooms/:id (soft close) failed");
            return reply.code(500).send({ error: "Server error" });
        }
    });
    // ---------- Socket.IO ----------
    const io = new socket_io_1.Server(app.server, {
        path: "/socket.io",
        cors: { origin: config_1.CFG.CLIENT_URL, methods: ["GET", "POST"], credentials: true },
    });
    // Auth middleware (via cookie "sid")
    io.use(async (socket, next) => {
        try {
            const sid = (0, cookies_1.getCookie)("sid", socket.handshake.headers.cookie);
            if (!sid)
                return next(new Error("unauthorized"));
            const session = await prisma_1.prisma.session.findUnique({
                where: { token: sid },
                select: { userId: true, expiresAt: true },
            });
            if (!session || session.expiresAt.getTime() < Date.now()) {
                return next(new Error("unauthorized"));
            }
            socket.data.userId = session.userId;
            next();
        }
        catch (e) {
            next(new Error("unauthorized"));
        }
    });
    // Register all socket handlers
    (0, handlers_1.registerSocketHandlers)(io, clients, gameStates);
    await app.listen({ port: config_1.CFG.PORT, host: "localhost" });
    app.log.info(`HTTP + WS on http://localhost:${config_1.CFG.PORT}`);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
