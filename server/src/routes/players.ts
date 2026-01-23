// server/src/routes/players.ts
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { toProfileUrl } from "../domain/media/media.service";

export function playerRoutes({ prisma }: { prisma: PrismaClient }) {
  return async function register(app: FastifyInstance) {
    app.get("/:playerId", async (req, reply) => {
      const Params = z.object({ playerId: z.string().min(1) });
      const parsed = Params.safeParse(req.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_player_id" });
      }

      const player = await prisma.player.findUnique({
        where: { id: parsed.data.playerId },
        select: { id: true, name: true, img: true, bits: true, experience: true },
      });

      if (!player) {
        return reply.code(404).send({ error: "player_not_found" });
      }

      return reply.send({
        player: {
          id: player.id,
          name: player.name,
          img: toProfileUrl(player.img ?? null),
          bits: player.bits ?? 0,
          experience: player.experience ?? 0,
        },
      });
    });

    app.get("/:playerId/stats", async (req, reply) => {
      const Params = z.object({ playerId: z.string().min(1) });
      const parsed = Params.safeParse(req.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_player_id" });
      }

      const player = await prisma.player.findUnique({
        where: { id: parsed.data.playerId },
        select: { id: true },
      });

      if (!player) {
        return reply.code(404).send({ stats: {}, totalQuestions: 0 });
      }

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
}

export default playerRoutes;