// /server/src/domain/sockets/handlers.ts
import { Server } from "socket.io";
import type { Client, GameState, StoredAnswer } from "../types";
import { prisma } from "../infra/prisma";
import { CFG } from "../config";

// Domain services
import { getOrCreateCurrentGame, clientsInRoom } from "../domain/room/room.service";
import { emitPublicRoomsUpdated } from "../domain/room/public-room-events";
import { toProfileUrl } from "../domain/media/media.service";
import { computeSpeedBonus, computeTextAnswerPoints } from "../domain/player/scoring.service";
import { classifyTextAnswer, norm } from "../domain/question/textmatch";
import { getShuffledChoicesForSocket } from "../domain/question/shuffle";
import { buildLeaderboard } from "../domain/game/leaderboard.service";
import { launchNextManualRound, startGameForRoom } from "../domain/game/game.service";
import { getChallengeByDate } from "../domain/daily/daily.service";
import { getDailyChallengeRankingSnapshot, getMonthlyDailyRankingSnapshot, getDailyQuestionResponseStats, recordDailyQuestionResults, recordDailyScoreIfFirst, updateDailyQuestionAverageScores } from "../domain/daily/daily-score.service";
import { ensurePlayerForUser } from "../domain/player/player.service";
import { markPlayerActive } from "../domain/game/player-activity.service";

/**
 * Enregistre tous les handlers Socket.IO.
 * - io.use(...) (auth) est fait dans app.ts pour garder ce fichier centré sur les events.
 */
