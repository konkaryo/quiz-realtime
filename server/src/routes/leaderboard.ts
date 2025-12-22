// server/src/routes/leaderboard.ts
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { toProfileUrl } from "../domain/media/media.service";

export function leaderboardRoutes({ prisma }: { prisma: PrismaClient }) {
  return async function register(app: FastifyInstance) {
    app.get("/bits", async (req, reply) => {
      const Query = z.object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
      });
      const parsed = Query.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_limit" });
      }

      const limit = parsed.data.limit ?? 50;
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
  };
}

export default leaderboardRoutes;