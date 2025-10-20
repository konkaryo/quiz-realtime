// /server/src/domain/game/summary.service.ts

import { PrismaClient } from "@prisma/client";
import { toImgUrl } from "../media/media.service";

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

export async function buildPlayerSummary(
  prisma: PrismaClient,
  gameId: string,
  playerGameId: string
): Promise<QuestionRecap[]> {
  // On récupère l’ordre des questions joué + leurs choix
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      playerGames: { where: { id: playerGameId }, select: { id: true } },
      // Si tu stocks déjà l’ordre des questions ailleurs, adapte ici :
      // sinon, on lit via les Answer (index par createdAt)
    },
  });
  if (!game) return [];

  // Réponses du joueur + question associée + choix correct
  const answers = await prisma.answer.findMany({
    where: { playerGameId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      text: true,
      correct: true,
      responseMs: true,
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
  const rows: QuestionRecap[] = answers.map((a, i) => {
    const q = a.question!;
    const correctChoice = q.choices.find(c => c.isCorrect);
    const base =
      a.correct
        ? (correctChoice ? CFG.MC_ANSWER_POINTS_GAIN : CFG.TXT_ANSWER_POINTS_GAIN)
        : 0;

    return {
      index: i,
      questionId: q.id,
      text: q.text,
      img: toImgUrl(q.img || undefined),
      correctLabel: correctChoice?.label ?? null,
      yourAnswer: a.text,
      correct: a.correct,
      responseMs: a.responseMs ?? -1,
      points: base, // + éventuel bonus de vitesse si tu l’utilises (ajoute-le ici)
    };
  });

  return rows;
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