// /server/src/domain/game/summary.service.ts

import { PrismaClient } from "@prisma/client";
import { toImgUrl } from "../media/media.service";
import type { RoundQuestion } from "../../types";

type Mode = 'text' | 'mc';

export type QuestionRecap = {
  index: number;                  // 0-based
  questionId: string;
  text: string;
  img?: string | null;
  correctLabel?: string | null;   // libellé de la bonne réponse si QCM
  yourAnswer?: string | null;     // texte/choix envoyé par le joueur
  correct: boolean;
  responseMs: number;             // -1 si inconnu
  points: number;                 // points gagnés sur cette question
  stats?: QuestionStats;
};

export type QuestionStats = {
  correct: number;    // 1ère bonne tentative en mode text
  correctQcm: number; // 1ère bonne tentative en mode mc
  wrong: number;      // aucune bonne tentative
};

type QuestionMeta = {
  index: number;
  text: string;
  img: string | null;
  correctLabel: string | null;
};

export async function buildPlayerSummary(
  prisma: PrismaClient,
  gameId: string,
  playerGameId: string,
  orderedQuestions?: readonly RoundQuestion[]
): Promise<QuestionRecap[]> {
  // On récupère l’ordre des questions joué + leurs choix
  const playerGame = await prisma.playerGame.findFirst({
    where: { id: playerGameId, gameId },
    select: {
      id: true,
      questions: {
        select: {
          id: true,
          text: true,
          img: true,
          choices: { select: { label: true, isCorrect: true } },
        },
      },
      // Si tu stocks déjà l’ordre des questions ailleurs, adapte ici :
      // sinon, on lit via les Answer (index par createdAt)
    },
  });
  if (!playerGame) return [];

  // Réponses du joueur + question associée + choix correct
  const answers = await prisma.answer.findMany({
    where: { playerGameId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      text: true,
      correct: true,
      responseMs: true,
      points: true,
      question: {
        select: {
          id: true,
          text: true,
          img: true,
          choices: { select: { label: true, isCorrect: true } },
        },
      },
    },
  });

  // Pour estimer les points, on peut reconstituer à partir des règles CFG
  // Si tu préfères, tu peux ajouter une colonne "points" à Answer.
  const { CFG } = require("../../config");

  const metas = new Map<string, QuestionMeta>();
  if (orderedQuestions?.length) {
    orderedQuestions.forEach((q, idx) => {
      metas.set(q.id, {
        index: idx,
        text: q.text,
        img: q.img ?? null,
        correctLabel: q.correctLabel?.trim() ? q.correctLabel : null,
      });
    });
  }

   if (playerGame.questions?.length) {
    playerGame.questions.forEach((q, idx) => {
      const correctChoice = q.choices.find((c) => c.isCorrect);
      const fallbackLabel = correctChoice?.label ?? null;
      const meta = metas.get(q.id);
      const img = toImgUrl(q.img || undefined);
      if (!meta) {
        metas.set(q.id, {
          index: metas.size > 0 && !orderedQuestions?.length ? idx : metas.size,
          text: q.text,
          img,
          correctLabel: fallbackLabel,
        });
        return;
      }

      if (!meta.text) meta.text = q.text;
      if (!meta.img) meta.img = img;
      if (!meta.correctLabel && fallbackLabel) meta.correctLabel = fallbackLabel;
    });
  }

  let nextIndex = metas.size;
  const ensureMeta = (
    questionId: string,
    fallback: { text: string; img?: string | null; correctLabel?: string | null }
  ): QuestionMeta => {
    let meta = metas.get(questionId);
    if (!meta) {
      meta = {
        index: nextIndex++,
        text: fallback.text,
        img: toImgUrl(fallback.img || undefined),
        correctLabel: fallback.correctLabel ?? null,
      };
      metas.set(questionId, meta);
      return meta;
    }

    if (!meta.text) meta.text = fallback.text;
    if (!meta.img) meta.img = toImgUrl(fallback.img || undefined);
    if (!meta.correctLabel && fallback.correctLabel) meta.correctLabel = fallback.correctLabel;
    return meta;
  };

  const byQuestion = new Map<string, QuestionRecap[]>();

  for (const a of answers) {  

    const q = a.question!;
    const correctChoice = q.choices.find(c => c.isCorrect);

    const fallbackLabel = correctChoice?.label ?? null;
    const meta = ensureMeta(q.id, {
      text: q.text,
      img: q.img,
      correctLabel: fallbackLabel,
    });

    const base = a.correct ? (correctChoice ? CFG.MC_ANSWER_POINTS_GAIN : CFG.TXT_ANSWER_POINTS_GAIN) : 0;
    const gained = typeof a.points === "number" ? a.points : base;

    const entry: QuestionRecap = {
      index: meta.index,
      questionId: q.id,
      text: meta.text,
      img: meta.img,
      correctLabel: meta.correctLabel ?? fallbackLabel,
      yourAnswer: a.text,
      correct: a.correct,
      responseMs: a.responseMs ?? -1,
      points: gained
    };

    const list = byQuestion.get(q.id);
    if (list) list.push(entry);
    else byQuestion.set(q.id, [entry]);
  }

  for (const [questionId, meta] of metas) {
    const list = byQuestion.get(questionId);
    if (!list || list.length === 0) {
      byQuestion.set(questionId, [
        {
          index: meta.index,
          questionId,
          text: meta.text,
          img: meta.img,
          correctLabel: meta.correctLabel,
          yourAnswer: null,
          correct: false,
          responseMs: -1,
          points: 0,
        },
      ]);
      continue;
    }

    byQuestion.set(
      questionId,
      list.map((item) => ({
        ...item,
        index: meta.index,
        text: meta.text,
        img: meta.img,
        correctLabel: meta.correctLabel ?? item.correctLabel ?? null,
      }))
    );
  }

  const ordered = Array.from(byQuestion.values()).sort((a, b) => {
    const ia = a[0]?.index ?? 0;
    const ib = b[0]?.index ?? 0;
    return ia - ib;
  });

  return ordered.flatMap((items) => items);
}

