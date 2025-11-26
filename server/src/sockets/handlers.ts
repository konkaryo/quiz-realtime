// /server/src/domain/sockets/handlers.ts
import { Server } from "socket.io";
import type { Client, GameState } from "../types";
import { prisma } from "../infra/prisma";
import { CFG } from "../config";

// Domain services
import { getOrCreateCurrentGame, clientsInRoom } from "../domain/room/room.service";
import { computeSpeedBonus } from "../domain/player/scoring.service";
import { isFuzzyMatch, norm } from "../domain/question/textmatch";
import { getShuffledChoicesForSocket } from "../domain/question/shuffle";
import { buildLeaderboard } from "../domain/game/leaderboard.service";
import { startGameForRoom } from "../domain/game/game.service";
import { getChallengeByDate } from "../domain/daily/daily.service";


/**
 * Enregistre tous les handlers Socket.IO.
 * - io.use(...) (auth) est fait dans app.ts pour garder ce fichier centré sur les events.
 */
export function registerSocketHandlers( io: Server, clients: Map<string, Client>, gameStates: Map<string, GameState> ) {
  // Daily challenge sessions are scoped to a single socket (solo mode)
  type DailySession = {
    date: string;
    questions: {
      id: string;
      text: string;
      theme: string | null;
      difficulty: string | null;
      img: string | null;
      slotLabel: string | null;
      choices: { id: string; label: string; isCorrect: boolean }[];
      acceptedNorms: string[];
      correctLabel: string;
    }[];
    index: number;
    score: number;
    attempts: number;
    answered: boolean;
    endsAt: number | null;
    roundStartMs: number | null;
    timer: NodeJS.Timeout | null;
    results: {
      questionId: string;
      questionText: string;
      slotLabel: string | null;
      theme: string | null;
      difficulty: string | null;
      img: string | null;
      correct: boolean;
      answer: string | null;
      mode: "text" | "choice" | "timeout";
      responseMs: number;
      correctLabel: string;
    }[];
  };

  const dailySessions = new Map<string, DailySession>();
  const DAILY_ROUND_MS = Number(process.env.DAILY_ROUND_MS || 20000);

  const stopDailyTimer = (socketId: string) => {
    const sess = dailySessions.get(socketId);
    if (sess?.timer) {
      clearTimeout(sess.timer);
      sess.timer = null;
    }
  };

  const queueNextRound = (socket: any) => {
    setTimeout(() => scheduleNext(socket), 1600);
  };

  const scheduleNext = (socket: any) => {
    const sess = dailySessions.get(socket.id);
    if (!sess) return;
    const nextIndex = sess.index + 1;
    const nextQuestion = sess.questions[nextIndex];
    if (!nextQuestion) {
      socket.emit("daily_finished", { score: sess.score, results: sess.results });
      return;
    }
    sess.index = nextIndex;
    sess.attempts = 0;
    sess.answered = false;
    sess.roundStartMs = Date.now();
    sess.endsAt = sess.roundStartMs + DAILY_ROUND_MS;
    sess.timer = setTimeout(() => {
      // MOVED TO SERVER: timeout/validation
      stopDailyTimer(socket.id);
      const responseMs = Math.max(0, Date.now() - (sess.roundStartMs || Date.now()));
      const q = sess.questions[sess.index];
      sess.results.push({
        questionId: q.id,
        questionText: q.text,
        slotLabel: q.slotLabel,
        theme: q.theme,
        difficulty: q.difficulty,
        img: q.img,
        correct: false,
        answer: null,
        mode: "timeout",
        responseMs,
        correctLabel: q.correctLabel,
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
        id: nextQuestion.id,
        text: nextQuestion.text,
        theme: nextQuestion.theme,
        difficulty: nextQuestion.difficulty,
        img: nextQuestion.img,
        slotLabel: nextQuestion.slotLabel,
      },
      score: sess.score,
    });
  };

  const startDaily = (socket: any, sess: DailySession) => {
    sess.index = -1;
    scheduleNext(socket);
  };

  io.on("connection", (socket) => {
    socket.emit("welcome", { id: socket.id });

    /* ---------------- DAILY CHALLENGE (solo) ---------------- */
    socket.on("join_daily", async (p: { date: string }, ack?: (res: { ok: boolean; reason?: string }) => void) => {
      const date = (p?.date || "").trim();
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
      if (!valid) return ack?.({ ok: false, reason: "invalid-date" });
      try {
        const challenge = await getChallengeByDate(prisma, date);
        if (!challenge) return ack?.({ ok: false, reason: "not-found" });
        stopDailyTimer(socket.id);

        dailySessions.set(socket.id, {
          date,
          questions: challenge.questions,
          index: -1,
          score: 0,
          attempts: 0,
          answered: false,
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

    socket.on("daily_request_choices", () => {
      const sess = dailySessions.get(socket.id);
      if (!sess || sess.answered) return;
      const q = sess.questions[sess.index];
      if (!q) return;
      const choices = [...q.choices].map(({ id, label }) => ({ id, label })).sort(() => Math.random() - 0.5);
      socket.emit("daily_multiple_choice", { choices });
    });

    socket.on("daily_submit_answer", (p: { choiceId: string }, ack?: (res: { ok: boolean; reason?: string }) => void) => {
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

      let gained = 0;
      if (choice.isCorrect) {
        const remainingMs = Math.max(0, (sess.endsAt ?? Date.now()) - Date.now());
        const secsLeft = Math.floor(remainingMs / 1000);
        const bonus = Math.floor(secsLeft / 2) * 5;
        gained = 60 + bonus; // MOVED TO SERVER
      }
      sess.score += gained;
      sess.results.push({
        questionId: q.id,
        questionText: q.text,
        slotLabel: q.slotLabel,
        theme: q.theme,
        difficulty: q.difficulty,
        img: q.img,
        correct: !!choice.isCorrect,
        answer: choice.label,
        mode: "choice",
        responseMs,
        correctLabel: q.correctLabel,
      });

      socket.emit("daily_answer_feedback", {
        correct: !!choice.isCorrect,
        correctChoiceId: q.choices.find((c) => c.isCorrect)?.id ?? null,
        correctLabel: q.correctLabel,
        responseMs,
        score: sess.score,
      });
      socket.emit("daily_round_end", {
        index: sess.index,
        correctChoiceId: q.choices.find((c) => c.isCorrect)?.id ?? null,
        correctLabel: q.correctLabel,
        score: sess.score,
      });

      queueNextRound(socket);
      ack?.({ ok: true });
    });

    socket.on("daily_submit_answer_text", (p: { text: string }, ack?: (res: { ok: boolean; reason?: string }) => void) => {
      const sess = dailySessions.get(socket.id);
      if (!sess) return ack?.({ ok: false, reason: "no-session" });
      if (sess.answered) return ack?.({ ok: false, reason: "already" });
      if (!sess.endsAt || Date.now() > sess.endsAt) return ack?.({ ok: false, reason: "too-late" });

      const q = sess.questions[sess.index];
      if (!q) return ack?.({ ok: false, reason: "no-question" });

      const raw = (p?.text || "").trim();
      const userNorm = norm(raw);
      if (!userNorm) return ack?.({ ok: false, reason: "empty" });

      const correct = isFuzzyMatch(userNorm, q.acceptedNorms);
      const responseMs = Math.max(0, Date.now() - (sess.roundStartMs || Date.now()));

      sess.attempts += 1;
      const remainingLives = Math.max(0, CFG.TEXT_LIVES - sess.attempts);

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
          questionId: q.id,
          questionText: q.text,
          slotLabel: q.slotLabel,
          theme: q.theme,
          difficulty: q.difficulty,
          img: q.img,
          correct,
          answer: raw,
          mode: "text",
          responseMs,
          correctLabel: q.correctLabel,
        });

        socket.emit("daily_answer_feedback", {
          correct,
          correctChoiceId: q.choices.find((c) => c.isCorrect)?.id ?? null,
          correctLabel: q.correctLabel,
          responseMs,
          score: sess.score,
        });
        socket.emit("daily_round_end", {
          index: sess.index,
          correctChoiceId: q.choices.find((c) => c.isCorrect)?.id ?? null,
          correctLabel: q.correctLabel,
          score: sess.score,
        });
        queueNextRound(socket);
      } else {
        socket.emit("daily_answer_feedback", { correct: false, livesLeft: remainingLives });
      }

      ack?.({ ok: true });
    });

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

        const game = await getOrCreateCurrentGame(prisma, room.id);

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
        io.to(room.id).emit("lobby_update");
        socket.emit("joined", { playerGameId: pg.id, name: player.name, roomId: room.id });

        const st = gameStates.get(room.id);
        if (st && st.gameId === game.id) {
            st.pgIds.add(pg.id);
            const gameRoom = `game:${st.gameId}`;
            io.sockets.sockets.get(socket.id)?.join(gameRoom);
            st.attemptsThisRound.set(pg.id, 0);
            st.answeredThisRound.delete(pg.id);
            if (Array.isArray((st as any).answeredOrderText)) { st.answeredOrderText = (st as any).answeredOrderText.filter((id: string) => id !== pg.id); }
            if (Array.isArray((st as any).answeredOrder)) { st.answeredOrder = (st as any).answeredOrder.filter((id: string) => id !== pg.id); }

            const lb = await buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds), st);
            io.to(st.roomId).emit("leaderboard_update", { leaderboard: lb });
        }

        const alreadyRunning = !!(st && !st.finished);

        if (game.state !== "running" && !alreadyRunning) {
          try {
            await startGameForRoom(clients, gameStates, io, prisma, room.id);
          } catch (e: any) {
            console.error("[auto start_game on join] error:", e?.message, "\n", e?.stack);
            socket.emit("error_msg", "Unable to auto start the game.");
            /* console.error("[auto start_game on join] error", e);
            socket.emit("error_msg", "Unable to auto start the game."); */

          }
        }
      } catch (err) {
        console.error("[join_game] error", err);
        socket.emit("error_msg", "Server error.");
      }
    });

    /* ---------------- start_game ---------------- */
    socket.on("start_game", async () => {
      const roomId = socket.data.roomId as string | undefined;
      if (!roomId) return socket.emit("error_msg", "Not in a room");

      try {
        const st = gameStates.get(roomId);
        if (st && !st.finished) {
          socket.emit("info_msg", "Game already running");
          return;
        }
        await startGameForRoom(clients, gameStates, io, prisma, roomId);
        socket.emit("info_msg", "Game started");
      } catch (e) {
        console.error("[start_game error]", e);
        socket.emit("error_msg", "Server error");
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

        const q = st.questions[st.index];
        if (!q) return ack?.({ ok: false, reason: "no-question" });

        const choice = q.choices.find((c) => c.id === p.choiceId);
        if (!choice) return ack?.({ ok: false, reason: "bad-choice" });

        const start = st.roundStartMs ?? Date.now();
        const responseMs = Math.max(0, Date.now() - start);

        st.answeredThisRound.add(client.playerGameId);
        st.answeredOrder.push(client.playerGameId);

        await prisma.$transaction(async (tx) => {
          await tx.answer.create({
            data: {
              playerGameId: client.playerGameId,
              questionId: q.id,
              text: choice.label,
              correct: choice.isCorrect,
              mode: 'mc',
              responseMs
            },
          });
          await tx.playerGame.update({
            where: { id: client.playerGameId },
            data: {
              score: { increment: choice.isCorrect ? CFG.MC_ANSWER_POINTS_GAIN : 0 },
            },
          });
        });

        const lb = await buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds), st);
        io.to(client.roomId).emit("leaderboard_update", { leaderboard: lb });

        ack?.({ ok: true });

        const correctChoice = q.choices.find((c) => c.isCorrect) || null;
        socket.emit("answer_feedback", {
          correct: !!choice.isCorrect,
          correctChoiceId: correctChoice ? correctChoice.id : null,
          correctLabel: correctChoice ? correctChoice.label : null,
          responseMs
        });

        //io.to(client.roomId).emit("answer_received");
        io.to(st.roomId).emit("player_answered", { pgId: client.playerGameId, correct: !!choice.isCorrect });
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

        const start = st.roundStartMs ?? Date.now();
        const responseMs = Math.max(0, Date.now() - start);

        const prevAttempts = st.attemptsThisRound.get(client.playerGameId) || 0;
        if (prevAttempts >= CFG.TEXT_LIVES) {
          return ack?.({ ok: false, reason: "no-lives" });
        }

        const raw = (p.text || "").trim();
        const userNorm = norm(raw);
        if (!userNorm) return ack?.({ ok: false, reason: "empty" });

        const correct = isFuzzyMatch(userNorm, q.acceptedNorms);

        // Gestion des tentatives
        let attempts = prevAttempts + 1;
        const livesLeft = CFG.TEXT_LIVES - attempts;

        if (correct || attempts >= CFG.TEXT_LIVES) {
          st.answeredThisRound.add(client.playerGameId);
          st.answeredOrder.push(client.playerGameId);
        } else {
          st.attemptsThisRound.set(client.playerGameId, attempts);
        }

        // --------- BONUS DE RAPIDITÉ (texte correct uniquement) ----------
        let speedBonus = 0;
        if (correct) {
            // utilise le même tableau que les bots, RAZ à chaque round dans startRound()
            if (!Array.isArray(st.answeredOrderText)) st.answeredOrderText = [];
            if (!st.answeredOrderText.includes(client.playerGameId)) {
                st.answeredOrderText.push(client.playerGameId);
                const rank = st.answeredOrderText.length;     // 1, 2, 3, …
                const totalPlayers = st.pgIds.size;           // nb de joueurs de la partie (humains + bots)
                speedBonus = computeSpeedBonus(rank, totalPlayers);
            }
        }

        await prisma.$transaction(async (tx) => {
          await tx.answer.create({
            data: {
              playerGameId: client.playerGameId,
              questionId:   q.id, 
              text: raw,
              correct,
              mode: 'text',
              responseMs
            },
          });
          if (correct) {
            const increment = CFG.TXT_ANSWER_POINTS_GAIN + speedBonus; // 100 + bonus
            await tx.playerGame.update({
              where: { id: client.playerGameId },
              data: {
                score: { increment }
              },
            });
          }
        });

        const lb = await buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds), st);
        io.to(client.roomId).emit("leaderboard_update", { leaderboard: lb });

        ack?.({ ok: true });

        if (correct || livesLeft <= 0) {
          const corr = q.choices.find((c) => c.isCorrect) || null;
          socket.emit("answer_feedback", {
            correct,
            correctChoiceId: corr ? corr.id : null,
            correctLabel: corr ? corr.label : null,
            responseMs
          });
        } else {
          socket.emit("answer_feedback", { correct: false });
        }

        //io.to(client.roomId).emit("answer_received");
        io.to(st.roomId).emit("player_answered", { pgId: client.playerGameId, correct });
      }
    );

    /* ---------------- request_choices ---------------- */
    socket.on("request_choices", async () => {
      const roomId = socket.data.roomId as string | undefined;
      if (!roomId) return;

      const st = gameStates.get(roomId);
      if (!st || !st.endsAt || Date.now() > st.endsAt) return;

      const client = clients.get(socket.id);
      if (!client) return;

      const choices = getShuffledChoicesForSocket(st, socket.id);
      socket.emit("multiple_choice", { choices });
    });

    /* ---------------- disconnect ---------------- */
    socket.on("disconnect", async () => {
      stopDailyTimer(socket.id);
      dailySessions.delete(socket.id);
      const c = clients.get(socket.id);
      if (!c) return;

      const { roomId, gameId } = c;
      clients.delete(socket.id);

      const left = clientsInRoom(clients, roomId).length;
      if (left === 0) {
        try {
          await prisma.game.update({ where: { id: gameId }, data: { state: "lobby" } });
        } catch (e) {
          console.warn("[disconnect] can't set game state:", e);
        }

        const st = gameStates.get(roomId);
        if (st?.timer) clearTimeout(st.timer);
        gameStates.delete(roomId);

        io.to(roomId).emit("info_msg", "Tous les joueurs ont quitté. La partie est arrêtée.");
      }
    });
  });
}
