// /server/src/domain/sockets/race.handlers.ts
import type { Socket } from "socket.io";
import type { Server } from "socket.io";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

import {
  type RaceContext,
  type RacePlayerState,
  speedFromEnergy,
} from "./race.logic";

type RaceDeps = {
  prisma: PrismaClient;
  io: Server;
};

const MAX_DELTA_ENERGY = 120;
const MIN_DELTA_ENERGY = -40;

/**
 * Enregistre tous les handlers liés au mode "race".
 */
export function registerRaceHandlers(
  socket: Socket,
  ctx: RaceContext,
  deps: RaceDeps,
) {
  const {
    raceLobby,
    ongoingRaces,
    raceMembershipBySocket,
    applyRaceProgress,
    notifyRaceFinished,
    emitRaceLobbyUpdate,
    emitRaceLeaderboard,
  } = ctx;
  const { prisma, io } = deps;

  /* ------------- race_lobby_join ------------- */
  socket.on(
    "race_lobby_join",
    async (
      _p: unknown,
      ack?: (res: {
        ok: boolean;
        reason?: string;
        players?: { id: string; name: string }[];
      }) => void,
    ) => {
      try {
        const userId = socket.data.userId as string | undefined;
        if (!userId) return ack?.({ ok: false, reason: "unauthorized" });

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { displayName: true },
        });

        const name = user?.displayName || "Joueur";

        raceLobby.set(socket.id, { socketId: socket.id, userId, name });
        socket.join("race_lobby");
        emitRaceLobbyUpdate();

        ack?.({
          ok: true,
          players: Array.from(raceLobby.values()).map(
            ({ userId: id, name: n }) => ({ id, name: n }),
          ),
        });
      } catch (err) {
        console.error("[race_lobby_join]", err);
        ack?.({ ok: false, reason: "server-error" });
      }
    },
  );

  /* ------------- race_lobby_start ------------- */
  socket.on(
    "race_lobby_start",
    (
      _p: unknown,
      ack?: (res: { ok: boolean; reason?: string; raceId?: string }) => void,
    ) => {
      if (!raceLobby.has(socket.id)) {
        return ack?.({ ok: false, reason: "not-in-lobby" });
      }

      const raceId = randomUUID();
      const players: RacePlayerState[] = Array.from(raceLobby.values()).map(
        (p) => ({
          userId: p.userId,
          name: p.name,
          socketId: p.socketId,
          points: 0,
          speed: 0,
          energy: 0,
          finished: false,
        }),
      );

      ongoingRaces.set(raceId, {
        players: new Map(players.map((p) => [p.userId, p])),
        lastTickMs: Date.now(),
      });

      io.to("race_lobby").emit("race_lobby_started", {
        raceId,
        startedBy: raceLobby.get(socket.id)?.userId ?? null,
      });

      ack?.({ ok: true, raceId });
    },
  );

  /* ------------- race_join ------------- */
  socket.on(
    "race_join",
    (
      payload: { raceId?: string },
      ack?: (res: {
        ok: boolean;
        reason?: string;
        players?: { id: string; name: string; points: number; speed: number }[];
      }) => void,
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

      ack?.({
        ok: true,
        players: Array.from(race.players.values()).map((p) => ({
          id: p.userId,
          name: p.name,
          points: p.points,
          speed: p.speed,
        })),
      });
    },
  );

  /* ------------- race_progress ------------- */
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

      const currentEntry: RacePlayerState =
        current ?? {
          userId,
          name: lobbyPlayer?.name ?? "Joueur",
          socketId: socket.id,
          points: 0,
          speed: 0,
          energy: 0,
          finished: false,
        };

      if (currentEntry.finished) {
        race.players.set(userId, {
          ...currentEntry,
          socketId: socket.id,
          speed: 0,
          energy: 0,
        });
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

  /* ------------- disconnect (race) ------------- */
  socket.on("disconnect", () => {
    // Sortie du lobby de race
    if (raceLobby.has(socket.id)) {
      raceLobby.delete(socket.id);
      emitRaceLobbyUpdate();
    }

    // Sortie d'une race en cours (suppression du joueur de la course)
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
  });
}