export async function buildRoomQuestionStats(
  prisma: PrismaClient,
  gameId: string
): Promise<Map<string, QuestionStats>> {
  const answers = await prisma.answer.findMany({
    where: {
      playerGame: { gameId },
      // on écarte les null pour que Prisma renvoie bien string, pas string|null
      NOT: { questionId: null },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      questionId: true,       // <- string (non-null grâce au NOT)
      playerGameId: true,
      correct: true,
      mode: true,             // enum Prisma -> 'text' | 'mc' après cast
    },
  });

  const firstCorrectByQPlayer = new Map<string, Map<string, Mode>>();
  const playersByQuestion = new Map<string, Set<string>>();

  for (const a of answers) {
    // garde de sécurité au cas où le schéma permettrait encore null
    if (!a.questionId) continue;
    const qid = a.questionId as string;
    const mode = (a.mode as unknown as Mode);

    if (!playersByQuestion.has(qid)) playersByQuestion.set(qid, new Set());
    playersByQuestion.get(qid)!.add(a.playerGameId);

    if (!a.correct) continue;

    let m = firstCorrectByQPlayer.get(qid);
    if (!m) { m = new Map(); firstCorrectByQPlayer.set(qid, m); }
    if (!m.has(a.playerGameId)) {
      // réponses triées ASC: la première bonne rencontrée est retenue
      m.set(a.playerGameId, mode);
    }
  }

  const out = new Map<string, QuestionStats>();
  for (const [qid, players] of playersByQuestion) {
    const first = firstCorrectByQPlayer.get(qid) ?? new Map();
    let correct = 0, correctQcm = 0, wrong = 0;
    for (const pgId of players) {
      const m = first.get(pgId);
      if (!m) wrong++;
      else if (m === 'text') correct++;
      else correctQcm++;
    }
    out.set(qid, { correct, correctQcm, wrong });
  }

  return out;
}