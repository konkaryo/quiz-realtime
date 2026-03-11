import type { FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { currentUser } from "../auth";

type Opts = { prisma: PrismaClient };

export const notificationRoutes = ({ prisma }: Opts): FastifyPluginAsync =>
  async (app) => {
    app.get("/unread-count", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) return reply.code(401).send({ error: "unauthorized" });

      const player = await prisma.player.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (!player) return reply.send({ count: 0 });

      const count = await prisma.notification.count({
        where: { playerId: player.id, read: false },
      });

      return reply.send({ count });
    });

    app.get("/unread", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) return reply.code(401).send({ error: "unauthorized" });

      const player = await prisma.player.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (!player) return reply.send({ notifications: [] });

      const notifications = await prisma.notification.findMany({
        where: { playerId: player.id, read: false },
        orderBy: [{ issuedAt: "desc" }],
        select: {
          id: true,
          issuedAt: true,
          type: true,
          message: true,
          read: true,
        },
      });

      return reply.send({ notifications });
    });

    app.post("/mark-all-read", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) return reply.code(401).send({ error: "unauthorized" });

      const player = await prisma.player.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (!player) return reply.send({ updated: 0 });

      const result = await prisma.notification.updateMany({
        where: { playerId: player.id, read: false },
        data: { read: true },
      });

      return reply.send({ updated: result.count });
    });
  };