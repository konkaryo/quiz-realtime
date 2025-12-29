// src/routes/auth.ts
import type { FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  hashPassword,
  verifyPassword,
  createSession,
  setAuthCookie,
  clearAuthCookie,
  currentUser,
  maybeRefreshSession,
  revokeSession,
} from "../auth";
import { toProfileUrl } from "../domain/media/media.service";

type Opts = { prisma: PrismaClient };

const normEmail = (e: string) => e.trim().toLowerCase();
const cleanName  = (s: string) => s.trim().slice(0, 64);

export const authRoutes = ({ prisma }: Opts): FastifyPluginAsync =>
  async (app) => {
    // POST /auth/register
    app.post("/register", async (req, reply) => {
      const body = (req.body ?? {}) as {
        email?: string;
        password?: string;
        displayName?: string;
        name?: string;
        username?: string;
      };
      const email = normEmail(body.email || "");
      const password = (body.password || "").trim();
      const displayName = cleanName(
        body.displayName || body.name || body.username || email.split("@")[0]
      );

      if (!email || !password) return reply.code(400).send({ error: "missing-fields" });
      if (password.length < 8)   return reply.code(400).send({ error: "weak-password" });

      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) return reply.code(409).send({ error: "email-taken" });

      const passwordHash = await hashPassword(password);

      // Crée User + Player lié (pas de cas legacy ici)
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName,
          player: { create: { name: displayName } },
        },
        include: { player: true },
      });

      const { token, session } = await createSession(prisma, user.id);
      setAuthCookie(reply, token);

      return reply.code(201).send({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          playerId: user.player?.id ?? null,
          img: toProfileUrl(user.player?.img ?? null),
        },
        session: { expiresAt: session.expiresAt },
      });
    });

    // POST /auth/login
    app.post("/login", async (req, reply) => {
      const body = (req.body ?? {}) as { email?: string; password?: string };
      const email = normEmail(body.email || "");
      const password = (body.password || "").trim();

      if (!email || !password) return reply.code(400).send({ error: "missing-fields" });

      const user = await prisma.user.findUnique({
        where: { email },
        include: { player: { select: { id: true, name: true, img: true, bits: true, experience: true } } }
      });
      if (!user) return reply.code(401).send({ error: "invalid-credentials" });

      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) return reply.code(401).send({ error: "invalid-credentials" });

      const { token, session } = await createSession(prisma, user.id);
      setAuthCookie(reply, token);

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          playerId: user.player?.id ?? null,
          playerName: user.player?.name ?? null,
          img: toProfileUrl(user.player?.img ?? null),
          bits: user.player?.bits ?? 0,
          experience: user.player?.experience ?? 0,
        },
        session: { expiresAt: session.expiresAt },
      });
    });

    // POST /auth/logout
    app.post("/logout", async (req, reply) => {
      const token = (req.cookies || {})["sid"] as string | undefined;
      if (token) await revokeSession(prisma, token);
      clearAuthCookie(reply);
      return reply.send({ ok: true });
    });

    // GET /auth/me
    app.get("/me", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) return reply.code(401).send({ user: null });

      await maybeRefreshSession(prisma, session); // sliding expiration (optionnel)

      const player = await prisma.player.findUnique({
        where: { userId: user.id },
        select: { id: true, name: true, img: true, bits: true, experience: true },
      });

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          playerId: player?.id ?? null,
          playerName: player?.name ?? null,
          img: toProfileUrl(player?.img ?? null),
          bits: player?.bits ?? 0,
          experience: player?.experience ?? 0,
        },
      });
    });

    // GET /auth/me/stats
    app.get("/me/stats", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) return reply.code(401).send({ stats: {} });

      const player = await prisma.player.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (!player) return reply.send({ stats: {}, totalQuestions: 0 });

      const answerStatsFilter = {
        playerGame: { playerId: player.id },
        questionId: { not: null },
      };

      const [answers, totalQuestions, avgTextResponse] = await Promise.all([
        prisma.answer.findMany({
          where: answerStatsFilter,
          orderBy: { createdAt: "desc" },
          take: 1000,
          select: {
            correct: true,
            playerGameId: true,
            questionId: true,
            question: { select: { theme: true } },
          },
        }),
        prisma.answer
          .groupBy({
            by: ["playerGameId", "questionId"],
            where: answerStatsFilter,
          })
          .then((rows) => rows.length),
        prisma.answer.aggregate({
          where: {
            playerGame: { playerId: player.id },
            mode: "text",
            correct: true,
            responseMs: { gte: 0 },
          },
          _avg: { responseMs: true },
        }),
      ]);

      const seenQuestions = new Map<string, { theme: string; correct: boolean }>();
      for (const ans of answers) {
        if (!ans.questionId) continue;
        const theme = ans.question?.theme;
        if (!theme) continue;

        const key = `${ans.playerGameId}:${ans.questionId}`;
        const existing = seenQuestions.get(key);
        if (!existing) {
          seenQuestions.set(key, { theme, correct: ans.correct });
        } else if (!existing.correct && ans.correct) {
          seenQuestions.set(key, { ...existing, correct: true });
        }
      }

      const stats = new Map<string, { total: number; correct: number }>();
      for (const entry of seenQuestions.values()) {
        const statEntry = stats.get(entry.theme) ?? { total: 0, correct: 0 };
        statEntry.total += 1;
        if (entry.correct) statEntry.correct += 1;
        stats.set(entry.theme, statEntry);
      }

      const payload: Record<string, { total: number; correct: number; accuracy: number }> = {};
      for (const [theme, entry] of stats) {
        const accuracy = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0;
        payload[theme] = { ...entry, accuracy };
      }

      return reply.send({
        stats: payload,
        totalQuestions,
        avgTextResponseMs: avgTextResponse._avg.responseMs ?? null,
      });
    });

  };

