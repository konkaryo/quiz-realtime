// server/src/routes/leaderboard.ts
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { toProfileUrl } from "../domain/media/media.service";

export function leaderboardRoutes({ prisma }: { prisma: PrismaClient }) {
  async function getLimit(query: unknown, reply: any) {
    const Query = z.object({
      limit: z.coerce.number().int().min(1).max(100).optional(),
    });
    const parsed = Query.safeParse(query);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_limit" });
      return null;
    }

    return parsed.data.limit ?? 50;
  }
  return async function register(app: FastifyInstance) {
    app.get("/bits", async (req, reply) => {
      const limit = await getLimit(req.query, reply);
      if (limit === null) return;
      const players = await prisma.player.findMany({
        orderBy: [{ bits: "desc" }, { name: "asc" }],
        take: limit,
        select: { id: true, name: true, bits: true, img: true },
      });

      return reply.send({
        leaderboard: players.map((player) => ({
          id: player.id,
          name: player.name,
          bits: player.bits,
          img: toProfileUrl(player.img ?? null),
        })),
      });
    });
    app.get("/experience", async (req, reply) => {
      const limit = await getLimit(req.query, reply);
      if (limit === null) return;

      const players = await prisma.player.findMany({
        orderBy: [{ experience: "desc" }, { name: "asc" }],
        take: limit,
        select: { id: true, name: true, experience: true, img: true },
      });

      return reply.send({
        leaderboard: players.map((player) => ({
          id: player.id,
          name: player.name,
          experience: player.experience ?? 0,
          img: toProfileUrl(player.img ?? null),
        })),
      });
    });
  };
}

export default leaderboardRoutes;