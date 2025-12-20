//server/src/domain/game/game.service.ts
import { PrismaClient, Prisma, Theme, AnswerMode } from "@prisma/client";
import type { Client, RoundQuestion, GameState, StoredAnswer } from "../../types";
import { Server } from "socket.io";
import * as room_service from "../room/room.service";
import * as media_service from "../media/media.service";
import * as lb_service from "../game/leaderboard.service";
import { scheduleBotAnswers } from "../bot/bot.service";
import { QUESTION_DISTRIBUTION, quotasFromDistribution } from "../question/distribution";
import { rebalanceBotsAfterGame } from "../bot/traffic";
import { buildPlayerSummary, buildRoomQuestionStats } from "./summary.service";

type Leaderboard = Awaited<ReturnType<typeof lb_service.buildLeaderboard>>;

/* ---------------------------------------------------------------------------------------- */
export async function startGameForRoom(
  clients: Map<string, Client>,
  gameStates: Map<string, GameState>,
  io: Server,
  prisma: PrismaClient,
  roomId: string
) {

  const running = gameStates.get(roomId);
  if (running && !running.finished) {
    const refreshed = await room_service.ensurePlayerGamesForRoom(clients, running.gameId, io, prisma, roomId);
    const missing = refreshed.filter((pg) => !running.pgIds.has(pg.id));
    for (const pg of refreshed) { running.pgIds.add(pg.id); }
    if (missing.length) {
      const meta = await prisma.playerGame.findMany({
        where: { id: { in: missing.map((m) => m.id) } },
        select: { id: true, player: { select: { name: true, img: true } } },
      });
      for (const pg of meta) {
        running.playerData.set(pg.id, { score: 0, answers: [], name: pg.player.name, img: pg.player.img });
      }
    }
    return;
  }

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return;

  const game = await room_service.getOrCreateCurrentGame(prisma, room.id);
  let pgs = await room_service.ensurePlayerGamesForRoom(clients, game.id, io, prisma, room.id);

  const playersMeta = await prisma.playerGame.findMany({
    where: { id: { in: pgs.map((p) => p.id) } },
    select: { id: true, player: { select: { name: true, img: true } } },
  });
  const playerData = new Map<string, { score: number; answers: StoredAnswer[]; name?: string; img?: string | null }>();
  playersMeta.forEach((pg) => {
    playerData.set(pg.id, {
      score: 0,
      answers: [],
      name: pg.player.name,
      img: pg.player.img,
    });
  });

  type Row = { id: string };
  const QUESTION_COUNT =
    typeof room.questionCount === "number" && Number.isFinite(room.questionCount)
      ? room.questionCount
      : Number(process.env.QUESTION_COUNT || 10);

  // 1) Quotas par difficulté
  const probs = QUESTION_DISTRIBUTION[Math.max(1, Math.min(10, room.difficulty ?? 5))];
  const [n1, n2, n3, n4] = quotasFromDistribution(probs, QUESTION_COUNT);

  // 1bis) Thèmes bannis
  const banned = (room.bannedThemes ?? []) as Theme[];
  const bannedSqlList = banned.length > 0 ? Prisma.join(banned.map(b => Prisma.sql`${b}::"Theme"`)) : null;
  const andNotBanned = bannedSqlList ? Prisma.sql`AND ("theme" IS NULL OR "theme" NOT IN (${bannedSqlList}))` : Prisma.sql``;

  // 2) Tirages par difficulté
  const byDiff: Record<string, number> = { "1": n1, "2": n2, "3": n3, "4": n4 };
  let qIds: string[] = [];

  for (const [diff, need] of Object.entries(byDiff)) {
    if (need <= 0) continue;
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT "id" FROM "Question"
      WHERE "difficulty" = ${diff}
      ${andNotBanned}
      AND ("id" NOT IN (${Prisma.join(qIds.length ? qIds : [""])}) OR ${qIds.length === 0})
      ORDER BY random()
      LIMIT ${Number(need)};
    `;
    qIds.push(...rows.map(r => r.id));
  }

  // 2b) Compléter si manque
  if (qIds.length < QUESTION_COUNT) {
    const remaining = QUESTION_COUNT - qIds.length;
    const fill = await prisma.$queryRaw<Row[]>`
      SELECT "id" FROM "Question"
      WHERE ("id" NOT IN (${Prisma.join(qIds.length ? qIds : [""])}) OR ${qIds.length === 0})
      ${andNotBanned}
      ORDER BY random()
      LIMIT ${remaining};
    `;
    qIds.push(...fill.map(r => r.id));
  }

  if (qIds.length === 0) {
    io.to(room.id).emit("error_msg", "No questions in database.");
    return;
  }
  if (qIds.length < Math.min(QUESTION_COUNT)) {
    console.warn(`[question-pick] Only ${qIds.length}/${QUESTION_COUNT} questions could be loaded.`);
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
    pgIds: new Set(pgs.map((p) => p.id)),
    attemptsThisRound: new Map<string, number>(),
    roundMs: room.roundMs ?? Number(process.env.ROUND_MS || 10000),
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

  const countdownSeconds = Math.max(0, Number(process.env.GAME_COUNTDOWN_SECONDS || 3));
  if (countdownSeconds > 0) {
    const countdownUid = `${st.gameId}:pregame:${Date.now()}`;
    st.roundUid = countdownUid;
    const endsAt = Date.now() + countdownSeconds * 1000;
    io.to(room.id).emit("game_countdown", {
      seconds: countdownSeconds,
      endsAt,
      serverNow: Date.now(),
    });
    st.timer = setTimeout(() => {
      if (st.roundUid !== countdownUid) return;
      startRound(clients, gameStates, io, prisma, st).catch((err) =>
        console.error("[startRound error]", err)
      );
    }, countdownSeconds * 1000);
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
  const TEXT_LIVES = Number(process.env.TEXT_LIVES || 3);

  st.answeredThisRound.clear();
  st.answeredOrderText = [];
  st.attemptsThisRound = new Map();
  st.mcModePgIds = new Set<string>();
  st.roundStartMs = Date.now();
  st.endsAt = st.roundStartMs + ROUND_MS;

  // ... emit round_begin (on peut aussi envoyer roundUid si tu veux)
  io.to(st.roomId).emit("round_begin", {
    index: st.index,
    total: st.questions.length,
    endsAt: st.endsAt,
    question: { id: q.id, text: q.text, img: q.img, theme: q.theme, difficulty: q.difficulty },
    textLives: TEXT_LIVES,
    serverNow: Date.now()
    // optional: roundUid: myUid
  });

  // Planifier les bots pour CE round uniquement
  try { await scheduleBotAnswers(prisma, io, clients, st, myUid); } catch (e) { console.error(e); }

  // Leaderboard initial
  lb_service.buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds), st)
    .then((lb) => io.to(st.roomId).emit("leaderboard_update", { leaderboard: lb }))
    .catch((err) => console.error("[leaderboard startRound]", err));

  // Timer de fin — exécuté SEULEMENT si l'UID n'a pas changé
  st.timer = setTimeout(() => {
    if (st.roundUid !== myUid) return;    // stale timeout, on ignore
    endRound(clients, gameStates, io, prisma, st, myUid).catch(err => console.error("[endRound error]", err));
  }, ROUND_MS);
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
  const correct = q.choices.find(c => c.isCorrect) || null;

  io.to(st.roomId).emit("round_end", {
    index: st.index,
    correctChoiceId: correct ? correct.id : null,
    correctLabel: correct ? correct.label : null,
    leaderboard,
  });

  st.endsAt = undefined;

  const hasNext = st.index + 1 < st.questions.length;
  if (!hasNext) {
    const finalGapMs = Number(process.env.FINAL_GAP_MS || process.env.GAP_MS || 3001);
    const finalGapUid = `${st.gameId}:${st.index}:finalgap:${Date.now()}`;
    st.roundUid = finalGapUid;

    if (st.timer) { clearTimeout(st.timer); }
    st.timer = setTimeout(() => {
      if (st.roundUid !== finalGapUid) return;
      finalizeGameAfterReveal(clients, gameStates, io, prisma, st, leaderboard)
        .catch(err => console.error("[finalizeGame error]", err));
    }, finalGapMs);

    return;
  }

  const GAP_MS = Number(process.env.GAP_MS || 3001);
  st.index += 1;
  const nextDelayUid = `${st.gameId}:${st.index}:gap:${Date.now()}`;
  st.roundUid = nextDelayUid; // invalide l'ancien round/timeout pendant l'attente
  st.timer = setTimeout(() => {
    // si l’UID a changé (ex: stopGame), on ne lance pas
    if (st.roundUid !== nextDelayUid) return;
    startRound(clients, gameStates, io, prisma, st).catch(err => console.error("[startRound error]", err));
  }, GAP_MS);
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

  const FINAL_LB_MS = Number(process.env.FINAL_LB_MS || 20000);
  io.to(st.roomId).emit("final_leaderboard", { leaderboard, displayMs: FINAL_LB_MS });

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
    select: { id: true, visibility: true, popularity: true },
  });
  if (room && room.visibility === "PUBLIC") {
    const xMax = Number(process.env.BOT_TRAFFIC_MAX || 100); // affluence max globale
    await rebalanceBotsAfterGame({
      prisma, io, clients,
      room: { id: room.id, visibility: room.visibility, traffic: room.popularity ?? 5 },
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