export function registerSocketHandlers( io: Server, clients: Map<string, Client>, gameStates: Map<string, GameState> ) {
  const pendingRoomCleanup = new Map<string, NodeJS.Timeout>();
  const lobbyBans = new Map<string, number>();
  const LOBBY_BAN_DURATION_MS = 5 * 60 * 1000;

  const handleRoomClientDeparture = async (socketId: string) => {
    const c = clients.get(socketId);
    if (!c) return;

    const { roomId, gameId } = c;
    clients.delete(socketId);
    io.sockets.sockets.get(socketId)?.leave(roomId);
    io.to(roomId).emit("lobby_update");
    emitPublicRoomsUpdated(io);

    const left = clientsInRoom(clients, roomId).length;
    if (left === 0) {
      const existing = pendingRoomCleanup.get(roomId);
      if (existing) clearTimeout(existing);
      const cleanup = setTimeout(async () => {
        pendingRoomCleanup.delete(roomId);
        if (clientsInRoom(clients, roomId).length > 0) return;

        try {
          await prisma.game.update({ where: { id: gameId }, data: { state: "lobby" } });
        } catch (e) {
          console.warn("[disconnect] can't set game state:", e);
        }

        const st = gameStates.get(roomId);
        if (st?.timer) clearTimeout(st.timer);
        gameStates.delete(roomId);

        io.to(roomId).emit("info_msg", "Tous les joueurs ont quitté. La partie est arrêtée.");
        emitPublicRoomsUpdated(io);
      }, 3000);
      pendingRoomCleanup.set(roomId, cleanup);
    }
  };

  const ensurePlayerData = (st: GameState, pgId: string, name?: string, img?: string | null) => {
    if (!st.playerData) st.playerData = new Map();
    let entry = st.playerData.get(pgId);
    if (!entry) {
      entry = { score: 0, answers: [], name, img };
      st.playerData.set(pgId, entry);
    }
    if (name && !entry.name) entry.name = name;
    if (img !== undefined && entry.img === undefined) entry.img = img;
    return entry;
  };

  const recordAnswer = (
    st: GameState,
    pgId: string,
    answer: Omit<StoredAnswer, "points">,
    gained: number,
    name?: string,
    img?: string | null,
  ) => {
    const entry = ensurePlayerData(st, pgId, name, img);
    st.attemptedThisRound.add(pgId);
    entry.answers.push({ ...answer, points: gained });
    if (gained > 0) {
      entry.score += gained;
    }
  };

  // Daily challenge sessions are scoped to a single socket (solo mode)
  type DailySession = {
    date: string;
    challengeId: string;
    playerId: string;
    questions: {
      entryId: string;
      id: string;
      text: string;
      theme: string | null;
      difficulty: string | null;
      img: string | null;
      slotLabel: string | null;
      averageScore: number;
      correctRate: number;
      choices: { id: string; label: string; isCorrect: boolean }[];
      acceptedNorms: string[];
      exactNorms: string[];
      correctLabel: string;
    }[];
    index: number;
    score: number;
    attempts: number;
    answered: boolean;
    mcMode: boolean;
    mcUses: number;
    endsAt: number | null;
    roundStartMs: number | null;
    timer: NodeJS.Timeout | null;
    results: {
      entryId: string;
      questionId: string;
      questionText: string;
      slotLabel: string | null;
      theme: string | null;
      difficulty: string | null;
      img: string | null;
      correct: boolean;
      attempts: number;
      answer: string | null;
      mode: "text" | "choice" | "timeout" | "skip";
      responseMs: number;
      correctLabel: string;
      points: number;
      averageScore: number;
      correctRate: number;
      stats?: { correct: number; correctQcm: number; wrong: number };
    }[];
  };

  const dailySessions = new Map<string, DailySession>();
  const DAILY_ROUND_MS = Number(process.env.DAILY_ROUND_MS || 20000);
  const DAILY_MAX_MC_USES = 3;

  function parseDailyMonth(dateIso: string): { year: number; monthIndex: number } | null {
    const [year, month] = dateIso.split("-").map((value) => Number(value));
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
    return { year, monthIndex: month - 1 };
  }

  const stopDailyTimer = (socketId: string) => {
    const sess = dailySessions.get(socketId);
    if (sess?.timer) {
      clearTimeout(sess.timer);
      sess.timer = null;
    }
  };

  const queueNextRound = (socket: any) => {
    setTimeout(() => {
      void scheduleNext(socket);
    }, 1600);
  };

  const appendUnansweredDailyResults = (sess: DailySession) => {
    const firstUnansweredIndex = sess.results.length;
    const currentResponseMs = Math.max(0, Date.now() - (sess.roundStartMs || Date.now()));

    sess.questions.slice(firstUnansweredIndex).forEach((q, offset) => {
      sess.results.push({
        entryId: q.entryId,
        questionId: q.id,
        questionText: q.text,
        slotLabel: q.slotLabel,
        theme: q.theme,
        difficulty: q.difficulty,
        img: q.img,
        correct: false,
        attempts: 0,
        answer: null,
        mode: "skip",
        responseMs: offset === 0 ? currentResponseMs : 0,
        correctLabel: q.correctLabel,
        points: 0,
        averageScore: q.averageScore,
        correctRate: q.correctRate,
      });
    });
  };

  const scheduleNext = async (socket: any) => {
    const sess = dailySessions.get(socket.id);
    if (!sess) return;
    const nextIndex = sess.index + 1;
    const nextQuestion = sess.questions[nextIndex];
    if (!nextQuestion) {
      dailySessions.delete(socket.id);
      let monthlyRanking: Awaited<ReturnType<typeof getMonthlyDailyRankingSnapshot>> | null = null;
      let dailyRanking: Awaited<ReturnType<typeof getDailyChallengeRankingSnapshot>> | null = null;
      try {
        const record = await recordDailyScoreIfFirst(prisma, sess.challengeId, sess.playerId, sess.score);
        if (record.created && record.scoreId) {
          await recordDailyQuestionResults(prisma, record.scoreId, sess.playerId, sess.results);
          const averages = await updateDailyQuestionAverageScores(prisma, sess.challengeId, sess.results);
          const responseStats = await getDailyQuestionResponseStats(prisma, sess.challengeId);
          sess.results = sess.results.map((result) => ({
            ...result,
            averageScore: averages.averageScores.get(result.entryId) ?? result.averageScore,
            correctRate: averages.correctRates.get(result.entryId) ?? result.correctRate,
            stats: responseStats.get(result.entryId) ?? { correct: result.correct && result.mode !== "choice" ? 1 : 0, correctQcm: result.correct && result.mode === "choice" ? 1 : 0, wrong: result.correct ? 0 : 1 },
          }));
        }
        const monthParts = parseDailyMonth(sess.date);
        const rankings = await Promise.all([
          monthParts
            ? getMonthlyDailyRankingSnapshot(
                prisma,
                sess.playerId,
                monthParts.year,
                monthParts.monthIndex,
              )
            : Promise.resolve(null),
          getDailyChallengeRankingSnapshot(prisma, sess.challengeId, sess.playerId),
        ]);
        monthlyRanking = rankings[0];
        dailyRanking = rankings[1];
      } catch (err) {
        console.error("[daily_score_record]", err);
      }
      socket.emit("daily_finished", { score: sess.score, results: sess.results, monthlyRanking, dailyRanking });
      return;
    }
    sess.index = nextIndex;
    sess.attempts = 0;
    sess.answered = false;
    sess.mcMode = false;
    sess.roundStartMs = Date.now();
    sess.endsAt = sess.roundStartMs + DAILY_ROUND_MS;
    sess.timer = setTimeout(() => {
      // MOVED TO SERVER: timeout/validation
      stopDailyTimer(socket.id);
      const responseMs = Math.max(0, Date.now() - (sess.roundStartMs || Date.now()));
      const q = sess.questions[sess.index];
      sess.results.push({
        entryId: q.entryId,
        questionId: q.id,
        questionText: q.text,
        slotLabel: q.slotLabel,
        theme: q.theme,
        difficulty: q.difficulty,
        img: q.img,
        correct: false,
        attempts: 0,
        answer: null,
        mode: "timeout",
        responseMs,
        correctLabel: q.correctLabel,
        points: 0,
        averageScore: q.averageScore,
        correctRate: q.correctRate,
      });
      socket.emit("daily_round_end", {
        index: sess.index,
        correctChoiceId: q.choices.find((c) => c.isCorrect)?.id ?? null,
        correctLabel: q.correctLabel,
        score: sess.score,
      });
      queueNextRound(socket);
    }, DAILY_ROUND_MS + 10);

    socket.emit("daily_round_begin", {
      index: sess.index,
      total: sess.questions.length,
      endsAt: sess.endsAt,
      serverNow: Date.now(),
      question: {
        entryId: nextQuestion.entryId,
        id: nextQuestion.id,
        text: nextQuestion.text,
        theme: nextQuestion.theme,
        difficulty: nextQuestion.difficulty,
        img: nextQuestion.img,
        slotLabel: nextQuestion.slotLabel,
        averageScore: nextQuestion.averageScore,
      },
      score: sess.score,
    });
  };

  const startDaily = (socket: any, sess: DailySession) => {
    sess.index = -1;
    void scheduleNext(socket);
  };

  io.on("connection", (socket) => {
    socket.emit("welcome", { id: socket.id });
  
    /* ---------------- DAILY CHALLENGE (solo) ---------------- */
    socket.on("join_daily", async (p: { date: string }, ack?: (res: { ok: boolean; reason?: string }) => void) => {
      const date = (p?.date || "").trim();
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
      if (!valid) return ack?.({ ok: false, reason: "invalid-date" });
      try {
        const userId = socket.data.userId as string | undefined;
        if (!userId) return ack?.({ ok: false, reason: "unauthorized" });

        const player = await ensurePlayerForUser(prisma, userId);
        const challenge = await getChallengeByDate(prisma, date);
        if (!challenge) return ack?.({ ok: false, reason: "not-found" });
        stopDailyTimer(socket.id);

        dailySessions.set(socket.id, {
          date,
          challengeId: challenge.id,
          playerId: player.id,
          questions: challenge.questions,
          index: -1,
          score: 0,
          attempts: 0,
          answered: false,
          mcMode: false,
          mcUses: 0,
          endsAt: null,
          roundStartMs: null,
          timer: null,
          results: [],
        });

        startDaily(socket, dailySessions.get(socket.id)!);
        ack?.({ ok: true });
      } catch (err) {
        console.error("[join_daily]", err);
        ack?.({ ok: false, reason: "server-error" });
      }
    });

    socket.on("daily_request_choices", (ack?: (res: { ok: boolean; reason?: string; mcUses?: number; mcUsesLeft?: number }) => void) => {
      const sess = dailySessions.get(socket.id);
      if (!sess || sess.answered) return ack?.({ ok: false, reason: "no-session" });
      const q = sess.questions[sess.index];
      if (!q) return ack?.({ ok: false, reason: "no-question" });
      if (sess.mcUses >= DAILY_MAX_MC_USES) {
        return ack?.({ ok: false, reason: "mc-limit", mcUses: sess.mcUses, mcUsesLeft: 0 });
      }
      sess.mcMode = true;
      sess.mcUses += 1;
      const choices = [...q.choices].map(({ id, label }) => ({ id, label })).sort(() => Math.random() - 0.5);
      socket.emit("daily_multiple_choice", { choices });
      ack?.({ ok: true, mcUses: sess.mcUses, mcUsesLeft: Math.max(0, DAILY_MAX_MC_USES - sess.mcUses) });
    });

    socket.on("daily_abandon", async (ack?: (res: { ok: boolean; reason?: string }) => void) => {
      const sess = dailySessions.get(socket.id);
      if (!sess) return ack?.({ ok: false, reason: "no-session" });

      stopDailyTimer(socket.id);
      appendUnansweredDailyResults(sess);
      sess.index = sess.questions.length - 1;
      sess.answered = true;
      await scheduleNext(socket);
      ack?.({ ok: true });
    });

    socket.on("disconnect", () => {
      const sess = dailySessions.get(socket.id);
      if (!sess) return;

      stopDailyTimer(socket.id);
      appendUnansweredDailyResults(sess);
      sess.index = sess.questions.length - 1;
      sess.answered = true;
      void scheduleNext(socket);
    });

    socket.on("daily_skip_question", (ack?: (res: { ok: boolean; reason?: string }) => void) => {
      const sess = dailySessions.get(socket.id);
      if (!sess) return ack?.({ ok: false, reason: "no-session" });
      if (sess.answered) return ack?.({ ok: false, reason: "already" });
      if (!sess.endsAt || Date.now() > sess.endsAt) return ack?.({ ok: false, reason: "too-late" });

      const q = sess.questions[sess.index];
      if (!q) return ack?.({ ok: false, reason: "no-question" });

      const responseMs = Math.max(0, Date.now() - (sess.roundStartMs || Date.now()));
      sess.answered = true;
      stopDailyTimer(socket.id);

      const correctChoice = q.choices.find((c) => c.isCorrect) ?? null;

      sess.results.push({
        entryId: q.entryId,
        questionId: q.id,
        questionText: q.text,
        slotLabel: q.slotLabel,
        theme: q.theme,
        difficulty: q.difficulty,
        img: q.img,
        correct: false,
        attempts: 0,
        answer: null,
        mode: "skip",
        responseMs,
        correctLabel: q.correctLabel,
        points: 0,
        averageScore: q.averageScore,
        correctRate: q.correctRate,
      });

      socket.emit("daily_answer_feedback", {
        correct: false,
        correctChoiceId: correctChoice ? correctChoice.id : null,
        correctLabel: q.correctLabel,
        responseMs,
        score: sess.score,
        points: 0,
        livesLeft: 0,
        skipped: true,
      });

      socket.emit("daily_round_end", {
        index: sess.index,
        correctChoiceId: correctChoice ? correctChoice.id : null,
        correctLabel: q.correctLabel,
        score: sess.score,
      });

      queueNextRound(socket);
      ack?.({ ok: true });
    });

socket.on(
  "daily_submit_answer",
  (p: { choiceId: string }, ack?: (res: { ok: boolean; reason?: string }) => void) => {
    const sess = dailySessions.get(socket.id);
    if (!sess) return ack?.({ ok: false, reason: "no-session" });
    if (sess.answered) return ack?.({ ok: false, reason: "already" });
    if (!sess.endsAt || Date.now() > sess.endsAt) return ack?.({ ok: false, reason: "too-late" });

    const q = sess.questions[sess.index];
    if (!q) return ack?.({ ok: false, reason: "no-question" });

    const choice = q.choices.find((c) => c.id === p.choiceId);
    if (!choice) return ack?.({ ok: false, reason: "bad-choice" });

    const responseMs = Math.max(0, Date.now() - (sess.roundStartMs || Date.now()));
    sess.answered = true;
    stopDailyTimer(socket.id);

    const isCorrect = !!choice.isCorrect;

    let gained = 0;
    if (isCorrect) {
      const remainingMs = Math.max(0, (sess.endsAt ?? Date.now()) - Date.now());
      const secsLeft = Math.floor(remainingMs / 1000);
      const bonus = Math.floor(secsLeft / 2) * 5;
      gained = CFG.MC_ANSWER_POINTS_GAIN + bonus;
    }
    sess.score += gained;

    sess.results.push({
      entryId: q.entryId,
      questionId: q.id,
      questionText: q.text,
      slotLabel: q.slotLabel,
      theme: q.theme,
      difficulty: q.difficulty,
      img: q.img,
      correct: isCorrect,
      attempts: 1,
      answer: choice.label,
      mode: "choice",
      responseMs,
      correctLabel: q.correctLabel,
      points: gained,
      averageScore: q.averageScore,
      correctRate: q.correctRate,
    });

    const correctChoice = q.choices.find((c) => c.isCorrect) ?? null;

    // Payload de base
    const feedbackPayload: {
      correct: boolean;
      correctChoiceId: string | null;
      correctLabel: string | null;
      responseMs: number;
      score: number;
      points: number;
      livesLeft?: number;
    } = {
      correct: isCorrect,
      correctChoiceId: correctChoice ? correctChoice.id : null,
      correctLabel: q.correctLabel,
      responseMs,
      score: sess.score,
      points: isCorrect ? CFG.MC_ANSWER_POINTS_GAIN : 0,
    };

    // 👉 Règle demandée :
    // - si la réponse QCM est FAUSSE : tous les cœurs restants disparaissent => livesLeft = 0
    // - si la réponse est BONNE : on ne touche PAS aux cœurs => pas de livesLeft dans le payload
    if (!isCorrect) {
      feedbackPayload.livesLeft = 0;
    }

    socket.emit("daily_answer_feedback", feedbackPayload);

    socket.emit("daily_round_end", {
      index: sess.index,
      correctChoiceId: correctChoice ? correctChoice.id : null,
      correctLabel: q.correctLabel,
      score: sess.score,
    });

    queueNextRound(socket);
    ack?.({ ok: true });
  },
);

socket.on(
  "daily_submit_answer_text",
  (p: { text: string }, ack?: (res: { ok: boolean; reason?: string }) => void) => {
    const sess = dailySessions.get(socket.id);
    if (!sess) return ack?.({ ok: false, reason: "no-session" });
    if (sess.answered) return ack?.({ ok: false, reason: "already" });
    if (!sess.endsAt || Date.now() > sess.endsAt) return ack?.({ ok: false, reason: "too-late" });

    const q = sess.questions[sess.index];
    if (!q) return ack?.({ ok: false, reason: "no-question" });

    if (sess.mcMode) return ack?.({ ok: false, reason: "mc-mode" });

    const raw = (p?.text || "").trim();
    const userNorm = norm(raw);
    if (!userNorm) return ack?.({ ok: false, reason: "empty" });

    const result = classifyTextAnswer(raw, q.acceptedNorms, q.exactNorms);
    const correct = result === "correct";
    const responseMs = Math.max(0, Date.now() - (sess.roundStartMs || Date.now()));

    // --- Gestion des tentatives / vies ---
    // On ne consomme un "cœur" QUE si la réponse est fausse.
    if (!correct) {
      sess.attempts += 1;
    }
    const remainingLives = Math.max(0, CFG.TEXT_LIVES - sess.attempts);

    // Fin du round : soit bonne réponse, soit plus de vies (3 mauvaises réponses)
    if (correct || sess.attempts >= CFG.TEXT_LIVES) {
      sess.answered = true;
      stopDailyTimer(socket.id);

      let gained = 0;
      if (correct) {
        const remainingMs = Math.max(0, (sess.endsAt ?? Date.now()) - Date.now());
        const secsLeft = Math.floor(remainingMs / 1000);
        const bonus = Math.floor(secsLeft / 2) * 5;
        gained = CFG.TXT_ANSWER_POINTS_GAIN + bonus; // MOVED TO SERVER
        sess.score += gained;
      }

      sess.results.push({
        entryId: q.entryId,
        questionId: q.id,
        questionText: q.text,
        slotLabel: q.slotLabel,
        theme: q.theme,
        difficulty: q.difficulty,
        img: q.img,
        correct,
        attempts: correct ? sess.attempts + 1 : sess.attempts,
        answer: raw,
        mode: "text",
        responseMs,
        correctLabel: q.correctLabel,
        points: gained,
        averageScore: q.averageScore,
        correctRate: q.correctRate,
      });

      const baseFeedback = {
        correct,
        result,
        correctChoiceId: q.choices.find((c) => c.isCorrect)?.id ?? null,
        correctLabel: q.correctLabel,
        responseMs,
        score: sess.score,
        points: gained,
      };

      // 👉 Si la réponse est fausse ET qu'on vient d'épuiser les vies, on envoie livesLeft (0)
      // 👉 Si la réponse est correcte, on NE touche pas aux cœurs : pas de livesLeft dans le payload
      socket.emit(
        "daily_answer_feedback",
        correct ? baseFeedback : { ...baseFeedback, livesLeft: remainingLives },
      );

      socket.emit("daily_round_end", {
        index: sess.index,
        correctChoiceId: q.choices.find((c) => c.isCorrect)?.id ?? null,
        correctLabel: q.correctLabel,
        score: sess.score,
      });

      queueNextRound(socket);
    } else {
      // Mauvaise réponse mais il reste encore des vies
      socket.emit("daily_answer_feedback", {
        correct: false,
        result,
        livesLeft: remainingLives,
        points: 0,
      });
    }

    ack?.({ ok: true });
  },
);

    /* ---------------- join_game ---------------- */
    socket.on("join_game", async (p: { code?: string; roomId?: string }) => {
      try {
        const userId = socket.data.userId as string | undefined;
        if (!userId) return socket.emit("error_msg", "Not authenticated");

        let room = null;

        if (p?.code) {
            room = await prisma.room.findUnique({ where: { code: p.code } });
            if (!room) return socket.emit("error_msg", "Room not found.");
        }      
        else if (p?.roomId) {
            room = await prisma.room.findUnique({ where: { id: p.roomId } });
            if (!room) return socket.emit("error_msg", "Room not found.");
            if (room.visibility !== "PUBLIC") { return socket.emit("error_msg", "This room requires a code."); }
        }
        else { return socket.emit("error_msg", "Missing roomId or code."); }

        const banKey = `${room.id}:${userId}`;
        const bannedUntil = lobbyBans.get(banKey) ?? 0;
        if (bannedUntil > Date.now()) {
          socket.emit("removed_from_room", { roomId: room.id, bannedUntil, reason: "temporarily-banned" });
          return socket.emit("error_msg", "Vous ne pouvez pas rejoindre ce salon pendant 5 minutes.");
        }
        if (bannedUntil) lobbyBans.delete(banKey);

        const roomState = gameStates.get(room.id);
        const game = roomState?.finished
          ? (await prisma.game.findFirst({
              where: { roomId: room.id, state: "lobby" },
              orderBy: { createdAt: "desc" },
            })) ?? await getOrCreateCurrentGame(prisma, room.id)
          : roomState
            ? await prisma.game.findUniqueOrThrow({ where: { id: roomState.gameId } })
            : await getOrCreateCurrentGame(prisma, room.id);

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, displayName: true },
        });
        if (!user) return socket.emit("error_msg", "User not found.");

        const player = await prisma.player.upsert({
          where: { userId: user.id },
          update: { name: user.displayName.trim() },
          create: { userId: user.id, name: user.displayName.trim() },
        });

        const pg = await prisma.playerGame.upsert({
          where: { gameId_playerId: { gameId: game.id, playerId: player.id } },
          update: {},
          create: { gameId: game.id, playerId: player.id, score: 0 },
        });

        // Mémorise le client
        clients.set(socket.id, {
          socketId: socket.id,
          playerId: player.id,
          playerGameId: pg.id,
          gameId: game.id,
          roomId: room.id,
          name: player.name,
        });

        socket.data.roomId = room.id;
        socket.data.gameId = game.id;

        socket.join(room.id);
        const pending = pendingRoomCleanup.get(room.id);
        if (pending) {
          clearTimeout(pending);
          pendingRoomCleanup.delete(room.id);
        }
        io.to(room.id).emit("lobby_update");
        emitPublicRoomsUpdated(io);
        const st = roomState;
        const qcmUsesLeft = Math.max(
          0,
          (st?.qcmUses ?? CFG.ROOM_QCM_USES) - (st?.qcmUsesByPgId.get(pg.id) ?? 0),
        );
        socket.emit("joined", {
          playerGameId: pg.id,
          playerId: player.id,
          name: player.name,
          roomId: room.id,
          isOwner: room.ownerId === user.id,
          qcmUsesLeft,
          answerAttempts: st?.answerAttempts ?? CFG.TEXT_LIVES,
        });

        if (st && st.gameId === game.id) {
            st.pgIds.add(pg.id);
            ensurePlayerData(st, pg.id, player.name);
            const gameRoom = `game:${st.gameId}`;
            io.sockets.sockets.get(socket.id)?.join(gameRoom);
            st.attemptsThisRound.set(pg.id, 0);
            st.answeredThisRound.delete(pg.id);
            if (Array.isArray((st as any).answeredOrderText)) { st.answeredOrderText = (st as any).answeredOrderText.filter((id: string) => id !== pg.id); }
            if (Array.isArray((st as any).answeredOrder)) { st.answeredOrder = (st as any).answeredOrder.filter((id: string) => id !== pg.id); }

            const now = Date.now();
            if (st.countdownEndsAt && st.countdownEndsAt > now) {
              socket.emit("game_countdown", {
                seconds: Math.max(1, Math.ceil((st.countdownEndsAt - now) / 1000)),
                endsAt: st.countdownEndsAt,
                serverNow: now,
                qcmUsesLeft,
              });
            } else if (st.endsAt && st.endsAt > now) {
              const q = st.questions[st.index];
              if (q) {
                socket.emit("round_begin", {
                  index: st.index,
                  total: st.questions.length,
                  startedAt: st.roundStartMs,
                  endsAt: st.endsAt,
                  durationMs: st.roundMs,
                  question: { id: q.id, text: q.text, img: q.img, theme: q.theme, difficulty: q.difficulty },
                  dynamicQuestionDisplay: st.dynamicQuestionDisplay,
                  manualQuestionLaunch: st.manualQuestionLaunch,
                  speedBonusEnabled: st.speedBonusEnabled,
                  serverNow: now,
                });
              }
            } else if (st.manualQuestionLaunch && st.waitingForManualLaunch) {
              socket.emit("manual_round_ready", { index: st.index, total: st.questions.length });
            }
            void buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds), st)
              .then((leaderboard) => io.to(st.roomId).emit("leaderboard_update", { leaderboard }))
              .catch((err) => console.error("[leaderboard join_game]", err));
        }

        const shouldAutoStart = room.visibility === "PUBLIC";

        // `Game.state` may still be "running" after a server restart even though
        // the in-memory state (the only state that can drive rounds/timers) is
        // gone. Public rooms must start whenever no live GameState exists.
        // A finished state still owns the final-leaderboard timer: joining it
        // must never shorten that wait or start the following game early.
        if (!st && shouldAutoStart) {
          try {
            await startGameForRoom(clients, gameStates, io, prisma, room.id);
          } catch (e: any) {
            console.error("[auto start_game on join] error:", e?.message, "\n", e?.stack);
            socket.emit("error_msg", "Unable to auto start the game.");

          }
        }
      } catch (err) {
        console.error("[join_game] error", err);
        socket.emit("error_msg", "Server error.");
      }
    });

    /* ---------------- remove_lobby_player ---------------- */
    socket.on("remove_lobby_player", async (p: { playerId?: string }, ack?: (res: { ok: boolean; reason?: string }) => void) => {
      const roomId = socket.data.roomId as string | undefined;
      const userId = socket.data.userId as string | undefined;
      const playerId = p?.playerId;
      if (!roomId || !userId) return ack?.({ ok: false, reason: "not-in-room" });
      if (!playerId) return ack?.({ ok: false, reason: "missing-player" });

      try {
        const room = await prisma.room.findUnique({ where: { id: roomId }, select: { ownerId: true } });
        if (!room) return ack?.({ ok: false, reason: "room-not-found" });
        if (room.ownerId !== userId) return ack?.({ ok: false, reason: "forbidden" });

        const targets = clientsInRoom(clients, roomId).filter((client) => client.playerId === playerId);
        if (!targets.length) return ack?.({ ok: false, reason: "player-not-found" });

        const bannedUntil = Date.now() + LOBBY_BAN_DURATION_MS;
        for (const target of targets) {
          const targetSocket = io.sockets.sockets.get(target.socketId);
          const targetUserId = targetSocket?.data.userId as string | undefined;
          if (!targetSocket || !targetUserId || targetUserId === room.ownerId) continue;
          lobbyBans.set(`${roomId}:${targetUserId}`, bannedUntil);
          targetSocket.emit("removed_from_room", { roomId, bannedUntil, reason: "removed-by-owner" });
          await handleRoomClientDeparture(target.socketId);
          delete targetSocket.data.roomId;
          delete targetSocket.data.gameId;
        }

        io.to(roomId).emit("lobby_update");
        return ack?.({ ok: true });
      } catch (error) {
        console.error("[remove_lobby_player] error", error);
        return ack?.({ ok: false, reason: "server-error" });
      }
    });

    /* ---------------- leave_game ---------------- */
    socket.on("leave_game", async (_p: unknown, ack?: (res: { ok: boolean }) => void) => {
      await handleRoomClientDeparture(socket.id);
      ack?.({ ok: true });
    });

    /* ---------------- return_to_lobby ---------------- */
    socket.on("return_to_lobby", async (_p: unknown, ack?: (res: { ok: boolean; reason?: string }) => void) => {
      const roomId = socket.data.roomId as string | undefined;
      const gameId = socket.data.gameId as string | undefined;
      const userId = socket.data.userId as string | undefined;
      if (!roomId) return ack?.({ ok: false, reason: "not-in-room" });
      if (!userId) return ack?.({ ok: false, reason: "not-authenticated" });

      try {
        const room = await prisma.room.findUnique({ where: { id: roomId }, select: { ownerId: true } });
        if (!room) return ack?.({ ok: false, reason: "room-not-found" });
        if (room.ownerId !== userId) return ack?.({ ok: false, reason: "forbidden" });

        const st = gameStates.get(roomId);
        if (st?.timer) clearTimeout(st.timer);
        gameStates.delete(roomId);

        if (gameId) {
          await prisma.game.update({ where: { id: gameId }, data: { state: "lobby" } }).catch((error) => {
            console.warn("[return_to_lobby] can't set game state:", error);
          });
        }

        io.to(roomId).emit("return_to_lobby", { roomId });
        emitPublicRoomsUpdated(io);
        return ack?.({ ok: true });
      } catch (error) {
        console.error("[return_to_lobby] error", error);
        return ack?.({ ok: false, reason: "server-error" });
      }
    });

    /* ---------------- lobby_state ---------------- */
    socket.on("lobby_state", async (_p: unknown, ack?: (res: {
      ok: boolean;
      reason?: string;
      room?: { id: string; name?: string | null };
      owner?: { userId?: string | null; playerId?: string | null; name?: string | null; img?: string | null };
      players?: { id: string; name: string; img?: string | null; experience?: number }[];
    }) => void) => {
      const roomId = socket.data.roomId as string | undefined;
      if (!roomId) return ack?.({ ok: false, reason: "not-in-room" });

      try {
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          select: {
            id: true,
            name: true,
            ownerId: true,
            owner: {
              select: {
                id: true,
                displayName: true,
                player: { select: { id: true, name: true, img: true } },
              },
            },
          },
        });
        if (!room) return ack?.({ ok: false, reason: "room-not-found" });

        const members = clientsInRoom(clients, roomId);
        const playerIds = Array.from(new Set(members.map((m) => m.playerId).filter(Boolean)));
        const playersMeta = playerIds.length
          ? await prisma.player.findMany({
              where: { id: { in: playerIds } },
              select: { id: true, name: true, img: true, experience: true },
            })
          : [];
        const playersById = new Map(playersMeta.map((p) => [p.id, p]));

        const players = playerIds.map((playerId) => {
          const meta = playersById.get(playerId);
          const fallbackName =
            members.find((member) => member.playerId === playerId)?.name ?? "Joueur";
          return {
            id: playerId,
            name: meta?.name ?? fallbackName,
            img: toProfileUrl(meta?.img ?? null),
            experience: meta?.experience ?? 0,
          };
        });

        const ownerPlayer = room.owner?.player;

        return ack?.({
          ok: true,
          room: { id: room.id, name: room.name ?? null },
          owner: {
            userId: room.owner?.id ?? null,
            playerId: ownerPlayer?.id ?? null,
            name: room.owner?.displayName ?? ownerPlayer?.name ?? null,
            img: toProfileUrl(ownerPlayer?.img ?? null),
          },
          players,
        });
      } catch (error) {
        console.error("[lobby_state] error", error);
        return ack?.({ ok: false, reason: "server-error" });
      }
    });

    /* ---------------- start_game ---------------- */
    socket.on("start_game", async () => {
      const roomId = socket.data.roomId as string | undefined;
      const userId = socket.data.userId as string | undefined;
      if (!roomId) return socket.emit("error_msg", "Not in a room");
      if (!userId) return socket.emit("error_msg", "Not authenticated");

      try {
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          select: { ownerId: true },
        });
        if (!room) return socket.emit("error_msg", "Room not found");
        if (room.ownerId !== userId) return socket.emit("error_msg", "Only the room owner can start the game");
        const st = gameStates.get(roomId);
        if (st && !st.finished) {
          socket.emit("info_msg", "Game already running");
          return;
        }
        await startGameForRoom(clients, gameStates, io, prisma, roomId);
        io.to(roomId).emit("game_started", { roomId });
        emitPublicRoomsUpdated(io);
        socket.emit("info_msg", "Game started");
      } catch (e) {
        console.error("[start_game error]", e);
        socket.emit("error_msg", "Server error");
      }
    });

    /* ---------------- launch_next_question (manual mode) ---------------- */
    socket.on("launch_next_question", async (_p: unknown, ack?: (res: { ok: boolean; reason?: string }) => void) => {
      const roomId = socket.data.roomId as string | undefined;
      const userId = socket.data.userId as string | undefined;
      if (!roomId) return ack?.({ ok: false, reason: "not-in-room" });
      if (!userId) return ack?.({ ok: false, reason: "not-authenticated" });

      try {
        const room = await prisma.room.findUnique({ where: { id: roomId }, select: { ownerId: true } });
        if (!room) return ack?.({ ok: false, reason: "room-not-found" });
        if (room.ownerId !== userId) return ack?.({ ok: false, reason: "forbidden" });

        const result = await launchNextManualRound(clients, gameStates, io, prisma, roomId);
        return ack?.(result.ok ? { ok: true } : { ok: false, reason: result.reason });
      } catch (error) {
        console.error("[launch_next_question] error", error);
        return ack?.({ ok: false, reason: "server-error" });
      }
    });

    /* ---------------- submit_answer (MC) ---------------- */
    socket.on(
      "submit_answer",
      async (
        p: { code: string; choiceId: string },
        ack?: (res: { ok: boolean; reason?: string }) => void
      ) => {
        const client = clients.get(socket.id);
        if (!client) return ack?.({ ok: false, reason: "no-client" });

        const st = gameStates.get(client.roomId);
        if (!st) return ack?.({ ok: false, reason: "no-state" });
        if (!st.endsAt || Date.now() > st.endsAt) {
          return ack?.({ ok: false, reason: "too-late" });
        }
        if (st.answeredThisRound.has(client.playerGameId)) {
          return ack?.({ ok: false, reason: "already-answered" });
        }
        if (!st.mcModePgIds.has(client.playerGameId)) {
          return ack?.({ ok: false, reason: "mc-mode-not-enabled" });
        }

        const q = st.questions[st.index];
        if (!q) return ack?.({ ok: false, reason: "no-question" });

        const choice = q.choices.find((c) => c.id === p.choiceId);
        if (!choice) return ack?.({ ok: false, reason: "bad-choice" });

        const start = st.roundStartMs ?? Date.now();
        const responseMs = Math.max(0, Date.now() - start);

        st.answeredThisRound.add(client.playerGameId);
        st.attemptedThisRound.add(client.playerGameId);
        if (markPlayerActive(st.roomId, client.playerId)) {
          io.to(st.roomId).emit("player_active", { pgId: client.playerGameId });
        }
        st.answeredOrder.push(client.playerGameId);

        const gained = choice.isCorrect ? CFG.MC_ANSWER_POINTS_GAIN : 0;
        recordAnswer(
          st,
          client.playerGameId,
          {
            questionId: q.id,
            text: choice.label,
            correct: !!choice.isCorrect,
            mode: "mc",
            responseMs,
          },
          gained,
        );

        const lb = await buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds), st);
        io.to(client.roomId).emit("leaderboard_update", { leaderboard: lb });

        ack?.({ ok: true });

        const correctChoice = q.choices.find((c) => c.isCorrect) || null;
        socket.emit("answer_feedback", {
          correct: !!choice.isCorrect,
          correctChoiceId: correctChoice ? correctChoice.id : null,
          correctLabel: correctChoice ? correctChoice.label : null,
          responseMs,
          points: gained,
        });

        //io.to(client.roomId).emit("answer_received");
        io.to(st.roomId).emit("player_answered", {
          pgId: client.playerGameId,
          correct: !!choice.isCorrect,
          mode: "mc",
        });
      }
    );

    /* ---------------- submit_answer_text ---------------- */
    socket.on(
      "submit_answer_text",
      async (
        p: { text: string },
        ack?: (res: { ok: boolean; reason?: string }) => void
      ) => {
        const client = clients.get(socket.id);
        if (!client) return ack?.({ ok: false, reason: "no-client" });

        const st = gameStates.get(client.roomId);
        if (!st) return ack?.({ ok: false, reason: "no-state" });
        if (!st.endsAt || Date.now() > st.endsAt) {
          return ack?.({ ok: false, reason: "too-late" });
        }
        if (st.answeredThisRound.has(client.playerGameId)) {
          return ack?.({ ok: false, reason: "already-answered" });
        }

        const q = st.questions[st.index];
        if (!q) return ack?.({ ok: false, reason: "no-question" });

        if (st.mcModePgIds?.has(client.playerGameId)) {
          return ack?.({ ok: false, reason: "mc-mode" });
        }

        const start = st.roundStartMs ?? Date.now();
        const responseMs = Math.max(0, Date.now() - start);

        const prevAttempts = st.attemptsThisRound.get(client.playerGameId) || 0;
        if (prevAttempts >= st.answerAttempts) {
          return ack?.({ ok: false, reason: "no-lives" });
        }

        const raw = (p.text || "").trim();
        const userNorm = norm(raw);
        if (!userNorm) return ack?.({ ok: false, reason: "empty" });

        st.attemptedThisRound.add(client.playerGameId);
        if (markPlayerActive(st.roomId, client.playerId)) {
          io.to(st.roomId).emit("player_active", { pgId: client.playerGameId });
        }

        const result = classifyTextAnswer(raw, q.acceptedNorms, q.exactNorms);
        const correct = result === "correct";

        // Gestion des tentatives
        let attempts = prevAttempts + 1;
        const livesLeft = st.answerAttempts - attempts;

        if (correct || attempts >= st.answerAttempts) {
          st.answeredThisRound.add(client.playerGameId);
          st.answeredOrder.push(client.playerGameId);
        } else {
          st.attemptsThisRound.set(client.playerGameId, attempts);
        }

        // --------- BONUS DE RAPIDITÉ (texte correct uniquement) ----------
        let speedBonus = 0;
        if (correct && st.speedBonusEnabled) {
            // utilise le même tableau que les bots, RAZ à chaque round dans startRound()
            if (!Array.isArray(st.answeredOrderText)) st.answeredOrderText = [];
            if (!st.answeredOrderText.includes(client.playerGameId)) {
                st.answeredOrderText.push(client.playerGameId);
                const rank = st.answeredOrderText.length;     // 1, 2, 3, …
                const totalPlayers = st.pgIds.size;           // nb de joueurs de la partie (humains + bots)
                speedBonus = computeSpeedBonus(rank, totalPlayers);
            }
        }

        const gained = correct ? computeTextAnswerPoints(st.speedBonusEnabled, speedBonus) : 0;
        recordAnswer(
          st,
          client.playerGameId,
          {
            questionId: q.id,
            text: raw,
            correct,
            mode: "text",
            responseMs,
          },
          gained,
        );

        const lb = await buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds), st);
        io.to(client.roomId).emit("leaderboard_update", { leaderboard: lb });

        ack?.({ ok: true });

        if (correct || livesLeft <= 0) {
          const corr = q.choices.find((c) => c.isCorrect) || null;
          socket.emit("answer_feedback", {
            correct,
            result,
            correctChoiceId: corr ? corr.id : null,
            correctLabel: corr ? corr.label : null,
            responseMs,
            points: gained,
          });
        } else {
          socket.emit("answer_feedback", { correct: false, result, points: 0 });
        }

        //io.to(client.roomId).emit("answer_received");
        if (correct || livesLeft <= 0) {
          io.to(st.roomId).emit("player_answered", {
            pgId: client.playerGameId,
            correct,
            mode: "text",
          });
        }
      }
    );

    /* ---------------- request_choices ---------------- */
    socket.on("request_choices", async (_p: unknown, ack?: (res: { ok: boolean; reason?: string; qcmUsesLeft: number }) => void) => {
      const roomId = socket.data.roomId as string | undefined;
      if (!roomId) return ack?.({ ok: false, reason: "not-in-room", qcmUsesLeft: 0 });

      const st = gameStates.get(roomId);
      if (!st || !st.endsAt || Date.now() > st.endsAt) {
        return ack?.({ ok: false, reason: "round-inactive", qcmUsesLeft: 0 });
      }

      const client = clients.get(socket.id);
      if (!client) return ack?.({ ok: false, reason: "no-client", qcmUsesLeft: 0 });

      const used = st.qcmUsesByPgId.get(client.playerGameId) ?? 0;
      const usesLeft = Math.max(0, st.qcmUses - used);
      if (usesLeft <= 0) {
        return ack?.({ ok: false, reason: "qcm-limit", qcmUsesLeft: 0 });
      }

      const alreadyInQcmMode = st.mcModePgIds.has(client.playerGameId);
      const nextUsesLeft = alreadyInQcmMode ? usesLeft : usesLeft - 1;
      if (!alreadyInQcmMode) {
        st.qcmUsesByPgId.set(client.playerGameId, used + 1);
      }

      st.mcModePgIds.add(client.playerGameId);

      const choices = getShuffledChoicesForSocket(st, socket.id);
      socket.emit("multiple_choice", { choices, qcmUsesLeft: nextUsesLeft });
      return ack?.({ ok: true, qcmUsesLeft: nextUsesLeft });
    });

    /* ---------------- disconnect ---------------- */
    socket.on("disconnect", () => {
      void handleRoomClientDeparture(socket.id);
    });
  });
}
