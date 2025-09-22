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
const config_1 = require("./config");
const prisma_1 = require("./infra/prisma");
const cookies_1 = require("./infra/cookies");
const auth_1 = require("./routes/auth");
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
            const body = (req.body ?? {});
            const difficulty = typeof body.difficulty === "number" ? Math.min(10, Math.max(1, Math.round(body.difficulty))) : 5;
            const banned = Array.isArray(body.bannedThemes) ? body.bannedThemes
                .map(String).filter((x) => Object.values(client_1.Theme).includes(x)) : [];
            // 2) Génération code room (4 chars non ambigus)
            const code = [..."ABCDEFGHJKLMNPQRSTUVWXYZ23456789"]
                .sort(() => 0.5 - Math.random())
                .slice(0, 4)
                .join("");
            // 3) Création room + game (owner = session.userId)
            const result = await prisma_1.prisma.$transaction(async (tx) => {
                const room = await tx.room.create({
                    data: {
                        code,
                        ownerId: session.userId,
                        difficulty,
                        bannedThemes: banned
                    },
                    select: { id: true },
                });
                await tx.game.create({ data: { roomId: room.id, state: "lobby" } });
                return { id: room.id };
            });
            return reply.code(201).send({ result });
        }
        catch (e) {
            req.log.error(e, "POST /rooms failed");
            return reply.code(500).send({ error: "Server error" });
        }
    });
    app.get("/rooms/:id", async (req, reply) => {
        const id = req.params.id;
        const room = await prisma_1.prisma.room.findUnique({
            where: { id },
            select: { id: true, code: true, status: true },
        });
        if (!room)
            return reply.code(404).send({ error: "Room not found" });
        if (room.status === "CLOSED") {
            return reply.code(410).send({ error: "Room closed" });
        }
        return { room };
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
            where: { status: "OPEN" }, // si tu as ajouté le soft close
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
