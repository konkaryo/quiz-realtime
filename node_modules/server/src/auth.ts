// src/auth.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { PrismaClient, User, Session } from "@prisma/client";
import * as crypto from "crypto";
import argon2 from "argon2";

export const SESSION_COOKIE = "sid";
export const SESSION_TTL_MS =
  Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 30); // 30j

function now() { return new Date(); }
function addMs(d: Date, ms: number) { return new Date(d.getTime() + ms); }

export async function hashPassword(plain: string): Promise<string> {
  // Argon2id: sûr et rapide, paramètres par défaut OK pour la plupart des serveurs
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try { return await argon2.verify(hash, plain); }
  catch { return false; }
}

export function genSessionToken(): string {
  // base64url évite les ';,=' etc. qui compliquent les cookies
  return crypto.randomBytes(32).toString("base64url");
}

/* -------------------- Cookies -------------------- */

export function setAuthCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",            // "strict" si tu veux être plus dur
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearAuthCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/* -------------------- Sessions -------------------- */

export async function createSession(
  prisma: PrismaClient,
  userId: string
): Promise<{ token: string; session: Session }> {
  const token = genSessionToken();
  const session = await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt: addMs(now(), SESSION_TTL_MS),
    },
  });
  return { token, session };
}

export async function revokeSession(
  prisma: PrismaClient,
  token: string
): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export async function getSession(
  prisma: PrismaClient,
  token?: string
): Promise<{ user: User | null; session: Session | null }> {
  if (!token) return { user: null, session: null };

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return { user: null, session: null };
  if (session.expiresAt.getTime() <= now().getTime()) {
    // expirée -> nettoyage
    await prisma.session.delete({ where: { token } }).catch(() => {});
    return { user: null, session: null };
  }
  return { user: session.user, session };
}

/**
 * Optionnel : si tu veux prolonger automatiquement la session lorsqu’elle est
 * bientôt expirée (sliding expiration).
 */
export async function maybeRefreshSession(
  prisma: PrismaClient,
  session: Session
): Promise<Session> {
  const remaining = session.expiresAt.getTime() - now().getTime();
  const threshold = SESSION_TTL_MS * 0.1; // < 10% restant -> on prolonge
  if (remaining < threshold) {
    return prisma.session.update({
      where: { token: session.token },
      data: { expiresAt: addMs(now(), SESSION_TTL_MS) },
    });
  }
  return session;
}

/* -------------------- Fastify helpers -------------------- */

/**
 * Récupère l’utilisateur courant à partir du cookie.
 * N’écrit pas de cookie; il renvoie juste user/session.
 */
export async function currentUser(
  prisma: PrismaClient,
  req: FastifyRequest
): Promise<{ user: User | null; session: Session | null }> {
  const token = (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? undefined;
  const { user, session } = await getSession(prisma, token);
  return { user, session };
}

/**
 * Middleware simple : refuse si non authentifié.
 * À utiliser en preHandler sur tes routes protégées.
 */
export function requireAuth(prisma: PrismaClient) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const { user } = await currentUser(prisma, req);
    if (!user) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
  };
}
