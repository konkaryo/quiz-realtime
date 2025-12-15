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
export type StoredAnswer = {
  questionId: string;
  text: string;
  correct: boolean;
  mode: "mc" | "text";
  responseMs: number;
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
  mcModePgIds: Set<string>;
  roundSeq: number;
  roundUid?: string;
  pgIds: Set<string>;
  attemptsThisRound: Map<string, number>;
  roundMs: number;
  finished?: boolean;
  playerData: Map<
    string,
    {
      score: number;
      answers: StoredAnswer[];
      name?: string;
      img?: string | null;
    }
  >;
  persistedResults?: boolean;
};
export type Client = {
  socketId: string;
  playerId: string;
  playerGameId: string;
  gameId: string;
  roomId: string;
  name: string;
};