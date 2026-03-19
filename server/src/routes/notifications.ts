import type { FastifyPluginAsync } from "fastify";
import { NotificationType, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { currentUser } from "../auth";

type Opts = { prisma: PrismaClient };

const INVITATION_TTL_MS = 5 * 60 * 1000;
const INVITATION_PREFIX = "__invite__";

function invitationCutoffDate() {
  return new Date(Date.now() - INVITATION_TTL_MS);
}

function buildInvitationMessage(params: { inviterName: string; roomId: string; destination: "lobby" | "room" }) {
  const inviterName = encodeURIComponent(params.inviterName);
  return `${INVITATION_PREFIX}:${params.destination}:${params.roomId}:${inviterName}`;
}

async function pruneExpiredNotifications(prisma: PrismaClient, playerId?: string) {
  await prisma.notification.deleteMany({
    where: {
      type: NotificationType.INVITATION,
      issuedAt: { lte: invitationCutoffDate() },
      ...(playerId ? { playerId } : {}),
    },
  });
}

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

      await pruneExpiredNotifications(prisma, player.id);

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

      await pruneExpiredNotifications(prisma, player.id);

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

    app.post("/invite", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) return reply.code(401).send({ error: "unauthorized" });

      const Body = z.object({
        targetPlayerId: z.string().min(1),
        roomId: z.string().min(1),
        destination: z.enum(["lobby", "room"]),
      });
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });

      const inviter = await prisma.player.findUnique({
        where: { userId: user.id },
        select: { id: true, name: true },
      });
      if (!inviter) return reply.code(404).send({ error: "player_not_found" });
      if (inviter.id === parsed.data.targetPlayerId) {
        return reply.code(400).send({ error: "cannot_invite_self" });
      }

      const room = await prisma.room.findUnique({
        where: { id: parsed.data.roomId },
        select: { id: true, ownerId: true, status: true, visibility: true },
      });
      if (!room || room.status !== "OPEN") {
        return reply.code(404).send({ error: "room_not_found" });
      }
      if (room.visibility !== "PUBLIC" && room.ownerId !== user.id) {
        return reply.code(403).send({ error: "only_owner_can_invite" });
      }

      const target = await prisma.player.findUnique({
        where: { id: parsed.data.targetPlayerId },
        select: { id: true },
      });
      if (!target) return reply.code(404).send({ error: "target_player_not_found" });

      await pruneExpiredNotifications(prisma, target.id);

      const notification = await prisma.notification.create({
        data: {
          playerId: target.id,
          type: NotificationType.INVITATION,
          message: buildInvitationMessage({
            inviterName: inviter.name,
            roomId: room.id,
            destination: parsed.data.destination,
          }),
        },
        select: {
          id: true,
          issuedAt: true,
          type: true,
          message: true,
          read: true,
        },
      });

      return reply.code(201).send({ notification });
    });


    app.post("/:notificationId/read", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) return reply.code(401).send({ error: "unauthorized" });

      const Params = z.object({ notificationId: z.string().min(1) });
      const parsed = Params.safeParse(req.params);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_notification_id" });

      const player = await prisma.player.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!player) return reply.code(404).send({ error: "player_not_found" });

      await pruneExpiredNotifications(prisma, player.id);

      const result = await prisma.notification.updateMany({
        where: { id: parsed.data.notificationId, playerId: player.id },
        data: { read: true },
      });

      return reply.send({ updated: result.count });
    });

    app.post("/mark-all-read", async (req, reply) => {
      const { user, session } = await currentUser(prisma, req);
      if (!user || !session) return reply.code(401).send({ error: "unauthorized" });

      const player = await prisma.player.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (!player) return reply.send({ updated: 0 });

      await pruneExpiredNotifications(prisma, player.id);

      const result = await prisma.notification.updateMany({
        where: { playerId: player.id, read: false },
        data: { read: true },
      });

      return reply.send({ updated: result.count });
    });
  };