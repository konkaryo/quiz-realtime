// server/src/routes/daily.ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { getChallengeByDate, listChallengesForMonth, toPublicChallenge } from "../domain/daily/daily.service";
import { getDailyLeaderboardForDate, getMonthlyDailyLeaderboard } from "../domain/daily/daily-score.service";

function parseMonth(input?: string | null) {
  const now = new Date();
  if (!input) {
    return { year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() };
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return { year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() };
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error("Paramètre month invalide (attendu YYYY-MM)");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error("Paramètre month invalide (attendu YYYY-MM)");
  }
  return { year, monthIndex: month - 1 };
}

function todayIso(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = now.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dailyRoutes({ prisma }: { prisma: PrismaClient }) {
  return async function register(app: FastifyInstance) {
    app.get("/calendar", async (req, reply) => {
      try {
        const monthParam = (req.query as any)?.month as string | undefined;
        const { year, monthIndex } = parseMonth(monthParam);
        const summaries = await listChallengesForMonth(prisma, year, monthIndex);
        return reply.send({
          month: { year, month: monthIndex + 1 },
          today: todayIso(),
          challenges: summaries,
        });
      } catch (err: any) {
        req.log.error(err, "[GET /daily/calendar]");
        return reply.code(400).send({ error: err?.message || "invalid_month" });
      }
    });

    app.get("/challenges/:date", async (req, reply) => {
      const Params = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
      const parsed = Params.safeParse(req.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_date" });
      }

      const dateIso = parsed.data.date;
      const challenge = toPublicChallenge(await getChallengeByDate(prisma, dateIso));
      if (!challenge) {
        return reply.code(404).send({ error: "not_found" });
      }

      return reply.send({ challenge });
    });

    app.get("/leaderboard/monthly", async (req, reply) => {
      try {
        const monthParam = (req.query as any)?.month as string | undefined;
        const { year, monthIndex } = parseMonth(monthParam);
        const leaderboard = await getMonthlyDailyLeaderboard(prisma, year, monthIndex, 10);
        return reply.send({
          month: { year, month: monthIndex + 1 },
          leaderboard,
        });
      } catch (err: any) {
        req.log.error(err, "[GET /daily/leaderboard/monthly]");
        return reply.code(400).send({ error: err?.message || "invalid_month" });
      }
    });

    app.get("/leaderboard/daily/:date", async (req, reply) => {
      const Params = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
      const parsed = Params.safeParse(req.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_date" });
      }

      const { leaderboard, found } = await getDailyLeaderboardForDate(prisma, parsed.data.date, 10);
      if (!found) {
        return reply.code(404).send({ error: "not_found" });
      }

      return reply.send({ leaderboard });
    });
  };
}

export default dailyRoutes;