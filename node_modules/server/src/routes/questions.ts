import type { FastifyPluginAsync } from "fastify";
import { HTTP_LIMITS, opaqueSessionKey, rateLimitPreHandler } from "../security/rate-limit";
import type { PrismaClient } from "@prisma/client";
import { QuestionReportReason, Theme } from "@prisma/client";
import { z } from "zod";
import { currentUser } from "../auth";
import { toImgUrl } from "../domain/question/question.service";

type Opts = { prisma: PrismaClient };

export const questionRoutes = ({ prisma }: Opts): FastifyPluginAsync =>
  async (app) => {
    app.get("/random", async (req, reply) => {
      const Query = z.strictObject({
        theme: z.nativeEnum(Theme),
        difficulty: z.coerce.number().int().min(1).max(4),
      });
      const parsed = Query.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: "invalid-filters" });

      const where = {
        theme: parsed.data.theme,
        difficulty: String(parsed.data.difficulty),
      };
      const questionCount = await prisma.question.count({ where });
      if (questionCount === 0) return reply.code(404).send({ error: "question-not-found" });

      const question = await prisma.question.findFirst({
        where,
        skip: Math.floor(Math.random() * questionCount),
        select: {
          id: true,
          text: true,
          theme: true,
          difficulty: true,
          img: true,
          choices: { select: { id: true, label: true, isCorrect: true } },
        },
      });
      if (!question) return reply.code(404).send({ error: "question-not-found" });

      const choices = [...question.choices];
      for (let index = choices.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
      }
      const correctChoice = choices.find((choice) => choice.isCorrect);

      return reply.send({
        question: {
          id: question.id,
          text: question.text,
          theme: question.theme,
          difficulty: question.difficulty,
          img: toImgUrl(question.img),
          choices: choices.map(({ id, label }) => ({ id, label })),
          correctChoiceId: correctChoice?.id ?? null,
          correctAnswer: correctChoice?.label ?? "Réponse non renseignée",
        },
      });
    });

    app.post("/:questionId/reports", { preHandler: rateLimitPreHandler([{ rule: HTTP_LIMITS.reportSession, key: opaqueSessionKey }]) }, async (req, reply) => {
      const { user } = await currentUser(prisma, req);
      if (!user) return reply.code(401).send({ error: "unauthorized" });

      const Params = z.strictObject({ questionId: z.string().min(1) });
      const Body = z.strictObject({ reason: z.nativeEnum(QuestionReportReason) });

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
