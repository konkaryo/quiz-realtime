// /server/src/domain/sockets/race.logic.ts
import { Server } from "socket.io";

export type RacePlayerState = {
  userId: string;
  name: string;
  socketId: string;
  points: number;
  speed: number;
  energy: number;
  finished: boolean;
};

export type RaceLobbyPlayer = {
  socketId: string;
  userId: string;
  name: string;
};

export type RaceInstance = {
  players: Map<string, RacePlayerState>;
  lastTickMs: number;
};

export type RaceMembership = {
  raceId: string;
  userId: string;
};

export type RaceContext = {
  raceLobby: Map<string, RaceLobbyPlayer>;
  ongoingRaces: Map<string, RaceInstance>;
  raceMembershipBySocket: Map<string, RaceMembership>;

  applyRaceProgress: (
    race: RaceInstance,
    now?: number
  ) => { changed: boolean; newlyFinished: RacePlayerState[] };

  notifyRaceFinished: (raceId: string, players: RacePlayerState[]) => void;
  emitRaceLobbyUpdate: () => void;
  emitRaceLeaderboard: (raceId: string, skipProgress?: boolean) => void;
};

// --- Constantes internes au système de course ---
const RACE_MAX_POINTS = 10_000;
const RACE_TICK_MS = 1_000;
const ENERGY_DECAY_PER_SECOND = 0.98;

/**
 * Calcule la vitesse en fonction de l'énergie.
 * Exporté pour être utilisable côté handlers (join/progress, etc.).
 */
export function speedFromEnergy(energy: number): number {
  const inner = 0.1 * energy - 3;
  if (inner <= 0) return 0;
  const base = Math.sqrt(inner) - 0.5;
  const raw = 10 * base;
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw;
}

/**
 * Fonction pure : applique un "tick" de progression à une course.
 * Ne dépend pas de Socket.IO ni d'I/O, seulement de l'état de la course.
 */
export function applyRaceProgressPure(
  race: RaceInstance,
  now = Date.now()
): { changed: boolean; newlyFinished: RacePlayerState[] } {
  const deltaSeconds = Math.max(0, (now - race.lastTickMs) / 1000);
  if (deltaSeconds <= 0) {
    return { changed: false, newlyFinished: [] };
  }

  race.lastTickMs = now;
  let changed = false;
  const newlyFinished: RacePlayerState[] = [];

  const decayFactor = Math.pow(ENERGY_DECAY_PER_SECOND, deltaSeconds);

  for (const [userId, player] of race.players) {
    // Joueur déjà arrivé : on normalise son état
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

    if (
      nextPoints !== player.points ||
      nextSpeed !== player.speed ||
      nextEnergy !== player.energy
    ) {
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

    race.players.set(userId, nextPlayer);
  }

  return { changed, newlyFinished };
}

/**
 * Crée le contexte Race : maps + fonctions + boucle de tick.
 */
export function createRaceContext(io: Server): RaceContext {
  const raceLobby = new Map<string, RaceLobbyPlayer>();
  const ongoingRaces = new Map<string, RaceInstance>();
  const raceMembershipBySocket = new Map<string, RaceMembership>();

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
      players: Array.from(raceLobby.values()).map(({ userId, name }) => ({
        id: userId,
        name,
      })),
    });
  };

  const applyRaceProgress = (
    race: RaceInstance,
    now = Date.now()
  ): { changed: boolean; newlyFinished: RacePlayerState[] } =>
    applyRaceProgressPure(race, now);

  const emitRaceLeaderboard = (raceId: string, skipProgress = false) => {
    const race = ongoingRaces.get(raceId);
    if (!race) return;

    if (!skipProgress) {
      const { newlyFinished } = applyRaceProgress(race);
      if (newlyFinished.length) {
        notifyRaceFinished(raceId, newlyFinished);
      }
    }

    const players = Array.from(race.players.values())
      .sort(
        (a, b) =>
          b.points - a.points || a.name.localeCompare(b.name)
      )
      .map((p) => ({
        id: p.userId,
        name: p.name,
        points: Math.round(p.points),
        speed: Number.isFinite(p.speed) ? Number(p.speed.toFixed(1)) : 0,
      }));

    io.to(`race:${raceId}`).emit("race_leaderboard", { players });
  };

  // Boucle globale de tick pour toutes les courses
  setInterval(() => {
    const now = Date.now();

    for (const [raceId, race] of ongoingRaces) {
      const { changed, newlyFinished } = applyRaceProgress(race, now);
      if (newlyFinished.length) {
        notifyRaceFinished(raceId, newlyFinished);
      }
      if (changed) {
        // on évite un double applyRaceProgress avec skipProgress = true
        emitRaceLeaderboard(raceId, true);
      }
    }
  }, RACE_TICK_MS);

  return {
    raceLobby,
    ongoingRaces,
    raceMembershipBySocket,
    applyRaceProgress,
    notifyRaceFinished,
    emitRaceLobbyUpdate,
    emitRaceLeaderboard,
  };
}
