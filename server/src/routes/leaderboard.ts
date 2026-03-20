// server/src/routes/leaderboard.ts
import { FastifyInstance, FastifyRequest } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { currentUser } from "../auth";
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

  function isBeforeInRanking(
    a: { value: number; name: string; id: string },
    b: { value: number; name: string; id: string }
  ) {
    if (a.value !== b.value) return a.value > b.value;
    const byName = a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
    if (byName !== 0) return byName < 0;
    return a.id.localeCompare(b.id, "fr", { sensitivity: "base" }) < 0;
  }

  async function getSelfLeaderboardEntry(req: FastifyRequest, mode: "bits" | "experience") {
    const auth = await currentUser(prisma, req);
    if (!auth.user) return null;

    const player = await prisma.player.findUnique({
      where: { userId: auth.user.id },
      select: { id: true, name: true, img: true, bits: true, experience: true },
    });
    if (!player) return null;

    const selfValue = mode === "experience" ? player.experience ?? 0 : player.bits ?? 0;
    const allPlayers = await prisma.player.findMany({
      select: { id: true, name: true, bits: true, experience: true },
    });

    const rank =
      allPlayers.filter((candidate) => {
        if (candidate.id === player.id) return false;
        const candidateValue = mode === "experience"
          ? candidate.experience ?? 0
          : candidate.bits ?? 0;

        return isBeforeInRanking(
          { value: candidateValue, name: candidate.name, id: candidate.id },
          { value: selfValue, name: player.name, id: player.id }
        );
      }).length + 1;

    return {
      rank,
      entry: {
        id: player.id,
        name: player.name,
        bits: player.bits ?? 0,
        experience: player.experience ?? 0,
        img: toProfileUrl(player.img ?? null),
      },
    };
  }

  return async function register(app: FastifyInstance) {
    app.get("/bits", async (req, reply) => {
      const limit = await getLimit(req.query, reply);
      if (limit === null) return;
      const [players, self] = await Promise.all([
        prisma.player.findMany({
          orderBy: [{ bits: "desc" }, { name: "asc" }, { id: "asc" }],
          take: limit,
          select: { id: true, name: true, bits: true, img: true },
        }),
        getSelfLeaderboardEntry(req, "bits"),
      ]);

      return reply.send({
        leaderboard: players.map((player) => ({
          id: player.id,
          name: player.name,
          bits: player.bits,
          img: toProfileUrl(player.img ?? null),
        })),
        self,
      });
    });
    app.get("/experience", async (req, reply) => {
      const limit = await getLimit(req.query, reply);
      if (limit === null) return;

      const [players, self] = await Promise.all([
        prisma.player.findMany({
          orderBy: [{ experience: "desc" }, { name: "asc" }, { id: "asc" }],
          take: limit,
          select: { id: true, name: true, experience: true, img: true },
        }),
        getSelfLeaderboardEntry(req, "experience"),
      ]);

      return reply.send({
        leaderboard: players.map((player) => ({
          id: player.id,
          name: player.name,
          experience: player.experience ?? 0,
          img: toProfileUrl(player.img ?? null),
        })),
        self,
      });
    });
  };
}

export default leaderboardRoutes;