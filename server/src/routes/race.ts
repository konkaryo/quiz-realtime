import type { FastifyInstance } from "fastify";
import { PrismaClient, Theme } from "@prisma/client";
import { z } from "zod";
import * as media_service from "../domain/media/media.service";
import { norm, isFuzzyMatch } from "../domain/question/textmatch";
import { randomUUID } from "crypto";

type RaceQuestion = {
  id: string;
  text: string;
  theme: Theme | null;
  difficulty: string | null;
  img: string | null;
  choices: { id: string; label: string }[];
  correctChoiceId: string | null;
  correctLabel: string | null;
  acceptedNorms: string[];
};

type RaceStacks = {
  [difficulty: string]: RaceQuestion[];
};

const NON_DIVERS_THEMES = Object.values(Theme).filter((t) => t !== "DIVERS");
const DIFFICULTIES = ["1", "2", "3", "4"];
const STACK_SIZE = 50;

const raceSessions = new Map<string, RaceStacks>();
const buildingSessions = new Map<string, Promise<RaceStacks>>();

class StackBuildError extends Error {
  public readonly code: "empty-stack" | "build-failed";

  constructor(code: StackBuildError["code"], message?: string) {
    super(message);
    this.code = code;
  }
}

const difficultyForSpeed = (speed: number): string => {
  if (speed <= 25) return "1";
  if (speed <= 50) return "2";
  if (speed <= 75) return "3";
  return "4";
};

const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const shuffleWithoutConsecutiveThemes = (questions: RaceQuestion[]): RaceQuestion[] => {
  const isValid = (list: RaceQuestion[]) =>
    list.every((q, idx) => idx === 0 || q.theme !== list[idx - 1].theme);

  for (let attempt = 0; attempt < 300; attempt++) {
    const shuffled = shuffleArray(questions);
    if (isValid(shuffled)) return shuffled;
  }

  const remaining = [...questions];
  const output: RaceQuestion[] = [];

  while (remaining.length) {
    const lastTheme = output[output.length - 1]?.theme ?? null;
    const idx = remaining.findIndex((q) => q.theme !== lastTheme);
    const pickIndex = idx >= 0 ? idx : 0;
    const [picked] = remaining.splice(pickIndex, 1);
    output.push(picked);
  }

  return output;
};

const SLOW_POLL_DELAY_MS = 1_000;
const STACK_BUILD_TIMEOUT_MS = 60_000;

