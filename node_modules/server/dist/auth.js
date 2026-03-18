"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_TTL_MS = exports.SESSION_COOKIE = void 0;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.genSessionToken = genSessionToken;
exports.setAuthCookie = setAuthCookie;
exports.clearAuthCookie = clearAuthCookie;
exports.createSession = createSession;
exports.revokeSession = revokeSession;
exports.getSession = getSession;
exports.maybeRefreshSession = maybeRefreshSession;
exports.currentUser = currentUser;
exports.requireAuth = requireAuth;
const crypto = __importStar(require("crypto"));
const argon2_1 = __importDefault(require("argon2"));
exports.SESSION_COOKIE = "sid";
exports.SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 30); // 30j
function now() { return new Date(); }
function addMs(d, ms) { return new Date(d.getTime() + ms); }
async function hashPassword(plain) {
    // Argon2id: sûr et rapide, paramètres par défaut OK pour la plupart des serveurs
    return argon2_1.default.hash(plain, { type: argon2_1.default.argon2id });
}
async function verifyPassword(hash, plain) {
    try {
        return await argon2_1.default.verify(hash, plain);
    }
    catch {
        return false;
    }
}
function genSessionToken() {
    // base64url évite les ';,=' etc. qui compliquent les cookies
    return crypto.randomBytes(32).toString("base64url");
}
/* -------------------- Cookies -------------------- */
function setAuthCookie(reply, token) {
    reply.setCookie(exports.SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax", // "strict" si tu veux être plus dur
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: Math.floor(exports.SESSION_TTL_MS / 1000),
    });
}
function clearAuthCookie(reply) {
    reply.clearCookie(exports.SESSION_COOKIE, { path: "/" });
}
/* -------------------- Sessions -------------------- */
async function createSession(prisma, userId) {
    const token = genSessionToken();
    const session = await prisma.session.create({
        data: {
            userId,
            token,
            expiresAt: addMs(now(), exports.SESSION_TTL_MS),
        },
    });
    return { token, session };
}
async function revokeSession(prisma, token) {
    await prisma.session.deleteMany({ where: { token } });
}
async function getSession(prisma, token) {
    if (!token)
        return { user: null, session: null };
    const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
    });
    if (!session)
        return { user: null, session: null };
    if (session.expiresAt.getTime() <= now().getTime()) {
        // expirée -> nettoyage
        await prisma.session.delete({ where: { token } }).catch(() => { });
        return { user: null, session: null };
    }
    return { user: session.user, session };
}
/**
 * Optionnel : si tu veux prolonger automatiquement la session lorsqu’elle est
 * bientôt expirée (sliding expiration).
 */
async function maybeRefreshSession(prisma, session) {
    const remaining = session.expiresAt.getTime() - now().getTime();
    const threshold = exports.SESSION_TTL_MS * 0.1; // < 10% restant -> on prolonge
    if (remaining < threshold) {
        return prisma.session.update({
            where: { token: session.token },
            data: { expiresAt: addMs(now(), exports.SESSION_TTL_MS) },
        });
    }
    return session;
}
/* -------------------- Fastify helpers -------------------- */
/**
 * Récupère l’utilisateur courant à partir du cookie.
 * N’écrit pas de cookie; il renvoie juste user/session.
 */
async function currentUser(prisma, req) {
    const token = req.cookies?.[exports.SESSION_COOKIE] ?? undefined;
    const { user, session } = await getSession(prisma, token);
    return { user, session };
}
/**
 * Middleware simple : refuse si non authentifié.
 * À utiliser en preHandler sur tes routes protégées.
 */
function requireAuth(prisma) {
    return async (req, reply) => {
        const { user } = await currentUser(prisma, req);
        if (!user) {
            reply.code(401).send({ error: "unauthorized" });
            return;
        }
    };
}
