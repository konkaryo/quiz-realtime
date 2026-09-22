//server/src/domain/game/game.service.ts
import { PrismaClient, Prisma, Theme, AnswerMode } from "@prisma/client";
import type { Client, RoundQuestion, GameState, StoredAnswer } from "../../types";
import { Server } from "socket.io";
import * as room_service from "../room/room.service";
import * as media_service from "../media/media.service";
import * as lb_service from "../game/leaderboard.service";
import { scheduleBotAnswers } from "../bot/bot.service";
import { quotasFromPercent } from "../question/distribution";
import { rebalanceBotsAfterGame } from "../bot/traffic";
import { buildPlayerSummary, buildRoomQuestionStats } from "./summary.service";
import { awardBitsForGame } from "./bits-reward.service";
import { awardXpForGame } from "./xp-reward.service";
import { emitPublicRoomsUpdated } from "../room/public-room-events";
import { CFG } from "../../config";
import { completeQuestionForPlayers, isPlayerInactive } from "./player-activity.service";

type Leaderboard = Awaited<ReturnType<typeof lb_service.buildLeaderboard>>;

async function getManualQuestionLaunch(prisma: PrismaClient, roomId: string) {
  const rows = await prisma.$queryRaw<Array<{ manualQuestionLaunch: boolean }>>`
    SELECT "manualQuestionLaunch" FROM "Room" WHERE "id" = ${roomId} LIMIT 1
  `;
  return rows[0]?.manualQuestionLaunch ?? false;
}

async function getSpeedBonusEnabled(prisma: PrismaClient, roomId: string) {
  const rows = await prisma.$queryRaw<Array<{ speedBonusEnabled: boolean }>>`
    SELECT "speedBonusEnabled" FROM "Room" WHERE "id" = ${roomId} LIMIT 1
  `;
  return rows[0]?.speedBonusEnabled ?? true;
}

const DEFAULT_DIFFICULTY_PERCENT = 50;

