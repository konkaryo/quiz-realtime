import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import * as media_service from "../domain/media/media.service";
import { norm, isFuzzyMatch } from "../domain/question/textmatch";

export function raceRoutes({ prisma }: { prisma: PrismaClient }) {
  return async function (app: FastifyInstance) {
    app.get("/question", async (_req, reply) => {
      try {
        const picks = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Question" ORDER BY random() LIMIT 1`;
        if (!picks.length) {
          return reply.code(404).send({ error: "no-question" });
        }
        const q = await prisma.question.findUnique({
          where: { id: picks[0].id },
          select: {
            id: true,
            text: true,
            theme: true,
            difficulty: true,
            img: true,
            choices: { select: { id: true, label: true, isCorrect: true } },
            acceptedAnswers: { select: { norm: true } },
          },
        });
        if (!q) return reply.code(404).send({ error: "not-found" });
        const correct = q.choices.find((c) => c.isCorrect) ?? null;
        return reply.send({
          question: {
            id: q.id,
            text: q.text,
            theme: q.theme,
            difficulty: q.difficulty,
            img: media_service.toImgUrl(q.img),
            choices: q.choices.map(({ id, label }) => ({ id, label })),
            correctChoiceId: correct?.id ?? null,
            correctLabel: correct?.label ?? null,
            acceptedNorms: q.acceptedAnswers.map((a) => a.norm),
          },
        });
      } catch (err) {
        app.log.error({ err }, "[race.question] failed");
        return reply.code(500).send({ error: "server-error" });
      }
    });

    app.post("/answer", async (req, reply) => {
      const Body = z.object({
        questionId: z.string().min(1),
        mode: z.enum(["text", "choice"]),
        text: z.string().trim().optional(),
        choiceId: z.string().optional(),
      });
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "bad-request" });
      }
      const { questionId, mode, text = "", choiceId } = parsed.data;
      try {
        const q = await prisma.question.findUnique({
          where: { id: questionId },
          select: {
            choices: { select: { id: true, label: true, isCorrect: true } },
            acceptedAnswers: { select: { norm: true } },
          },
        });
        if (!q) return reply.code(404).send({ error: "not-found" });

        const correctChoice = q.choices.find((c) => c.isCorrect) ?? null;
        let correct = false;

        if (mode === "choice") {
          correct = q.choices.some((c) => c.id === choiceId && c.isCorrect);
        } else {
          const candidate = norm(text || "");
          const accepted = q.acceptedAnswers.map((a) => a.norm);
          correct = isFuzzyMatch(candidate, accepted);
        }

        return reply.send({
          correct,
          correctChoiceId: correctChoice?.id ?? null,
          correctLabel: correctChoice?.label ?? null,
        });
      } catch (err) {
        app.log.error({ err }, "[race.answer] failed");
        return reply.code(500).send({ error: "server-error" });
      }
    });
  };
}