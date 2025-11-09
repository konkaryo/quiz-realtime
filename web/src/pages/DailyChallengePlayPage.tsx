// web/src/pages/DailyChallengePlayPage.tsx
import clsx from "clsx";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Lives } from "../components/game/Lives";
import { QuestionRecapList } from "../components/QuestionRecapList";
import { themeMeta } from "../lib/themeMeta";

const API_BASE = import.meta.env.VITE_API_BASE as string;

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

type ChallengeChoice = { id: string; label: string; isCorrect: boolean };

type ChallengeQuestion = {
  id: string;
  text: string;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  choices: ChallengeChoice[];
  acceptedNorms: string[];
  correctLabel: string;
  slotLabel: string | null;
  position: number;
};

type ChallengeDetail = {
  date: string;
  questionCount: number;
  questions: ChallengeQuestion[];
};

type ChallengeResponse = {
  challenge: ChallengeDetail;
};

type AnswerRecord = {
  questionId: string;
  choiceId: string | null;
  userAnswer: string | null;
  correct: boolean;
  responseMs: number;
  attempts: number;
  mode: "text" | "mcq";
};

type GameState = "intro" | "playing" | "finished";

const TOTAL_QUESTION_COUNT = 15;
const TOTAL_TIME_MS = 3 * 60 * 1000;
const TEXT_MODE_LIVES = 3;

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSeconds(value: number): string {
  const seconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function TimerBar({ totalMs, remainingSeconds }: { totalMs: number; remainingSeconds: number }) {
  const totalSeconds = Math.max(1, Math.round(totalMs / 1000));
  const safeRemaining = Math.max(0, Math.round(remainingSeconds));
  const progress = 1 - Math.min(1, safeRemaining / totalSeconds);
  const urgent = safeRemaining <= 15;

  return (
    <div className="w-full">
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/12">
        <div
          className={clsx(
            "h-full rounded-full transition-[width] duration-200 ease-linear",
            urgent ? "bg-rose-400" : "bg-white",
          )}
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>
      <div className={clsx("mt-4 text-center text-4xl font-semibold tabular-nums", urgent ? "text-rose-200" : "text-white")}
        aria-live="polite"
      >
        {formatSeconds(safeRemaining)}
      </div>
      <div className="mt-2 text-center text-[11px] uppercase tracking-[0.35em] text-white/60">
        Temps restant
      </div>
    </div>
  );
}

function normString(input: string): string {
  let value = (input ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "");
  value = value.replace(/[\u2019'`´]/g, "'");
  value = value.replace(/[^a-z0-9]+/g, " ").trim();
  if (!value) return "";
  const STOP = new Set([
    "le",
    "la",
    "les",
    "l",
    "un",
    "une",
    "des",
    "du",
    "de",
    "d",
    "au",
    "aux",
    "et",
    "&",
    "à",
    "en",
    "sur",
    "sous",
    "dans",
    "par",
    "pour",
    "the",
    "a",
    "an",
    "of",
  ]);
  const tokens = value.split(/\s+/).filter((tok) => tok && !STOP.has(tok));
  return tokens.join(" ");
}

function maxEditsFor(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  if (length <= 10) return 2;
  if (length <= 15) return 3;
  return Math.min(4, Math.floor(length * 0.15));
}

function damerauLevenshteinWithCutoff(a: string, b: string, maxEdits: number): number {
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > maxEdits) return maxEdits + 1;

  const INF = maxEdits + 1;
  let prev = new Array(m + 1).fill(INF);
  let curr = new Array(m + 1).fill(INF);
  let prevPrev = new Array(m + 1).fill(INF);

  for (let j = 0; j <= m; j += 1) {
    prev[j] = Math.min(j, INF);
  }

  for (let i = 1; i <= n; i += 1) {
    const from = Math.max(1, i - maxEdits);
    const to = Math.min(m, i + maxEdits);

    curr.fill(INF);
    curr[0] = Math.min(i, INF);
    let rowMin = curr[0];

    for (let j = from; j <= to; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }

      curr[j] = Math.min(value, INF);
      if (curr[j] < rowMin) {
        rowMin = curr[j];
      }
    }

    if (rowMin > maxEdits) {
      return maxEdits + 1;
    }

    [prevPrev, prev, curr] = [prev, curr, prevPrev];
  }

  const dist = prev[m];
  return dist > maxEdits ? maxEdits + 1 : dist;
}

function isFuzzyMatch(userNorm: string, accepted: string[]): boolean {
  if (!userNorm) return false;
  if (accepted.includes(userNorm)) return true;
  for (const answer of accepted) {
    if (!answer) continue;
    if (userNorm === answer) return true;
    const maxEdits = maxEditsFor(answer.length);
    if (Math.abs(userNorm.length - answer.length) > maxEdits) continue;
    const dist = damerauLevenshteinWithCutoff(userNorm, answer, maxEdits);
    if (dist <= maxEdits) return true;
  }
  return false;
}

function formatIsoDate(dateIso: string | null) {
  if (!dateIso) return null;
  const match = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex, day } as const;
}

