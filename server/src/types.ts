export type RoundChoice = { id: string; label: string; isCorrect: boolean };
export type RoundQuestion = {
  id: string;
  text: string;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  choices: RoundChoice[];
  acceptedNorms: string[];
  correctLabel: string; 
};
export type GameState = {
  roomId: string;
  gameId: string;
  questions: RoundQuestion[];
  index: number;
  endsAt?: number;
  roundStartMs?: number;
  timer?: NodeJS.Timeout;
  answeredThisRound: Set<string>;
  answeredOrderText: string[];
  answeredOrder: string[];
  roundSeq: number;
  roundUid?: string;
  pgIds: Set<string>;  
  attemptsThisRound: Map<string, number>;
  roundMs: number;  
};
export type Client = {
  socketId: string;
  playerId: string;
  playerGameId: string;
  gameId: string;
  roomId: string;
  name: string;
};
export type EnergyCheck =
  | { ok: true; energy: number; }
  | { ok: false; };
