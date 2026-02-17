// server/src/domain/game/leaderboard.service.ts
import { PrismaClient } from "@prisma/client";
import type { GameState, StoredAnswer } from "../../types";
import * as media_service from "../media/media.service";


type LeaderboardRow = {
  id: string;
  playerId: string;
  name: string;
  score: number;
  img: string | null;
  experience: number;
  statsCorrect: number;
  statsCorrectQcm: number;
  statsWrong: number;
};

type PlayerStats = {
  correct: number;
  correctQcm: number;
  wrong: number;
};

const EMPTY_STATS: PlayerStats = { correct: 0, correctQcm: 0, wrong: 0 };

function computePlayerStatsFromAnswers(answers: StoredAnswer[]): PlayerStats {
  if (!answers.length) return EMPTY_STATS;

  const firstCorrectModeByQuestion = new Map<string, "text" | "mc">();
  const attemptedQuestions = new Set<string>();

  for (const answer of answers) {
    if (!answer?.questionId) continue;
    attemptedQuestions.add(answer.questionId);
    if (!answer.correct) continue;
    if (firstCorrectModeByQuestion.has(answer.questionId)) continue;
    firstCorrectModeByQuestion.set(answer.questionId, answer.mode);
  }

  let correct = 0;
  let correctQcm = 0;
  let wrong = 0;

  for (const questionId of attemptedQuestions) {
    const mode = firstCorrectModeByQuestion.get(questionId);
    if (!mode) wrong += 1;
    else if (mode === "text") correct += 1;
    else correctQcm += 1;
  }

  return { correct, correctQcm, wrong };
}


function sortWithTieBreak(lb: LeaderboardRow[], st?: GameState) {
  if (st && Array.isArray((st as any).answeredOrder)) {
    const order: string[] = (st as any).answeredOrder;
    const pos = new Map(order.map((pgId, i) => [pgId, i]));

    lb.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ia = pos.has(a.id) ? (pos.get(a.id) as number) : Number.POSITIVE_INFINITY;
      const ib = pos.has(b.id) ? (pos.get(b.id) as number) : Number.POSITIVE_INFINITY;
      if (ia !== ib) return ia - ib;
      return (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" });
    });

    return lb;
  }

  lb.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" });
  });

  return lb;
}




export async function buildLeaderboard(prisma: PrismaClient, gameId: string, onlyPgIds?: string[], st?: GameState) {
  if (st?.playerData) {
    const ids = onlyPgIds && onlyPgIds.length ? onlyPgIds : Array.from(st.playerData.keys());
    if (!ids.length) return [] as LeaderboardRow[];

    const metaByPgId = new Map<
      string,
      { playerId: string; name: string; img: string | null; experience: number }
    >();

    const rows = await prisma.playerGame.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        playerId: true,
        player: { select: { name: true, img: true, experience: true } },
      },
    });

    rows.forEach((r) =>
      metaByPgId.set(r.id, {
        playerId: r.playerId,
        name: r.player.name,
        img: r.player.img,
        experience: r.player.experience,
      }),
    );

    const lb = ids
      .map((id) => {
        const data = st.playerData.get(id);
        if (!data) return null;
        const meta = metaByPgId.get(id);
        const name = data.name ?? meta?.name ?? "";
        const img = media_service.toProfileUrl(data.img ?? meta?.img ?? null);
        const stats = computePlayerStatsFromAnswers(data.answers ?? []);

        return {
          id,
          playerId: meta?.playerId ?? "",
          name,
          score: data.score,
          img,
          experience: data.experience ?? meta?.experience ?? 0,
          statsCorrect: stats.correct,
          statsCorrectQcm: stats.correctQcm,
          statsWrong: stats.wrong,
        } as LeaderboardRow;
      })
      .filter(Boolean) as LeaderboardRow[];

    return sortWithTieBreak(lb, st);
  }
  const where =
    onlyPgIds && onlyPgIds.length
      ? { id: { in: onlyPgIds } }
      : { gameId }; // fallback (dev / compat)

  const rows = await prisma.playerGame.findMany({
    where,
    // on garde un premier tri DB par score desc pour limiter le travail en mémoire
    orderBy: [{ score: "desc" }],
    select: {
      id: true,
      score: true,
      playerId: true,
      player: { select: { name: true, img: true, experience: true } },
    },
  });

  const answers = await prisma.answer.findMany({
    where: {
      playerGameId: { in: rows.map((r) => r.id) },
      NOT: { questionId: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      playerGameId: true,
      questionId: true,
      correct: true,
      mode: true,
    },
  });

  const answersByPgId = new Map<string, StoredAnswer[]>();
  for (const answer of answers) {
    if (!answer.questionId) continue;

    const list = answersByPgId.get(answer.playerGameId) ?? [];
    list.push({
      questionId: answer.questionId,
      text: "",
      correct: answer.correct,
      mode: answer.mode as "text" | "mc",
      responseMs: 0,
      points: 0,
    });
    answersByPgId.set(answer.playerGameId, list);
  }

  const lb = rows.map((r) => {
    const stats = computePlayerStatsFromAnswers(answersByPgId.get(r.id) ?? []);

    return {
      id: r.id,
      playerId: r.playerId,
      name: r.player.name,
      score: r.score,
      img: media_service.toProfileUrl(r.player.img),
      experience: r.player.experience,
      statsCorrect: stats.correct,
      statsCorrectQcm: stats.correctQcm,
      statsWrong: stats.wrong,
    };
  });

  return sortWithTieBreak(lb, st);
}
