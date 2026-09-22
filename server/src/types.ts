export type RoundChoice = { id: string; label: string; isCorrect: boolean };
export type RoundQuestion = {
  id: string;
  text: string;
  questionCharCount: number;
  defaultAnswerCharCount: number;
  shortestAnswerCharCount: number;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  choices: RoundChoice[];
  acceptedNorms: string[];
  exactNorms: string[];
  correctLabel: string;
};
export type StoredAnswer = {
  questionId: string;
  text: string;
  correct: boolean;
  mode: "mc" | "text";
  responseMs: number;
  points: number;
};
export type GameState = {
  roomId: string;
  gameId: string;
  questions: RoundQuestion[];
  index: number;
  endsAt?: number;
  countdownEndsAt?: number;
  roundStartMs?: number;
  timer?: NodeJS.Timeout;
  answeredThisRound: Set<string>;
  answeredOrderText: string[];
  answeredOrder: string[];
  mcModePgIds: Set<string>;
  qcmUsesByPgId: Map<string, number>;
  roundSeq: number;
  roundUid?: string;
  pgIds: Set<string>;
  attemptsThisRound: Map<string, number>;
  attemptedThisRound: Set<string>;
  answerAttempts: number;
  qcmUses: number;
  isPublicRoom: boolean;
  difficulty: number;
  roundMs: number;
  dynamicQuestionDisplay: boolean;
  manualQuestionLaunch: boolean;
  speedBonusEnabled: boolean;
  waitingForManualLaunch?: boolean;
  finished?: boolean;
  playerData: Map<
    string,
    {
      score: number;
      answers: StoredAnswer[];
      name?: string;
      img?: string | null;
      experience?: number;
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