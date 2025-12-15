// /server/src/domain/sockets/handlers.ts
import { Server } from "socket.io";
import type { Client, GameState, StoredAnswer } from "../types";
import { prisma } from "../infra/prisma";
import { CFG } from "../config";
import { randomUUID } from "crypto";

// Domain services
import { getOrCreateCurrentGame, clientsInRoom } from "../domain/room/room.service";
import { computeSpeedBonus } from "../domain/player/scoring.service";
import { isFuzzyMatch, norm } from "../domain/question/textmatch";
import { getShuffledChoicesForSocket } from "../domain/question/shuffle";
import { buildLeaderboard } from "../domain/game/leaderboard.service";
import { startGameForRoom } from "../domain/game/game.service";
import { getChallengeByDate } from "../domain/daily/daily.service";
import { recordDailyScoreIfFirst } from "../domain/daily/daily-score.service";
import { ensurePlayerForUser } from "../domain/player/player.service";

type RacePlayerState = {
  userId: string;
  name: string;
  socketId: string;
  points: number;
  speed: number;
  energy: number;
  finished: boolean;
};


/**
 * Enregistre tous les handlers Socket.IO.
 * - io.use(...) (auth) est fait dans app.ts pour garder ce fichier centré sur les events.
 */
export function registerSocketHandlers( io: Server, clients: Map<string, Client>, gameStates: Map<string, GameState> ) {
  const raceLobby = new Map<string, { socketId: string; userId: string; name: string }>();
  const ongoingRaces = new Map<string, { players: Map<string, RacePlayerState>; lastTickMs: number }>();
  const raceMembershipBySocket = new Map<string, { raceId: string; userId: string }>();
  const RACE_MAX_POINTS = 10_000;
  const RACE_TICK_MS = 1_000;
  const ENERGY_DECAY_PER_SECOND = 0.98;
  const MAX_DELTA_ENERGY = 120;
  const MIN_DELTA_ENERGY = -40;

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

  const recordAnswer = (st: GameState, pgId: string, answer: StoredAnswer, gained: number, name?: string, img?: string | null) => {
    const entry = ensurePlayerData(st, pgId, name, img);
    entry.answers.push(answer);
    if (gained > 0) {
      entry.score += gained;
    }
  };


  const speedFromEnergy = (energy: number) => {
    const inner = 0.1 * energy - 3;
    if (inner <= 0) return 0;
    const base = Math.sqrt(inner) - 0.5;
    const raw = 10 * base;
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return raw;
  };

  const applyRaceProgress = (
    race: { players: Map<string, RacePlayerState>; lastTickMs: number },
    now = Date.now(),
  ) => {
    const deltaSeconds = Math.max(0, (now - race.lastTickMs) / 1000);
    if (deltaSeconds <= 0) return { changed: false, newlyFinished: [] as RacePlayerState[] };

    race.lastTickMs = now;
    let changed = false;
    const newlyFinished: RacePlayerState[] = [];

    const decayFactor = Math.pow(ENERGY_DECAY_PER_SECOND, deltaSeconds);

    for (const [userId, player] of race.players) {
      if (player.finished) {
        const normalized: RacePlayerState = {
          ...player,
          points: RACE_MAX_POINTS,
          speed: 0,
          energy: 0,
        };
        if (
          normalized.points !== player.points ||
          normalized.speed !== player.speed ||
          normalized.energy !== player.energy
        ) {
          changed = true;
        }
        race.players.set(userId, normalized);
        continue;
      }

      const decayedEnergy = player.energy * decayFactor;
      const candidateSpeed = speedFromEnergy(decayedEnergy);
      const candidatePoints = player.points + candidateSpeed * deltaSeconds;
      const reachedGoal = candidatePoints >= RACE_MAX_POINTS;
      const nextPoints = reachedGoal ? RACE_MAX_POINTS : candidatePoints;
      const nextSpeed = reachedGoal ? 0 : candidateSpeed;
      const nextEnergy = reachedGoal ? 0 : decayedEnergy;

      if (nextPoints !== player.points || nextSpeed !== player.speed || nextEnergy !== player.energy) {
        changed = true;
      }

      const finished = player.finished || reachedGoal;
      const nextPlayer: RacePlayerState = {
        ...player,
        points: nextPoints,
        speed: nextSpeed,
        energy: nextEnergy,
        finished,
      };

      if (finished && !player.finished) {
        newlyFinished.push(nextPlayer);
      }

      race.players.set(userId, {
        ...nextPlayer,
      });
    }

    return { changed, newlyFinished };
  };

  const notifyRaceFinished = (raceId: string, players: RacePlayerState[]) => {
    for (const player of players) {
      io.to(player.socketId).emit("race_finished", {
        raceId,
        points: Math.round(player.points),
      });
    }
  };

  const emitRaceLobbyUpdate = () => {
    io.to("race_lobby").emit("race_lobby_update", {
      players: Array.from(raceLobby.values()).map(({ userId, name }) => ({ id: userId, name })),
    });
  };

  const emitRaceLeaderboard = (raceId: string, skipProgress = false) => {
    const race = ongoingRaces.get(raceId);
    if (!race) return;

    if (!skipProgress) {
      const { newlyFinished } = applyRaceProgress(race);
      if (newlyFinished.length) notifyRaceFinished(raceId, newlyFinished);
    }

    const players = Array.from(race.players.values())
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .map((p) => ({
        id: p.userId,
        name: p.name,
        points: Math.round(p.points),
        speed: Number.isFinite(p.speed) ? Number(p.speed.toFixed(1)) : 0,
      }));

    io.to(`race:${raceId}`).emit("race_leaderboard", { players });
  };

  setInterval(() => {
    const now = Date.now();

    for (const [raceId, race] of ongoingRaces) {
      const { changed, newlyFinished } = applyRaceProgress(race, now);
      if (newlyFinished.length) notifyRaceFinished(raceId, newlyFinished);
      if (changed) {
        emitRaceLeaderboard(raceId, true);
      }
    }
  }, RACE_TICK_MS);
  // Daily challenge sessions are scoped to a single socket (solo mode)
  type DailySession = {
    date: string;
    challengeId: string;
    playerId: string;
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
    mcMode: boolean;
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
    setTimeout(() => {
      void scheduleNext(socket);
    }, 1600);
  };

  const scheduleNext = async (socket: any) => {
    const sess = dailySessions.get(socket.id);
    if (!sess) return;
    const nextIndex = sess.index + 1;
    const nextQuestion = sess.questions[nextIndex];
    if (!nextQuestion) {
      try {
        await recordDailyScoreIfFirst(prisma, sess.challengeId, sess.playerId, sess.score);
      } catch (err) {
        console.error("[daily_score_record]", err);
      }
      socket.emit("daily_finished", { score: sess.score, results: sess.results });
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
    void scheduleNext(socket);
  };

  io.on("connection", (socket) => {
    socket.emit("welcome", { id: socket.id });
  
    socket.on("race_lobby_join", async (_p: unknown, ack?: (res: { ok: boolean; reason?: string; players?: { id: string; name: string }[] }) => void) => {
      try {
        const userId = socket.data.userId as string | undefined;
        if (!userId) return ack?.({ ok: false, reason: "unauthorized" });

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
        const name = user?.displayName || "Joueur";

        raceLobby.set(socket.id, { socketId: socket.id, userId, name });
        socket.join("race_lobby");
        emitRaceLobbyUpdate();
        ack?.({ ok: true, players: Array.from(raceLobby.values()).map(({ userId: id, name: n }) => ({ id, name: n })) });
      } catch (err) {
        console.error("[race_lobby_join]", err);
        ack?.({ ok: false, reason: "server-error" });
      }
    });

    socket.on("race_lobby_start", (_p: unknown, ack?: (res: { ok: boolean; reason?: string; raceId?: string }) => void) => {
      if (!raceLobby.has(socket.id)) {
        return ack?.({ ok: false, reason: "not-in-lobby" });
      }
      const raceId = randomUUID();
      const players = Array.from(raceLobby.values()).map((p) => ({
        userId: p.userId,
        name: p.name,
        socketId: p.socketId,
        points: 0,
        speed: 0,
        energy: 0,
        finished: false,
      }));
      ongoingRaces.set(raceId, { players: new Map(players.map((p) => [p.userId, p])), lastTickMs: Date.now() });
      io.to("race_lobby").emit("race_lobby_started", { raceId, startedBy: raceLobby.get(socket.id)?.userId ?? null });
      ack?.({ ok: true, raceId });
    });

    socket.on(
      "race_join",
      (
        payload: { raceId?: string },
        ack?: (res: { ok: boolean; reason?: string; players?: { id: string; name: string; points: number; speed: number }[] }) => void,
      ) => {
        const raceId = (payload?.raceId || "").trim();
        const userId = socket.data.userId as string | undefined;
        if (!raceId) return ack?.({ ok: false, reason: "invalid-race" });
        if (!userId) return ack?.({ ok: false, reason: "unauthorized" });

        const race = ongoingRaces.get(raceId);
        if (!race) return ack?.({ ok: false, reason: "not-found" });

        const { newlyFinished } = applyRaceProgress(race);
        if (newlyFinished.length) notifyRaceFinished(raceId, newlyFinished);

        const knownPlayer = race.players.get(userId);
        const lobbyPlayer = raceLobby.get(socket.id);

        const entry: RacePlayerState = {
          userId,
          name: knownPlayer?.name ?? lobbyPlayer?.name ?? "Joueur",
          socketId: socket.id,
          points: knownPlayer?.points ?? 0,
          energy: knownPlayer?.energy ?? 0,
          speed: knownPlayer?.speed ?? speedFromEnergy(knownPlayer?.energy ?? 0),
          finished: knownPlayer?.finished ?? false,
        };

        socket.join(`race:${raceId}`);
        raceMembershipBySocket.set(socket.id, { raceId, userId });
        race.players.set(userId, entry);

        emitRaceLeaderboard(raceId);
        ack?.({ ok: true, players: Array.from(race.players.values()).map((p) => ({ id: p.userId, name: p.name, points: p.points, speed: p.speed })) });
      },
    );

    socket.on(
      "race_progress",
      (payload: { raceId?: string; deltaEnergy?: number }) => {
        const raceId = (payload?.raceId || "").trim();
        const userId = socket.data.userId as string | undefined;
        if (!raceId || !userId) return;

        const race = ongoingRaces.get(raceId);
        if (!race) return;

        const now = Date.now();
        const { newlyFinished } = applyRaceProgress(race, now);
        if (newlyFinished.length) notifyRaceFinished(raceId, newlyFinished);

        const current = race.players.get(userId);
        const lobbyPlayer = raceLobby.get(socket.id);
        const currentEntry: RacePlayerState = current ?? {
          userId,
          name: lobbyPlayer?.name ?? "Joueur",
          socketId: socket.id,
          points: 0,
          speed: 0,
          energy: 0,
          finished: false,
        };

        if (currentEntry.finished) {
          race.players.set(userId, { ...currentEntry, socketId: socket.id, speed: 0, energy: 0 });
          return;
        }

        const deltaEnergyRaw = Number(payload?.deltaEnergy ?? 0);
        const deltaEnergy = Number.isFinite(deltaEnergyRaw)
          ? Math.max(MIN_DELTA_ENERGY, Math.min(MAX_DELTA_ENERGY, deltaEnergyRaw))
          : 0;

        const updatedEnergy = Math.max(0, currentEntry.energy + deltaEnergy);
        const nextSpeed = speedFromEnergy(updatedEnergy);

        const next: RacePlayerState = {
          ...currentEntry,
          socketId: socket.id,
          speed: nextSpeed,
          energy: updatedEnergy,
          finished: false,
        };

        race.players.set(userId, next);
      },
    );

    socket.on("disconnect", () => {
      if (raceLobby.has(socket.id)) {
        raceLobby.delete(socket.id);
        emitRaceLobbyUpdate();
      }
    });

      const raceMembership = raceMembershipBySocket.get(socket.id);
      if (raceMembership) {
        const { raceId, userId } = raceMembership;
        raceMembershipBySocket.delete(socket.id);
        const race = ongoingRaces.get(raceId);
        if (race) {
          race.players.delete(userId);
          emitRaceLeaderboard(raceId);
        }
      }

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
      sess.mcMode = true;
      const choices = [...q.choices].map(({ id, label }) => ({ id, label })).sort(() => Math.random() - 0.5);
      socket.emit("daily_multiple_choice", { choices });
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
      correct: isCorrect,
      answer: choice.label,
      mode: "choice",
      responseMs,
      correctLabel: q.correctLabel,
    });

    const correctChoice = q.choices.find((c) => c.isCorrect) ?? null;

    // Payload de base
    const feedbackPayload: {
      correct: boolean;
      correctChoiceId: string | null;
      correctLabel: string | null;
      responseMs: number;
      score: number;
      livesLeft?: number;
    } = {
      correct: isCorrect,
      correctChoiceId: correctChoice ? correctChoice.id : null,
      correctLabel: q.correctLabel,
      responseMs,
      score: sess.score,
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

    const correct = isFuzzyMatch(userNorm, q.acceptedNorms);
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

      const baseFeedback = {
        correct,
        correctChoiceId: q.choices.find((c) => c.isCorrect)?.id ?? null,
        correctLabel: q.correctLabel,
        responseMs,
        score: sess.score,
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
        livesLeft: remainingLives,
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
            ensurePlayerData(st, pg.id, player.name);
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

        if (st.mcModePgIds?.has(client.playerGameId)) {
          return ack?.({ ok: false, reason: "mc-mode" });
        }

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

        const gained = correct ? CFG.TXT_ANSWER_POINTS_GAIN + speedBonus : 0;
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

      st.mcModePgIds.add(client.playerGameId);

      const choices = getShuffledChoicesForSocket(st, socket.id);
      socket.emit("multiple_choice", { choices });
    });

    /* ---------------- disconnect ---------------- */
    socket.on("disconnect", async () => {

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
