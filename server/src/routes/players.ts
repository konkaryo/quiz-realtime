// server/src/routes/players.ts
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { toProfileUrl } from "../domain/media/media.service";
import { currentUser } from "../auth";
import { refreshPlayerStats } from "../domain/player/player-stats.service";

export function playerRoutes({ prisma }: { prisma: PrismaClient }) {
  return async function register(app: FastifyInstance) {
    app.get("/search", async (req, reply) => {
      const Query = z.strictObject({
        q: z.string().trim().min(1).max(40),
        limit: z.coerce.number().int().min(1).max(10).optional(),
      });

      const parsed = Query.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_search_query" });
      }

      const { q, limit = 6 } = parsed.data;
      const players = await prisma.player.findMany({
        where: {
          name: {
            contains: q,
            mode: "insensitive",
          },
        },
        orderBy: [{ experience: "desc" }, { createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          name: true,
          img: true,
        },
      });

      return reply.send({
        players: players.map((player) => ({
          id: player.id,
          name: player.name,
          img: toProfileUrl(player.img ?? null),
        })),
      });
    });
    app.get("/:playerId", async (req, reply) => {
      const Params = z.strictObject({ playerId: z.string().min(1) });
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
      const Params = z.strictObject({ playerId: z.string().min(1) });
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

      const [playerStats, avgTextResponse] = await Promise.all([
        refreshPlayerStats(prisma, player.id),
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

      return reply.send({
        ...playerStats,
        avgTextResponseMs: avgTextResponse._avg.responseMs ?? null,
      });
    });
  };
}

export default playerRoutes;