import type { FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { QuestionReportReason } from "@prisma/client";
import { z } from "zod";
import { currentUser } from "../auth";

type Opts = { prisma: PrismaClient };

export const questionRoutes = ({ prisma }: Opts): FastifyPluginAsync =>
  async (app) => {
    app.post("/:questionId/reports", async (req, reply) => {
      const { user } = await currentUser(prisma, req);
      if (!user) return reply.code(401).send({ error: "unauthorized" });

      const Params = z.object({ questionId: z.string().min(1) });
      const Body = z.object({ reason: z.nativeEnum(QuestionReportReason) });

      const paramsParsed = Params.safeParse(req.params);
      if (!paramsParsed.success) return reply.code(400).send({ error: "invalid-question-id" });

      const bodyParsed = Body.safeParse(req.body);
      if (!bodyParsed.success) return reply.code(400).send({ error: "invalid-reason" });

      const { questionId } = paramsParsed.data;
      const { reason } = bodyParsed.data;

      const [player, question] = await Promise.all([
        prisma.player.findUnique({ where: { userId: user.id }, select: { id: true } }),
        prisma.question.findUnique({ where: { id: questionId }, select: { id: true } }),
      ]);

      if (!player) return reply.code(404).send({ error: "player-not-found" });
      if (!question) return reply.code(404).send({ error: "question-not-found" });

      await prisma.questionReport.create({
        data: {
          questionId,
          playerId: player.id,
          reason,
        },
      });

      return reply.code(201).send({ ok: true });
    });
  };