const ensureDifficultySupply = async (prisma: PrismaClient, difficulty: string) => {
  const startedAt = Date.now();

  while (true) {
    const grouped = await prisma.question.groupBy({
      by: ["theme"],
      where: { difficulty },
      _count: { _all: true },
    });

    const total = grouped.reduce((acc, g) => acc + g._count._all, 0);
    const hasPerTheme = NON_DIVERS_THEMES.every((theme) => {
      const found = grouped.find((g) => g.theme === theme);
      return (found?._count._all ?? 0) >= 3;
    });

    if (hasPerTheme && total >= STACK_SIZE) return;

    if (Date.now() - startedAt >= STACK_BUILD_TIMEOUT_MS) {
      throw new StackBuildError(
        "empty-stack",
        `Not enough questions to build stack for difficulty ${difficulty}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, SLOW_POLL_DELAY_MS));
  }
};

const buildStack = async (prisma: PrismaClient, difficulty: string): Promise<RaceQuestion[]> => {
  await ensureDifficultySupply(prisma, difficulty);

  const candidates = await prisma.question.findMany({
    where: { difficulty },
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

  const byTheme = new Map<Theme, typeof candidates>();
  for (const theme of NON_DIVERS_THEMES) {
    const themed = candidates.filter((q) => q.theme === theme);
    byTheme.set(theme, shuffleArray(themed));
  }

  const chosenIds = new Set<string>();

  for (const theme of NON_DIVERS_THEMES) {
    const themed = byTheme.get(theme) ?? [];
    const picks = themed.slice(0, 3);
    if (picks.length < 3) {
      throw new StackBuildError("empty-stack", `Missing themed questions for difficulty ${difficulty}`);
    }
    picks.forEach((q) => chosenIds.add(q.id));
  }

  const remainingPool = shuffleArray(
    candidates.filter((q) => !chosenIds.has(q.id)),
  );
  for (let i = 0; i < 8 && i < remainingPool.length; i++) {
    chosenIds.add(remainingPool[i].id);
  }

  if (chosenIds.size < STACK_SIZE) {
    const filler = remainingPool.filter((q) => !chosenIds.has(q.id));
    for (const q of filler) {
      chosenIds.add(q.id);
      if (chosenIds.size >= STACK_SIZE) break;
    }
  }

  if (chosenIds.size < STACK_SIZE) {
    throw new StackBuildError("empty-stack", `Not enough unique questions for difficulty ${difficulty}`);
  }

  const formatted: RaceQuestion[] = candidates
    .filter((q) => chosenIds.has(q.id))
    .map((q) => {
      const correct = q.choices.find((c) => c.isCorrect) ?? null;
      return {
        id: q.id,
        text: q.text,
        theme: q.theme ?? null,
        difficulty: q.difficulty ?? null,
        img: media_service.toImgUrl(q.img),
        choices: q.choices.map(({ id, label }) => ({ id, label })),
        correctChoiceId: correct?.id ?? null,
        correctLabel: correct?.label ?? null,
        acceptedNorms: q.acceptedAnswers.map((a) => a.norm),
      };
    });

    if (!formatted.length) {
    throw new StackBuildError("empty-stack", `No questions available for difficulty ${difficulty}`);
  }


  return shuffleWithoutConsecutiveThemes(formatted);
};

const getOrCreateRaceSession = async (prisma: PrismaClient, token: string): Promise<RaceStacks> => {
  if (raceSessions.has(token)) return raceSessions.get(token)!;
  if (buildingSessions.has(token)) return buildingSessions.get(token)!;

  const buildPromise = (async (): Promise<RaceStacks> => {
    const stacks: RaceStacks = {};
    for (const difficulty of DIFFICULTIES) {
      stacks[difficulty] = await buildStack(prisma, difficulty);
    }
    raceSessions.set(token, stacks);
    return stacks;
  })()
    .catch((err) => {
      if (err instanceof StackBuildError) throw err;
      throw new StackBuildError("build-failed", err instanceof Error ? err.message : String(err));
    })
    .finally(() => {
      buildingSessions.delete(token);
    });

  buildingSessions.set(token, buildPromise);
  return buildPromise;
};

export function raceRoutes({ prisma }: { prisma: PrismaClient }) {
  return async function (app: FastifyInstance) {
    app.get("/question", async (req, reply) => {
      try {
        const speedRaw = Number((req.query as any)?.speed ?? 0);
        const speed = Number.isFinite(speedRaw) ? Math.max(0, Math.min(100, speedRaw)) : 0;
        const sessionToken = (req.cookies as any)?.raceSession ?? randomUUID();

        const stacks = await getOrCreateRaceSession(prisma, sessionToken);
        reply.setCookie("raceSession", sessionToken, {
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
          sameSite: "lax",
          httpOnly: true,
        });
        const difficulty = difficultyForSpeed(speed);

        if (!stacks[difficulty] || !stacks[difficulty].length) {
          stacks[difficulty] = await buildStack(prisma, difficulty);
        }

        const q = stacks[difficulty].shift();
        if (!q) return reply.code(404).send({ error: "no-question" });

        return reply.send({ question: q });
      } catch (err) {
        if (err instanceof StackBuildError) {
          app.log.warn({ err }, "[race.question] stack build not ready");
          return reply.code(503).send({ error: err.code });
        }

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