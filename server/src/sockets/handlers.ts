import { Server } from "socket.io";
import type { Client, GameState } from "../types";
import { prisma } from "../infra/prisma";
import { CFG } from "../config";

// Domain services
import { getOrCreateCurrentGame, clientsInRoom } from "../domain/room/room.service";
import { spendEnergy, addEnergy, getEnergy, scoreMultiplier } from "../domain/player/energy.service";
import { isFuzzyMatch, norm } from "../domain/question/textmatch";
import { getShuffledChoicesForSocket } from "../domain/question/shuffle";
import { buildLeaderboard } from "../domain/game/leaderboard.service";
import { startGameForRoom } from "../domain/game/game.service";

/**
 * Enregistre tous les handlers Socket.IO.
 * - io.use(...) (auth) est fait dans app.ts pour garder ce fichier centré sur les events.
 */
export function registerSocketHandlers( io: Server, clients: Map<string, Client>, gameStates: Map<string, GameState> ) {
  io.on("connection", (socket) => {
    socket.emit("welcome", { id: socket.id });

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

        if (game.state !== "running") {
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

        const gain = CFG.AUTO_ENERGY_GAIN + (choice.isCorrect ? CFG.MC_ANSWER_ENERGY_GAIN : 0);

        const res = await addEnergy(prisma, client, gain);
        if (!res.ok) return ack?.({ ok: false, reason: "no-player" });

        await prisma.$transaction(async (tx) => {
          await tx.answer.create({
            data: {
              playerGameId: client.playerGameId,
              questionId: q.id,
              text: choice.label,
              correct: choice.isCorrect,
              responseMs
            },
          });
          await tx.playerGame.update({
            where: { id: client.playerGameId },
            data: {
              energy: res.energy!,
              score: { increment: choice.isCorrect ? CFG.MC_ANSWER_POINTS_GAIN : 0 },
            },
          });
        });

        socket.emit("energy_update", {
          energy: res.energy!,
          multiplier: scoreMultiplier(res.energy!),
        });

        const lb = await buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds));
        io.to(client.roomId).emit("leaderboard_update", { leaderboard: lb });

        ack?.({ ok: true });

        const correctChoice = q.choices.find((c) => c.isCorrect) || null;
        socket.emit("answer_feedback", {
          correct: !!choice.isCorrect,
          correctChoiceId: correctChoice ? correctChoice.id : null,
          correctLabel: correctChoice ? correctChoice.label : null,
          responseMs
        });

        io.to(client.roomId).emit("answer_received");
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
        } else {
          st.attemptsThisRound.set(client.playerGameId, attempts);
        }

        // Énergie & score
        const playerEnergy = await getEnergy(prisma, client);
        if (!playerEnergy.ok) return ack?.({ ok: false, reason: "no-energy" });

        const gain = CFG.AUTO_ENERGY_GAIN + (correct ? CFG.TXT_ANSWER_ENERGY_GAIN : 0);
        const res = await addEnergy(prisma, client, gain);
        if (!res.ok) return ack?.({ ok: false, reason: "no-player" });

        await prisma.$transaction(async (tx) => {
          await tx.answer.create({
            data: {
              playerGameId: client.playerGameId,
              questionId:   q.id, 
              text: raw,
              correct,
              responseMs
            },
          });
          if (correct) {
            await tx.playerGame.update({
              where: { id: client.playerGameId },
              data: {
                energy: res.energy!,
                score: {
                  increment:
                    scoreMultiplier(playerEnergy.energy!) * CFG.TXT_ANSWER_POINTS_GAIN,
                },
              },
            });
            socket.emit("energy_update", {
              energy: res.energy!,
              multiplier: scoreMultiplier(res.energy!),
            });
          }
        });

        const lb = await buildLeaderboard(prisma, st.gameId, Array.from(st.pgIds));
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

        io.to(client.roomId).emit("answer_received");
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

      const res = await spendEnergy(prisma, client, CFG.MC_COST);
      if (!res.ok) return socket.emit("not_enough_energy");

      socket.emit("energy_update", {
        energy: res.energy!,
        multiplier: scoreMultiplier(res.energy!),
      });

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
