import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { currentUser } from "../auth";
import { toImgUrl, toProfileUrl } from "../domain/media/media.service";
import { getChallengeByDate, listChallengesForMonth } from "../domain/daily/daily.service";

type Opts = { prisma: PrismaClient };

function toRoomImageUrl(image?: string | null): string | null {
  if (!image) return null;
  if (/^https?:\/\//i.test(image) || image.startsWith("/")) return image;

  const cleaned = image
    .replace(/^\.?\/?img\/interface\//i, "")
    .replace(/\.avif$/i, "")
    .trim();

  return `/img/interface/${encodeURIComponent(cleaned)}.avif`;
}

function parseAdminMonth(input?: string | null) {
  const now = new Date();
  if (!input?.trim()) {
    return { year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() };
  }

  const match = input.trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error("invalid_month");

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error("invalid_month");
  }

  return { year, monthIndex: month - 1 };
}

function todayIso(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function requireAdmin(prisma: PrismaClient) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const { user } = await currentUser(prisma, req);
    if (!user) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    if (user.role !== "ADMIN") {
      reply.code(403).send({ error: "forbidden" });
      return;
    }
  };
}

export const adminRoutes = ({ prisma }: Opts): FastifyPluginAsync =>
  async (app) => {
    app.get("/users", { preHandler: requireAdmin(prisma) }, async () => {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          guest: true,
          emailVerifiedAt: true,
          createdAt: true,
          player: {
            select: {
              id: true,
              name: true,
              img: true,
              bits: true,
              experience: true,
            },
          },
        },
      });

      return {
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          guest: user.guest,
          emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
          createdAt: user.createdAt.toISOString(),
          player: user.player
            ? {
                id: user.player.id,
                name: user.player.name,
                img: toProfileUrl(user.player.img ?? null),
                bits: user.player.bits,
                experience: user.player.experience,
              }
            : null,
        })),
      };
    });

    app.get("/questions/search", { preHandler: requireAdmin(prisma) }, async (req) => {
      const query = String((req.query as { q?: string } | undefined)?.q ?? "").trim();
      if (!query) return { questions: [] };

      const questions = await prisma.question.findMany({
        where: { id: { contains: query, mode: "insensitive" } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          text: true,
          theme: true,
          difficulty: true,
          img: true,
          choices: {
            orderBy: { id: "asc" },
            select: { id: true, label: true, isCorrect: true },
          },
          acceptedAnswers: { select: { id: true, text: true } },
          _count: { select: { answers: true, dailyEntries: true, reports: true } },
        },
      });

      return {
        questions: questions.map((question) => ({
          id: question.id,
          text: question.text,
          theme: question.theme,
          difficulty: question.difficulty,
          img: toImgUrl(question.img ?? null),
          choices: question.choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
            isCorrect: choice.isCorrect,
          })),
          acceptedAnswers: question.acceptedAnswers.map((answer) => ({
            id: answer.id,
            text: answer.text,
          })),
          answersCount: question._count.answers,
          dailyEntriesCount: question._count.dailyEntries,
          reportsCount: question._count.reports,
        })),
      };
    });

    app.get("/questions", { preHandler: requireAdmin(prisma) }, async () => {
      const questions = await prisma.question.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          text: true,
          theme: true,
          difficulty: true,
          img: true,
          choices: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              label: true,
              isCorrect: true,
            },
          },
          acceptedAnswers: {
            select: {
              id: true,
              text: true,
            },
          },
          _count: {
            select: {
              answers: true,
              dailyEntries: true,
              reports: true,
            },
          },
        },
      });

      return {
        questions: questions.map((question) => ({
          id: question.id,
          text: question.text,
          theme: question.theme,
          difficulty: question.difficulty,
          img: toImgUrl(question.img ?? null),
          choices: question.choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
            isCorrect: choice.isCorrect,
          })),
          acceptedAnswers: question.acceptedAnswers.map((answer) => ({
            id: answer.id,
            text: answer.text,
          })),
          answersCount: question._count.answers,
          dailyEntriesCount: question._count.dailyEntries,
          reportsCount: question._count.reports,
        })),
      };
    });
    app.get("/games", { preHandler: requireAdmin(prisma) }, async () => {
      const rooms = await prisma.room.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          visibility: true,
          image: true,
          difficulty: true,
          questionCount: true,
          roundMs: true,
          bannedThemes: true,
          createdAt: true,
          closedAt: true,
          owner: {
            select: {
              id: true,
              email: true,
              displayName: true,
              player: { select: { name: true } },
            },
          },
          games: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              state: true,
              createdAt: true,
              _count: { select: { playerGames: true } },
            },
          },
          _count: { select: { games: true } },
        },
      });

      return {
        games: rooms.map((room) => {
          const latestGame = room.games[0] ?? null;

          return {
            id: room.id,
            name: room.name,
            code: room.code,
            status: room.status,
            visibility: room.visibility,
            image: toRoomImageUrl(room.image ?? null),
            difficulty: room.difficulty,
            questionCount: room.questionCount,
            roundSeconds: Math.round(room.roundMs / 1000),
            bannedThemes: room.bannedThemes,
            createdAt: room.createdAt.toISOString(),
            closedAt: room.closedAt?.toISOString() ?? null,
            owner: room.owner
              ? {
                  id: room.owner.id,
                  email: room.owner.email,
                  displayName: room.owner.displayName,
                  playerName: room.owner.player?.name ?? null,
                }
              : null,
            gamesCount: room._count.games,
            latestGame: latestGame
              ? {
                  id: latestGame.id,
                  state: latestGame.state,
                  createdAt: latestGame.createdAt.toISOString(),
                  playersCount: latestGame._count.playerGames,
                }
              : null,
          };
        }),
      };
    });

    app.get("/daily", { preHandler: requireAdmin(prisma) }, async (req, reply) => {
      try {
        const monthParam = (req.query as { month?: string } | undefined)?.month;
        const { year, monthIndex } = parseAdminMonth(monthParam);
        const challenges = await listChallengesForMonth(prisma, year, monthIndex);

        return {
          month: { year, month: monthIndex + 1 },
          today: todayIso(),
          challenges,
        };
      } catch {
        return reply.code(400).send({ error: "invalid_month" });
      }
    });

    app.post("/daily/:date/questions", { preHandler: requireAdmin(prisma) }, async (req, reply) => {
      const date = (req.params as { date?: string }).date ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return reply.code(400).send({ error: "invalid_date" });
      }

      const Body = z.object({ questionId: z.string().min(1) });
      const parsed = Body.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_payload" });
      }

      const question = await prisma.question.findUnique({
        where: { id: parsed.data.questionId },
        select: { id: true },
      });
      if (!question) {
        return reply.code(404).send({ error: "question_not_found" });
      }

      const [year, month, day] = date.split("-").map((value) => Number(value));
      const challengeDate = new Date(Date.UTC(year, month - 1, day));
      const nextDay = new Date(Date.UTC(year, month - 1, day + 1));

      const result = await prisma.$transaction(async (tx) => {
        const challenge =
          (await tx.dailyChallenge.findFirst({
            where: { date: { gte: challengeDate, lt: nextDay } },
            select: {
              id: true,
              entries: {
                select: { questionId: true, position: true },
              },
            },
          })) ??
          (await tx.dailyChallenge.create({
            data: { date: challengeDate },
            select: { id: true, entries: { select: { questionId: true, position: true } } },
          }));

        if (challenge.entries.length >= 15) {
          return { error: "daily_challenge_full" as const };
        }

        if (challenge.entries.some((entry) => entry.questionId === question.id)) {
          return { error: "question_already_in_challenge" as const };
        }

        const maxPosition = challenge.entries.reduce(
          (max, entry) => Math.max(max, entry.position),
          0,
        );

        await tx.dailyChallengeQuestion.create({
          data: {
            challengeId: challenge.id,
            questionId: question.id,
            position: maxPosition + 1,
          },
        });

        return { error: null };
      });

      if (result.error) {
        return reply.code(400).send({ error: result.error });
      }

      const challenge = await getChallengeByDate(prisma, date);
      return reply.code(201).send({ challenge });
    });

    app.get("/daily/:date", { preHandler: requireAdmin(prisma) }, async (req, reply) => {
      const date = (req.params as { date?: string }).date ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return reply.code(400).send({ error: "invalid_date" });
      }

      const challenge = await getChallengeByDate(prisma, date);
      if (!challenge) {
        return reply.code(404).send({ error: "not_found" });
      }

      return { challenge };
    });

    app.patch("/daily/:date/reorder", { preHandler: requireAdmin(prisma) }, async (req, reply) => {
      const date = (req.params as { date?: string }).date ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return reply.code(400).send({ error: "invalid_date" });
      }

      const Body = z.object({ entryIds: z.array(z.string().min(1)).min(1) });
      const parsed = Body.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_payload" });
      }

      const [year, month, day] = date.split("-").map((value) => Number(value));
      const start = new Date(Date.UTC(year, month - 1, day));
      const end = new Date(Date.UTC(year, month - 1, day + 1));

      const challenge = await prisma.dailyChallenge.findFirst({
        where: { date: { gte: start, lt: end } },
        select: {
          id: true,
          entries: {
            orderBy: { position: "asc" },
            select: { id: true },
          },
        },
      });

      if (!challenge) {
        return reply.code(404).send({ error: "not_found" });
      }

      const requestedIds = parsed.data.entryIds;
      const existingIds = new Set(challenge.entries.map((entry) => entry.id));
      const requestedSet = new Set(requestedIds);
      const hasSameEntries =
        requestedIds.length === challenge.entries.length &&
        requestedSet.size === requestedIds.length &&
        requestedIds.every((id) => existingIds.has(id));

      if (!hasSameEntries) {
        return reply.code(400).send({ error: "invalid_entry_order" });
      }

      await prisma.$transaction(async (tx) => {
        await Promise.all(
          requestedIds.map((id, index) =>
            tx.dailyChallengeQuestion.update({
              where: { id },
              data: { position: -(index + 1) },
            }),
          ),
        );

        await Promise.all(
          requestedIds.map((id, index) =>
            tx.dailyChallengeQuestion.update({
              where: { id },
              data: { position: index + 1 },
            }),
          ),
        );
      });

      const updatedChallenge = await getChallengeByDate(prisma, date);
      return { challenge: updatedChallenge };
    });
  };