export default function DailyChallengePlayPage() {
  const navigate = useNavigate();
  const params = useParams<{ date?: string }>();
  const dateIso = params.date ?? null;
  const parsedDate = formatIsoDate(dateIso);

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>("intro");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [records, setRecords] = useState<(AnswerRecord | null)[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [questionStart, setQuestionStart] = useState<number | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [totalDuration, setTotalDuration] = useState<number | null>(null);
  const [runEndsAt, setRunEndsAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(TOTAL_TIME_MS / 1000);
  const [persistedMultipleChoice, setPersistedMultipleChoice] = useState(false);
  const [activeMultipleChoice, setActiveMultipleChoice] = useState(false);
  const [remainingLives, setRemainingLives] = useState<number>(TEXT_MODE_LIVES);
  const [attemptCount, setAttemptCount] = useState<number>(0);
  const [attemptFeedback, setAttemptFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!dateIso) {
      setError("Date de défi manquante");
      setChallenge(null);
      setRecords([]);
      setGameState("intro");
      setCurrentIndex(0);
      setLoading(false);
      return;
    }
    if (!parsedDate) {
      setError("Date de défi invalide");
      setChallenge(null);
      setRecords([]);
      setGameState("intro");
      setCurrentIndex(0);
      setLoading(false);
      return;
    }
    setError(null);
  }, [dateIso, parsedDate]);

  const normalizedDateIso = useMemo(() => {
    if (!parsedDate) return null;
    const y = parsedDate.year.toString().padStart(4, "0");
    const m = (parsedDate.monthIndex + 1).toString().padStart(2, "0");
    const d = parsedDate.day.toString().padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [parsedDate]);

  useEffect(() => {
    if (!normalizedDateIso) return;
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/daily/challenges/${normalizedDateIso}`, {
          signal: controller.signal,
          credentials: "include",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as ChallengeResponse;
        if (cancelled) return;
        const rawChallenge = data.challenge;
        const limitedQuestions = rawChallenge.questions.slice(0, TOTAL_QUESTION_COUNT);
        const sanitizedChallenge: ChallengeDetail = {
          ...rawChallenge,
          questionCount: limitedQuestions.length,
          questions: limitedQuestions,
        };
        setChallenge(sanitizedChallenge);
        setRecords(Array.from({ length: sanitizedChallenge.questions.length }, () => null));
        setGameState("intro");
        setCurrentIndex(0);
        setTextAnswer("");
        setRunStartedAt(null);
        setTotalDuration(null);
        setRunEndsAt(null);
        setRemainingSeconds(TOTAL_TIME_MS / 1000);
        setRemainingLives(TEXT_MODE_LIVES);
        setAttemptCount(0);
        setAttemptFeedback(null);
        setActiveMultipleChoice(false);
        setPersistedMultipleChoice(false);
      } catch (e: any) {
        if (cancelled) return;
        if (e?.name === "AbortError") return;
        const message = e?.message;
        if (message === "not_found") {
          setError("Défi introuvable pour cette date");
        } else {
          setError(message || "Impossible de charger le défi");
        }
        setChallenge(null);
        setRecords([]);
        setGameState("intro");
        setCurrentIndex(0);
        setRunEndsAt(null);
        setRemainingSeconds(TOTAL_TIME_MS / 1000);
        setRemainingLives(TEXT_MODE_LIVES);
        setAttemptCount(0);
        setAttemptFeedback(null);
        setActiveMultipleChoice(false);
        setPersistedMultipleChoice(false);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [normalizedDateIso]);

  const finishChallenge = useCallback(
    (reason: "completed" | "timeout") => {
      let alreadyFinished = false;
      setGameState((prev) => {
        if (prev === "finished") {
          alreadyFinished = true;
          return prev;
        }
        return "finished";
      });
      if (alreadyFinished) return;
      setQuestionStart(null);
      setTextAnswer("");
      setRunEndsAt(null);
      setRemainingSeconds(0);
      setTotalDuration((prev) => {
        if (prev !== null) return prev;
        if (runStartedAt !== null) {
          const elapsed = Math.round(performance.now() - runStartedAt);
          if (reason === "timeout") return TOTAL_TIME_MS;
          return Math.min(TOTAL_TIME_MS, elapsed);
        }
        return reason === "timeout" ? TOTAL_TIME_MS : 0;
      });
    },
    [runStartedAt],
  );

  useEffect(() => {
    if (gameState !== "playing" || runEndsAt === null) return;
    let cancelled = false;
    let timer = 0;
    const update = () => {
      if (cancelled) return;
      const remaining = Math.max(0, Math.ceil((runEndsAt - performance.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        cancelled = true;
        finishChallenge("timeout");
        return;
      }
      timer = window.setTimeout(update, 250);
    };
    update();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [finishChallenge, gameState, runEndsAt]);

  useEffect(() => {
    if (gameState !== "playing") return;
    const question = challenge?.questions?.[currentIndex];
    if (!question) return;
    const hasChoices = (question.choices?.length ?? 0) > 0;
    const shouldUseMcq = hasChoices && persistedMultipleChoice;
    setActiveMultipleChoice(shouldUseMcq);
    setRemainingLives(shouldUseMcq ? 1 : TEXT_MODE_LIVES);
    setAttemptCount(0);
    setAttemptFeedback(null);
    setTextAnswer("");
    setQuestionStart(performance.now());
  }, [challenge, currentIndex, gameState, persistedMultipleChoice]);

  const questions = challenge?.questions ?? [];
  const currentQuestion = questions[currentIndex] ?? null;
  const currentRecord = currentQuestion ? records[currentIndex] : null;
  const currentTheme = currentQuestion ? themeMeta(currentQuestion.theme) : null;
  const answered = Boolean(currentRecord);
  const hasChoices = (currentQuestion?.choices?.length ?? 0) > 0;
  const totalQuestions = challenge?.questions.length ?? 0;
  const livesTotal = activeMultipleChoice ? 1 : TEXT_MODE_LIVES;
  const displayLives = answered
    ? currentRecord?.correct
      ? Math.max(1, remainingLives)
      : 0
    : remainingLives;

  const correctCount = useMemo(
    () => records.reduce((acc, record) => (record?.correct ? acc + 1 : acc), 0),
    [records],
  );

  const formattedTotalDuration = totalDuration !== null ? formatDurationMs(totalDuration) : null;
  const totalTimeLabel = formatDurationMs(TOTAL_TIME_MS);

  const handleToggleMultipleChoice = () => {
    if (!hasChoices) return;
    if (attemptCount > 0 || answered) return;
    setPersistedMultipleChoice((prev) => {
      const next = !prev;
      setActiveMultipleChoice(next);
      setRemainingLives(next ? 1 : TEXT_MODE_LIVES);
      setAttemptFeedback(null);
      setTextAnswer("");
      return next;
    });
  };

  const completeQuestion = useCallback(
    (payload: { choiceId: string | null; userAnswer: string | null; correct: boolean; attempts: number; mode: "text" | "mcq" }) => {
      if (!currentQuestion) return;
      const now = performance.now();
      const responseMs = questionStart ? Math.round(now - questionStart) : -1;
      setRecords((prev) => {
        const next = [...prev];
        next[currentIndex] = {
          questionId: currentQuestion.id,
          choiceId: payload.choiceId,
          userAnswer: payload.userAnswer,
          correct: payload.correct,
          responseMs,
          attempts: payload.attempts,
          mode: payload.mode,
        };
        return next;
      });
    },
    [currentIndex, currentQuestion, questionStart],
  );

  const handleChoice = (choice: ChallengeChoice) => {
    if (!currentQuestion) return;
    if (gameState !== "playing") return;
    if (!activeMultipleChoice) return;
    if (answered) return;
    const attempts = attemptCount + 1;
    const correct = choice.isCorrect;
    setAttemptCount(attempts);
    setRemainingLives(correct ? 1 : 0);
    completeQuestion({
      choiceId: choice.id,
      userAnswer: choice.label,
      correct,
      attempts,
      mode: "mcq",
    });
  };

  const handleSubmitText = (event: FormEvent) => {
    event.preventDefault();
    if (!currentQuestion) return;
    if (gameState !== "playing") return;
    if (answered) return;
    if (!textAnswer.trim()) return;

    const raw = textAnswer.trim();
    const userNorm = normString(raw);
    const accepted = currentQuestion.acceptedNorms ?? [];
    const normalizedCorrect = normString(currentQuestion.correctLabel);
    const isCorrect = accepted.length > 0 ? isFuzzyMatch(userNorm, accepted) : userNorm === normalizedCorrect;
    const nextAttempts = attemptCount + 1;
    setAttemptCount(nextAttempts);

    if (isCorrect) {
      completeQuestion({
        choiceId: null,
        userAnswer: raw,
        correct: true,
        attempts: nextAttempts,
        mode: "text",
      });
      return;
    }

    const nextLives = Math.max(0, remainingLives - 1);
    setRemainingLives(nextLives);
    if (nextLives <= 0) {
      completeQuestion({
        choiceId: null,
        userAnswer: raw,
        correct: false,
        attempts: nextAttempts,
        mode: "text",
      });
      setAttemptFeedback(null);
    } else {
      const label = nextLives > 1 ? "vies" : "vie";
      setAttemptFeedback(`✘ Mauvaise réponse. Il te reste ${nextLives} ${label}.`);
    }
  };

  const goNext = useCallback(() => {
    if (!challenge) return;
    if (currentIndex + 1 < challenge.questions.length) {
      setCurrentIndex((index) => index + 1);
    } else {
      finishChallenge("completed");
    }
  }, [challenge, currentIndex, finishChallenge]);

  useEffect(() => {
    if (gameState !== "playing") return;
    if (!currentQuestion) return;
    if (!currentRecord) return;
    const timer = window.setTimeout(() => {
      goNext();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [currentQuestion, currentRecord, gameState, goNext]);

  const startChallenge = () => {
    if (!challenge) return;
    const total = challenge.questions.length;
    if (!total) return;
    setRecords(Array.from({ length: total }, () => null));
    setCurrentIndex(0);
    setGameState("playing");
    const now = performance.now();
    setRunStartedAt(now);
    setRunEndsAt(now + TOTAL_TIME_MS);
    setRemainingSeconds(TOTAL_TIME_MS / 1000);
    setTotalDuration(null);
    setQuestionStart(null);
    setTextAnswer("");
    setRemainingLives(TEXT_MODE_LIVES);
    setAttemptCount(0);
    setAttemptFeedback(null);
  };

  const recapItems = useMemo(() => {
    if (!challenge) return [];
    return challenge.questions.map((question, index) => {
      const record = records[index];
      return {
        index,
        questionId: question.id,
        text: question.text,
        img: question.img,
        correctLabel: question.correctLabel,
        yourAnswer: record?.userAnswer ?? null,
        correct: Boolean(record?.correct),
        responseMs: record?.responseMs ?? -1,
        points: record?.correct ? 1 : 0,
      };
    });
  }, [challenge, records]);

  const monthLabel = parsedDate ? `${MONTH_NAMES[parsedDate.monthIndex]} ${parsedDate.year}` : "";
  const dayLabel = parsedDate ? parsedDate.day : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#100727] via-[#160b3c] to-[#1f0f4e] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-4 pb-16 pt-10 lg:px-8">
        <header className="flex flex-col gap-3 text-center">
          <button
            type="button"
            onClick={() => navigate("/solo/daily")}
            className="self-center rounded-full border border-white/20 px-5 py-2 text-xs uppercase tracking-[0.3em] text-white/70 transition-colors hover:border-white"
          >
            Retour au calendrier
          </button>
          <div className="text-sm uppercase tracking-[0.35em] text-white/60">Défi quotidien</div>
          <h1 className="text-3xl font-semibold sm:text-4xl">
            {dayLabel ? `Défi du ${dayLabel} ${monthLabel}` : "Défi quotidien"}
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-white/70">
            15 questions, 3 minutes et trois tentatives par question en saisie libre. Active le mode QCM si tu préfères répondre avec un seul essai.
          </p>
        </header>

        {error ? (
          <div className="mx-auto w-full max-w-xl rounded-3xl border border-rose-400/40 bg-rose-500/20 px-6 py-5 text-center text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {loading && !challenge ? (
          <div className="flex flex-1 items-center justify-center text-sm text-white/70">
            Chargement du défi…
          </div>
        ) : null}

        {challenge && gameState === "intro" && !loading ? (
          <section className="mx-auto w-full max-w-3xl rounded-[32px] border border-white/12 bg-white/5 px-8 py-10 text-center shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="text-sm uppercase tracking-[0.35em] text-white/60">Prêt à jouer ?</div>
            <h2 className="mt-4 text-3xl font-semibold">{challenge.questionCount} questions t'attendent</h2>
            <p className="mt-3 text-sm text-white/70">
              Tu disposes de 3 minutes pour répondre correctement au maximum de questions. Tu peux utiliser jusqu'à trois tentatives par question en saisie libre ou activer le mode QCM pour n'avoir qu'un seul essai par question.
            </p>
            <button
              type="button"
              onClick={startChallenge}
              className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-10 py-3 text-sm font-semibold text-[#1f1232] transition-transform hover:scale-[1.03]"
            >
              Lancer le défi
            </button>
          </section>
        ) : null}

        {gameState === "playing" && currentQuestion ? (
          <section className="flex flex-col gap-8">
            <div className="flex flex-col gap-6">
              <TimerBar totalMs={TOTAL_TIME_MS} remainingSeconds={remainingSeconds} />
              <div className="flex flex-col items-center justify-between gap-4 text-sm text-white/70 sm:flex-row">
                <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-white/50">Progression</span>
                  <span className="text-sm font-semibold text-white">
                    Question {currentIndex + 1} / {totalQuestions}
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-4 py-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-white/50">Score</span>
                  <span className="text-sm font-semibold text-white">
                    {correctCount} / {totalQuestions}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <div className="flex flex-col gap-6">
                <article className="relative overflow-hidden rounded-[28px] border border-white/12 bg-white/5 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-white/60">
                    <span>Question {currentIndex + 1}</span>
                    {currentTheme ? (
                      <span className="flex items-center gap-2 text-[11px]">
                        <span className="opacity-70">Thème</span>
                        <span
                          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold"
                          style={{
                            backgroundColor: `${currentTheme.color}26`,
                            color: currentTheme.color,
                          }}
                        >
                          {currentTheme.label}
                        </span>
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-5 text-2xl font-semibold leading-snug text-white">
                    {currentQuestion.text}
                  </h2>
                </article>

                <div className="rounded-[28px] border border-white/12 bg-white/5 p-6 shadow-[0_20px_52px_rgba(0,0,0,0.45)] backdrop-blur">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Lives lives={displayLives} total={livesTotal} />
                      <button
                        type="button"
                        onClick={handleToggleMultipleChoice}
                        disabled={!hasChoices || attemptCount > 0 || answered}
                        className={clsx(
                          "inline-flex items-center justify-center rounded-full border px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition-colors",
                          activeMultipleChoice
                            ? "border-white bg-white text-[#1f1232]"
                            : "border-white/30 text-white/80 hover:border-white",
                          (!hasChoices || attemptCount > 0 || answered) && "cursor-not-allowed opacity-50",
                        )}
                      >
                        {activeMultipleChoice ? "Mode QCM activé" : "Activer le mode QCM"}
                      </button>
                    </div>

                    {attemptFeedback && !answered ? (
                      <div className="rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
                        {attemptFeedback}
                      </div>
                    ) : null}

                    {activeMultipleChoice ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {currentQuestion.choices.map((choice) => {
                          const isSelected = answered && currentRecord?.choiceId === choice.id;
                          const isCorrectChoice = answered && choice.isCorrect;
                          return (
                            <button
                              key={choice.id}
                              type="button"
                              onClick={() => handleChoice(choice)}
                              disabled={answered}
                              className={clsx(
                                "rounded-2xl border px-4 py-4 text-left text-sm transition-transform",
                                "bg-black/30 hover:scale-[1.01] hover:border-white/60",
                                answered && !isSelected && !isCorrectChoice && "opacity-50",
                                isCorrectChoice && "border-emerald-400/60 bg-emerald-500/20 text-emerald-100",
                                isSelected && !choice.isCorrect && "border-rose-400/60 bg-rose-500/20 text-rose-100",
                                answered && "cursor-default hover:scale-100",
                              )}
                            >
                              {choice.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <form onSubmit={handleSubmitText} className="flex flex-col gap-3 sm:flex-row">
                        <input
                          type="text"
                          value={answered ? currentRecord?.userAnswer ?? textAnswer : textAnswer}
                          onChange={(event) => setTextAnswer(event.target.value)}
                          disabled={answered}
                          placeholder="Tape ta réponse…"
                          className="flex-1 rounded-2xl border border-white/25 bg-black/30 px-5 py-4 text-sm placeholder:text-white/50 focus:border-white focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={answered || !textAnswer.trim()}
                          className="inline-flex items-center justify-center rounded-2xl border border-white bg-white px-6 py-4 text-sm font-semibold text-[#1f1232] transition-transform enabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:border-white/40 disabled:bg-white/60"
                        >
                          Envoyer
                        </button>
                      </form>
                    )}

                    {answered ? (
                      <div className="rounded-2xl border border-white/15 bg-black/40 px-4 py-4 text-sm">
                        {currentRecord?.correct ? (
                          <span className="text-emerald-300">✔ Bonne réponse !</span>
                        ) : (
                          <span className="text-rose-200">
                            ✘ Mauvaise réponse.
                            {currentQuestion.correctLabel ? (
                              <>
                                {" "}Réponse attendue :{" "}
                                <span className="font-semibold text-white">{currentQuestion.correctLabel}</span>
                              </>
                            ) : null}
                          </span>
                        )}
                        {currentRecord?.responseMs && currentRecord.responseMs > 0 ? (
                          <span className="ml-4 text-xs text-white/60">{currentRecord.responseMs} ms</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/12 bg-white/5 p-4 text-center shadow-[0_20px_52px_rgba(0,0,0,0.45)] backdrop-blur">
                {currentQuestion.img ? (
                  <figure className="flex h-full flex-col items-center justify-center gap-4">
                    <img
                      src={currentQuestion.img}
                      alt=""
                      className="max-h-[360px] w-full rounded-[22px] object-cover"
                      loading="lazy"
                    />
                  </figure>
                ) : (
                  <div className="flex h-full min-h-[280px] items-center justify-center rounded-[22px] border border-dashed border-white/20 bg-black/30 text-xs uppercase tracking-[0.3em] text-white/40">
                    Pas d'image pour cette question
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {gameState === "finished" && challenge ? (
          <section className="mb-6 flex flex-col gap-8">
            <div className="rounded-[32px] border border-white/12 bg-white/10 px-8 py-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur">
              <div className="text-sm uppercase tracking-[0.35em] text-white/60">Défi terminé</div>
              <div className="mt-4 text-4xl font-semibold">
                Score : {correctCount}/{challenge.questionCount}
              </div>
              {formattedTotalDuration ? (
                <div className="mt-2 text-sm text-white/70">
                  Temps total : {formattedTotalDuration} / {totalTimeLabel}
                </div>
              ) : null}
              <p className="mt-4 text-sm text-white/75">
                Bravo ! Tu peux relancer le défi pour améliorer ton score ou revenir au calendrier pour choisir une autre date.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={startChallenge}
                  className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3 text-sm font-semibold text-[#1f1232] transition-transform hover:scale-[1.03]"
                >
                  Rejouer ce défi
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/solo/daily")}
                  className="inline-flex items-center justify-center rounded-full border border-white/40 px-8 py-3 text-sm font-semibold text-white transition-colors hover:border-white"
                >
                  Retour au calendrier
                </button>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/12 bg-white/5 p-6 shadow-[0_20px_52px_rgba(0,0,0,0.45)] backdrop-blur">
              <QuestionRecapList items={recapItems} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