const shuffle = <T,>(values: T[]): T[] => {
  const items = [...values];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

const buildThemeSequence = (total: number, themes: Theme[]): Theme[] => {
  if (total <= 0) return [];
  if (themes.length === 0) {
    throw new Error("No themes available for selection.");
  }

  const T = themes.length;
  if (total <= T) {
    return shuffle(themes).slice(0, total);
  }

  const Q = Math.floor(total / T);
  const R = total % T;
  const blocks: Theme[] = [];

  for (let i = 0; i < Q; i += 1) {
    blocks.push(...shuffle(themes));
  }

  if (R > 0) {
    blocks.push(...shuffle(themes).slice(0, R));
  }

  return blocks;
};

const difficultyFallbacks = (level: number) => {
  const levels = [1, 2, 3, 4];
  const rest = levels.filter((l) => l !== level);
  rest.sort((a, b) => {
    const da = Math.abs(a - level);
    const db = Math.abs(b - level);
    if (da !== db) return da - db;
    return a - b;
  });
  return [level, ...rest];
};

const toDifficultyList = ([n1, n2, n3, n4]: [number, number, number, number]) => [
  ...Array.from({ length: n1 }, () => 1),
  ...Array.from({ length: n2 }, () => 2),
  ...Array.from({ length: n3 }, () => 3),
  ...Array.from({ length: n4 }, () => 4),
];

type Row = { id: string };

const fetchQuestionId = async (
  prisma: PrismaClient,
  theme: Theme,
  difficulty: number,
  excludedIds: string[]
): Promise<string | null> => {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT "id" FROM "Question"
    WHERE "theme" = ${theme}::"Theme"
    AND "difficulty" = ${String(difficulty)}
    AND ("id" NOT IN (${Prisma.join(excludedIds.length ? excludedIds : [""])}) OR ${excludedIds.length === 0})
    ORDER BY random()
    LIMIT 1;
  `;
  return rows[0]?.id ?? null;
};

const pickQuestionId = async (
  prisma: PrismaClient,
  theme: Theme,
  difficulty: number,
  excludedIds: string[],
  fallbackThemes: Theme[]
): Promise<string | null> => {
  const fallbackLevels = difficultyFallbacks(difficulty);
  for (const level of fallbackLevels) {
    const id = await fetchQuestionId(prisma, theme, level, excludedIds);
    if (id) return id;
  }

  const shuffledThemes = shuffle(fallbackThemes.filter((t) => t !== theme));
  for (const candidate of shuffledThemes) {
    for (const level of fallbackLevels) {
      const id = await fetchQuestionId(prisma, candidate, level, excludedIds);
      if (id) return id;
    }
  }

  return null;
};

/* ---------------------------------------------------------------------------------------- */
export async function startGameForRoom(
  clients: Map<string, Client>,
  gameStates: Map<string, GameState>,
  io: Server,
  prisma: PrismaClient,
  roomId: string
) {

  const running = gameStates.get(roomId);
  // L'état terminé conserve le timer d'affichage du classement final. Toute
  // tentative de démarrage (joueur, propriétaire ou bot) doit attendre que ce
  // timer supprime l'état avant de lancer la partie suivante.
  if (running?.finished) return;

  if (running) {
    const refreshed = await room_service.ensurePlayerGamesForRoom(clients, running.gameId, io, prisma, roomId);
    const missing = refreshed.filter((pg) => !running.pgIds.has(pg.id));
    for (const pg of refreshed) { running.pgIds.add(pg.id); }
    if (missing.length) {
      const meta = await prisma.playerGame.findMany({
        where: { id: { in: missing.map((m) => m.id) } },
        select: { id: true, player: { select: { name: true, img: true, experience: true } } },
      });
      for (const pg of meta) {
        running.playerData.set(pg.id, {
          score: 0,
          answers: [],
          name: pg.player.name,
          img: pg.player.img,
          experience: pg.player.experience,
        });
      }
    }
    return;
  }

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return;
  const [manualQuestionLaunch, speedBonusEnabled] = await Promise.all([
    getManualQuestionLaunch(prisma, room.id),
    getSpeedBonusEnabled(prisma, room.id),
  ]);
  const game = await room_service.getOrCreateCurrentGame(prisma, room.id);
  let pgs = await room_service.ensurePlayerGamesForRoom(clients, game.id, io, prisma, room.id);

  const playersMeta = await prisma.playerGame.findMany({
    where: { id: { in: pgs.map((p) => p.id) } },
    select: { id: true, player: { select: { name: true, img: true, experience: true } } },
  });
  const playerData = new Map<
    string,
    { score: number; answers: StoredAnswer[]; name?: string; img?: string | null; experience?: number }
  >();
  playersMeta.forEach((pg) => {
    playerData.set(pg.id, {
      score: 0,
      answers: [],
      name: pg.player.name,
      img: pg.player.img,
      experience: pg.player.experience,
    });
  });

  const QUESTION_COUNT =
    typeof room.questionCount === "number" && Number.isFinite(room.questionCount)
      ? room.questionCount
      : Number(process.env.QUESTION_COUNT || 10);

  const difficultyPercent =
    typeof room.difficulty === "number" && Number.isFinite(room.difficulty)
      ? room.difficulty
      : DEFAULT_DIFFICULTY_PERCENT;

  const banned = (room.bannedThemes ?? []) as Theme[];
  const selectableThemes = Object.values(Theme).filter((theme) => !banned.includes(theme));

  let themeSequence: Theme[] = [];
  try {
    themeSequence = buildThemeSequence(QUESTION_COUNT, selectableThemes);
  } catch (error) {
    io.to(room.id).emit("error_msg", "pool insuffisant");
    return;
  }

  const [n1, n2, n3, n4] = quotasFromPercent(difficultyPercent, QUESTION_COUNT);
  const difficultySequence = shuffle(toDifficultyList([n1, n2, n3, n4]));
  if (difficultySequence.length !== QUESTION_COUNT) {
    io.to(room.id).emit("error_msg", "pool insuffisant");
    return;
  }
  const pairs = themeSequence.map((theme, index) => ({
    theme,
    level: difficultySequence[index],
  }));

  pairs.sort((a, b) => a.level - b.level);

  let qIds: string[] = [];
  for (const pair of pairs) {
    const picked = await pickQuestionId(prisma, pair.theme, pair.level, qIds, selectableThemes);
    if (!picked) {
      io.to(room.id).emit("error_msg", "pool insuffisant");
      return;
    }
    qIds.push(picked);
  }

  await prisma.$transaction(async (tx) => {
    for (const pg of pgs) {
      await tx.playerGame.update({ where: { id: pg.id }, data: { questions: { set: [] } } });
      await tx.playerGame.update({
        where: { id: pg.id },
        data: { questions: { connect: qIds.map((id: string) => ({ id })) } }
      });
    }
    await tx.playerGame.updateMany({
      where: { gameId: game.id, id: { in: pgs.map(p => p.id) } },
      data: { score: 0 }
    });
    await tx.game.update({ where: { id: game.id }, data: { state: "running" } });
  });

  const raw = await prisma.question.findMany({
    where: { id: { in: qIds } },
    select: {
      id: true, text: true, theme: true, difficulty: true, img: true,
      choices: { select: { id: true, label: true, isCorrect: true } },
      acceptedAnswers: { select: { norm: true } },
      exactAnswers: { select: { norm: true } },
    },
  });

  const full: RoundQuestion[] = raw.map((q) => {
    const correct = q.choices.find((c) => c.isCorrect);
    return {
      id: q.id,
      text: q.text,
      theme: q.theme ?? null,
      difficulty: q.difficulty ?? null,
      img: media_service.toImgUrl(q.img),
      choices: q.choices,
      acceptedNorms: q.acceptedAnswers.map((a) => a.norm),
      exactNorms: q.exactAnswers.map((a) => a.norm),
      correctLabel: correct ? correct.label : "",
    };
  });
  const byId = new Map(full.map((q) => [q.id, q]));
  const ordered: RoundQuestion[] = qIds.map((id) => byId.get(id)!).filter(Boolean) as RoundQuestion[];

  const prev = gameStates.get(room.id);
  if (prev?.timer) clearTimeout(prev.timer);

  const st: GameState = {
    roomId: room.id,
    gameId: game.id,
    questions: ordered,
    index: 0,
    answeredThisRound: new Set<string>(),
    answeredOrderText: [],
    answeredOrder: [],
    mcModePgIds: new Set<string>(),
    qcmUsesByPgId: new Map<string, number>(),
    pgIds: new Set(pgs.map((p) => p.id)),
    attemptsThisRound: new Map<string, number>(),
    attemptedThisRound: new Set<string>(),
    answerAttempts: Math.min(4, Math.max(1, room.answerAttempts ?? CFG.TEXT_LIVES)),
    qcmUses: Math.min(QUESTION_COUNT, Math.max(0, room.qcmUses ?? CFG.ROOM_QCM_USES)),
    isPublicRoom: room.visibility === "PUBLIC",
    difficulty: difficultyPercent,
    roundMs: room.roundMs ?? Number(process.env.ROUND_MS || 10000),
    dynamicQuestionDisplay: room.dynamicQuestionDisplay ?? true,
    manualQuestionLaunch,
    speedBonusEnabled,
    waitingForManualLaunch: false,
    roundSeq: 0,
    finished: false,
    playerData,
    persistedResults: false,
  };
  gameStates.set(room.id, st);

  const gameRoom = `game:${st.gameId}`;
  for (const [sid, c] of clients) {
    if (c.roomId !== room.id) continue;
    if (!st.pgIds.has(c.playerGameId)) continue;
    io.sockets.sockets.get(sid)?.join(gameRoom);
  }

  const countdownSeconds = Math.max(0, Number(process.env.GAME_COUNTDOWN_SECONDS || 10));
  if (countdownSeconds > 0) {
    const countdownUid = `${st.gameId}:pregame:${Date.now()}`;
    st.roundUid = countdownUid;
    const endsAt = Date.now() + countdownSeconds * 1000;
    st.countdownEndsAt = endsAt;
    io.to(room.id).emit("game_countdown", {
      seconds: countdownSeconds,
      endsAt,
      serverNow: Date.now(),
      qcmUsesLeft: st.qcmUses,
      answerAttempts: st.answerAttempts,
    });
    emitPublicRoomsUpdated(io);
    st.timer = setTimeout(() => {
      if (st.roundUid !== countdownUid) return;
      startRound(clients, gameStates, io, prisma, st).catch((err) =>
        console.error("[startRound error]", err)
      );
    }, countdownSeconds * 1000);
    void lb_service.buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds), st)
      .then((leaderboard) => io.to(st.roomId).emit("leaderboard_update", { leaderboard }))
      .catch((err) => console.error("[leaderboard game countdown]", err));
  } else {
    await startRound(clients, gameStates, io, prisma, st);
  }
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export async function stopGameForRoom(
  clients: Map<string, Client>,
  gameStates: Map<string, GameState>,
  io: Server,
  prisma: PrismaClient,
  roomId: string
) {
  const st = gameStates.get(roomId);
  if (st?.timer) clearTimeout(st.timer);

  if (st) {
    try {
      await persistGameResults(prisma, st);
    } catch (err) {
      console.error("[stopGameForRoom persist]", err);
    }
  }

  if (st) st.finished = true;

  gameStates.delete(roomId);

  if (st?.gameId) {
    try { await prisma.game.update({ where: { id: st.gameId }, data: { state: "ended" } }); }
    catch { }
  }
  io.to(roomId).emit("game_stopped");
  emitPublicRoomsUpdated(io);
}
/* ---------------------------------------------------------------------------------------- */

async function persistGameResults(prisma: PrismaClient, st: GameState) {
  if (st.persistedResults || !st.playerData) return;

  const answers: Array<{ playerGameId: string; questionId: string; text: string; correct: boolean; mode: AnswerMode; responseMs: number; points: number }> = [];
  const scores: Array<{ id: string; score: number }> = [];

  for (const [pgId, data] of st.playerData.entries()) {
    scores.push({ id: pgId, score: data.score });
    for (const ans of data.answers) {
      answers.push({
        playerGameId: pgId,
        questionId: ans.questionId,
        text: ans.text,
        correct: ans.correct,
        mode: ans.mode === "mc" ? AnswerMode.mc : AnswerMode.text,
        responseMs: ans.responseMs,
        points: ans.points,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (answers.length) {
      await tx.answer.createMany({ data: answers });
    }
    for (const entry of scores) {
      await tx.playerGame.update({ where: { id: entry.id }, data: { score: entry.score } });
    }
  });

  st.persistedResults = true;
}
/* ---------------------------------------------------------------------------------------- */


async function startRound(
  clients: Map<string, Client>,
  gameStates: Map<string, GameState>,
  io: Server,
  prisma: PrismaClient,
  st: GameState
) {
  const q = st.questions[st.index]; if (!q) return;

  // --- Guard: invalide l'ancien timer
  if (st.timer) { clearTimeout(st.timer); st.timer = undefined; }

  // --- NEW: séquence + UID de round
  st.roundSeq = (st.roundSeq ?? 0) + 1;
  st.roundUid = `${st.gameId}:${st.index}:${st.roundSeq}`;
  const myUid = st.roundUid;

  const ROUND_MS = st.roundMs ?? Number(process.env.ROUND_MS || 10000);

  st.waitingForManualLaunch = false;
  st.countdownEndsAt = undefined;
  st.answeredThisRound.clear();
  st.answeredOrderText = [];
  st.attemptsThisRound = new Map();
  st.attemptedThisRound = new Set();
  st.mcModePgIds = new Set<string>();
  st.roundStartMs = Date.now();
  st.endsAt = st.roundStartMs + ROUND_MS;

  // ... emit round_begin (on peut aussi envoyer roundUid si tu veux)
  io.to(st.roomId).emit("round_begin", {
    index: st.index,
    total: st.questions.length,
    startedAt: st.roundStartMs,
    endsAt: st.endsAt,
    durationMs: ROUND_MS,
    question: { id: q.id, text: q.text, img: q.img, theme: q.theme, difficulty: q.difficulty },
    textLives: st.answerAttempts,
    dynamicQuestionDisplay: st.dynamicQuestionDisplay,
    manualQuestionLaunch: st.manualQuestionLaunch,
    speedBonusEnabled: st.speedBonusEnabled,
    serverNow: Date.now()
    // optional: roundUid: myUid
  });
  emitPublicRoomsUpdated(io);

  // Arm the round timeout before any asynchronous side work. Bot scheduling or
  // leaderboard queries must never be able to leave a round without an end.
  st.timer = setTimeout(() => {
    if (st.roundUid !== myUid) return;
    endRound(clients, gameStates, io, prisma, st, myUid).catch(err => console.error("[endRound error]", err));
  }, ROUND_MS);

  // Planifier les bots pour CE round uniquement
  void scheduleBotAnswers(prisma, io, clients, st, myUid).catch((e) => console.error(e));

  // Leaderboard initial
  lb_service.buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds), st)
    .then((lb) => io.to(st.roomId).emit("leaderboard_update", { leaderboard: lb }))
    .catch((err) => console.error("[leaderboard startRound]", err));

}
/* ---------------------------------------------------------------------------------------- */

async function endRound(
  clients: Map<string, Client>,
  gameStates: Map<string, GameState>,
  io: Server,
  prisma: PrismaClient,
  st: GameState,
  myUid?: string
) {
  if (myUid && st.roundUid !== myUid) return;

  const q = st.questions[st.index]; if (!q) return;

  const leaderboard = await lb_service.buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds), st);
  const playerIdByPgId = new Map(leaderboard.map((player) => [player.id, player.playerId]));
  const attemptedPlayerIds = new Set(
    Array.from(st.attemptedThisRound, (playerGameId) => playerIdByPgId.get(playerGameId)).filter(Boolean) as string[],
  );
  const playerIds = leaderboard.map((player) => player.playerId).filter(Boolean);
  completeQuestionForPlayers(st.roomId, playerIds, attemptedPlayerIds);
  leaderboard.forEach((player) => {
    player.inactive = isPlayerInactive(st.roomId, player.playerId);
  });
  const correct = q.choices.find(c => c.isCorrect) || null;
  const leaderboardById = new Map(leaderboard.map((player) => [player.id, player]));
  const speedLeaders = Array.from(st.playerData.entries())
    .flatMap(([playerGameId, player]) => {
      const answer = player.answers
        .filter((item) => item.questionId === q.id && item.correct)
        .sort((a, b) => a.responseMs - b.responseMs)[0];
      const profile = leaderboardById.get(playerGameId);
      return answer
        ? [{
            id: playerGameId,
            playerId: profile?.playerId ?? null,
            name: profile?.name ?? player.name ?? "Joueur",
            img: profile?.img ?? null,
            responseMs: answer.responseMs,
            points: answer.points,
            mode: answer.mode,
          }]
        : [];
    })
    .sort((a, b) => {
      if (a.mode !== b.mode) return a.mode === "text" ? -1 : 1;
      return a.responseMs - b.responseMs || b.points - a.points;
    });

  io.to(st.roomId).emit("round_end", {
    index: st.index,
    correctChoiceId: correct ? correct.id : null,
    correctLabel: correct ? correct.label : null,
    leaderboard,
  });
  emitPublicRoomsUpdated(io);

  st.endsAt = undefined;
  const feedbackMs = Math.max(0, Number(process.env.ROUND_FEEDBACK_MS || 1800));
  const resultsMs = Math.max(0, Number(process.env.ROUND_RESULTS_MS || 5500));
  const resultsEndsAt = Date.now() + feedbackMs + resultsMs;
  const emitSpeedLeaders = (roundUid: string, index: number) => {
    setTimeout(() => {
      if (st.roundUid !== roundUid) return;
      io.to(st.roomId).emit("round_speed", {
        index,
        speedLeaders,
        endsAt: resultsEndsAt,
        durationMs: resultsMs,
        serverNow: Date.now(),
      });
    }, feedbackMs);
  };

  const hasNext = st.index + 1 < st.questions.length;
  if (!hasNext) {
    const finalGapMs = feedbackMs + resultsMs;
    const finalGapUid = `${st.gameId}:${st.index}:finalgap:${Date.now()}`;
    st.roundUid = finalGapUid;
    emitSpeedLeaders(finalGapUid, st.index);

    if (st.timer) { clearTimeout(st.timer); }
    st.timer = setTimeout(() => {
      if (st.roundUid !== finalGapUid) return;
      finalizeGameAfterReveal(clients, gameStates, io, prisma, st, leaderboard)
        .catch(err => console.error("[finalizeGame error]", err));
    }, finalGapMs);

    return;
  }

  const GAP_MS = feedbackMs + resultsMs;
  st.index += 1;
  const nextDelayUid = `${st.gameId}:${st.index}:gap:${Date.now()}`;
  st.roundUid = nextDelayUid; // invalide l'ancien round/timeout pendant l'attente
  st.waitingForManualLaunch = false;
  emitSpeedLeaders(nextDelayUid, st.index - 1);

  if (st.manualQuestionLaunch) {
    st.timer = setTimeout(() => {
      if (st.roundUid !== nextDelayUid) return;
      st.timer = undefined;
      st.waitingForManualLaunch = true;
      io.to(st.roomId).emit("manual_round_ready", {
        index: st.index,
        total: st.questions.length,
      });
    }, GAP_MS);
    return;
  }
  st.timer = setTimeout(() => {
    // si l’UID a changé (ex: stopGame), on ne lance pas
    if (st.roundUid !== nextDelayUid) return;
    startRound(clients, gameStates, io, prisma, st).catch(err => console.error("[startRound error]", err));
  }, GAP_MS);
}

export async function launchNextManualRound(
  clients: Map<string, Client>,
  gameStates: Map<string, GameState>,
  io: Server,
  prisma: PrismaClient,
  roomId: string,
) {
  const st = gameStates.get(roomId);
  if (!st || st.finished) return { ok: false as const, reason: "no-state" as const };
  if (!st.manualQuestionLaunch) return { ok: false as const, reason: "manual-launch-disabled" as const };
  if (!st.waitingForManualLaunch) return { ok: false as const, reason: "not-ready" as const };
  if (st.index < 0 || st.index >= st.questions.length) return { ok: false as const, reason: "no-question" as const };

  st.waitingForManualLaunch = false;
  if (st.timer) { clearTimeout(st.timer); st.timer = undefined; }
  await startRound(clients, gameStates, io, prisma, st);
  return { ok: true as const };
}

async function finalizeGameAfterReveal(
  clients: Map<string, Client>,
  gameStates: Map<string, GameState>,
  io: Server,
  prisma: PrismaClient,
  st: GameState,
  leaderboard: Leaderboard,
) {
  st.timer = undefined;

  await persistGameResults(prisma, st);

  await prisma.game.update({ where: { id: st.gameId }, data: { state: "ended" } });

  const awarded = await awardBitsForGame(prisma, st.gameId, leaderboard);
  const xpAwarded = await awardXpForGame(prisma, st.gameId, leaderboard);

  const FINAL_LB_MS = Number(process.env.FINAL_LB_MS || 30000);
  io.to(st.roomId).emit("final_leaderboard", { leaderboard, displayMs: FINAL_LB_MS });
  emitPublicRoomsUpdated(io);
  if (awarded.length) {
    io.to(st.roomId).emit("bits_awarded", {
      rewards: awarded.map(({ playerGameId, rank, bits }) => ({ playerGameId, rank, bits })),
    });
  }

  if (xpAwarded.length) {
    io.to(st.roomId).emit("xp_awarded", {
      rewards: xpAwarded.map(({ playerGameId, xp }) => ({ playerGameId, xp })),
    });
  }

  const statsMap = await buildRoomQuestionStats(prisma, st.gameId);

  for (const [socketId, client] of clients) {
    if (client.roomId !== st.roomId) continue;

    const summary = await buildPlayerSummary(prisma, st.gameId, client.playerGameId, st.questions);

    const enriched = summary.map(item => ({
      ...item,
      stats: statsMap.get(item.questionId) ?? { correct: 0, correctQcm: 0, wrong: 0 },
    }));

    io.to(socketId).emit("final_summary", { summary: enriched });
  }

  st.finished = true;

  // Crée la prochaine game AVANT le rééquilibrage pour disposer du vrai nextGameId
  const { gameId: nextGameId } = await room_service.createNextGameFrom(prisma, st.gameId);

  // Rééquilibrage des bots pour la prochaine partie (sur la même room)
  const room = await prisma.room.findUnique({
    where: { id: st.roomId },
    select: { id: true, visibility: true, popularity: true, difficulty: true },
  });
  if (room && room.visibility === "PUBLIC") {
    const xMax = Number(process.env.BOT_TRAFFIC_MAX || 100); // affluence max globale
    await rebalanceBotsAfterGame({
      prisma, io, clients,
      room: {
        id: room.id,
        visibility: room.visibility,
        traffic: room.popularity ?? 5,
        difficulty: room.difficulty,
      },
      gameId: nextGameId, // ✅ on passe le vrai gameId cible
      xMax,
    });

  }

  const restartUid = `${st.gameId}:finalLb:${Date.now()}`;
  st.roundUid = restartUid;
  st.timer = setTimeout(async () => {
    if (st.roundUid !== restartUid) return;

    const current = gameStates.get(st.roomId);
    if (current && current.gameId !== st.gameId) {
      return;
    }

    gameStates.delete(st.roomId);
    await room_service.ensurePlayerGamesForRoom(clients, nextGameId, io, prisma, st.roomId);
    await startGameForRoom(clients, gameStates, io, prisma, st.roomId);
  }, FINAL_LB_MS);
}
