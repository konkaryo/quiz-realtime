// web/src/pages/DailyChallengePlayPage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QuestionRecapList } from "../components/QuestionRecapList";

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
};

type GameState = "intro" | "playing" | "finished";

const TOTAL_QUESTION_COUNT = 15;
const TOTAL_TIME_MS = 3 * 60 * 1000;
const TOTAL_LIVES = 3;

function Lives({ lives, total }: { lives: number; total: number }) {
  const full = Array.from({ length: Math.max(0, Math.min(total, lives)) }).map((_, index) => (
    <span key={`full-${index}`} aria-hidden>
      ❤️
    </span>
  ));
  const empty = Array.from({ length: Math.max(0, total - lives) }).map((_, index) => (
    <span key={`empty-${index}`} aria-hidden className="opacity-30">
      ❤️
    </span>
  ));
  return (
    <div className="flex items-center gap-1 text-2xl" aria-label={`${lives} vie${lives > 1 ? "s" : ""}`}>
      {full}
      {empty}
    </div>
  );
}

type ThemeMeta = { label: string; color: string };

const THEMES: Record<string, ThemeMeta> = {
  CINEMA_SERIES: { label: "Cinéma & Séries", color: "#14B8A6" },
  ARTS_CULTURE: { label: "Arts & Culture", color: "#F59E0B" },
  JEUX_BD: { label: "Jeux & BD", color: "#EAB308" },
  GEOGRAPHIE: { label: "Géographie", color: "#22D3EE" },
  LANGUES_LITTERATURE: { label: "Langues & Littérature", color: "#D946EF" },
  ECONOMIE_POLITIQUE: { label: "Économie & Politique", color: "#3B82F6" },
  GASTRONOMIE: { label: "Gastronomie", color: "#F97316" },
  CROYANCES: { label: "Croyances", color: "#818CF8" },
  SPORT: { label: "Sport", color: "#84CC16" },
  HISTOIRE: { label: "Histoire", color: "#FAFAFA" },
  SCIENCES_NATURELLES: { label: "Sciences naturelles", color: "#22C55E" },
  SCIENCES_TECHNIQUES: { label: "Sciences & Techniques", color: "#EF4444" },
  MUSIQUE: { label: "Musique", color: "#EC4899" },
  ACTUALITES_MEDIAS: { label: "Actualités & Médias", color: "#F43F5E" },
  DIVERS: { label: "Divers", color: "#A3A3A3" },
};

function themeMeta(theme: string | null | undefined): ThemeMeta {
  if (!theme) return THEMES.DIVERS;
  return THEMES[theme.toUpperCase()] ?? THEMES.DIVERS;
}

function TimerBadge({ seconds }: { seconds: number | null }) {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  const urgent = total <= 15;
  return (
    <div
      aria-live="polite"
      className={[
        "relative inline-flex h-11 min-w-[88px] items-center justify-center rounded-full border px-4 backdrop-blur",
        urgent ? "border-rose-400/60 bg-rose-500/20" : "border-white/15 bg-black/60",
      ].join(" ")}
    >
      <span className="text-lg font-semibold tabular-nums tracking-wide">
        {String(minutes).padStart(2, "0")}:{String(secs).padStart(2, "0")}
      </span>
    </div>
  );
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

  useEffect(() => {
    if (gameState !== "playing") return;
    setQuestionStart(performance.now());
    setTextAnswer("");
  }, [currentIndex, gameState]);


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


  const monthLabel = parsedDate ? `${MONTH_NAMES[parsedDate.monthIndex]} ${parsedDate.year}` : "";
  const dayLabel = parsedDate ? parsedDate.day : null;

  const questions = challenge?.questions ?? [];
  const currentQuestion = questions[currentIndex] ?? null;
  const currentRecord = currentQuestion ? records[currentIndex] : null;
  const answered = Boolean(currentRecord);
  const correctCount = useMemo(
    () => records.reduce((acc, record) => (record?.correct ? acc + 1 : acc), 0),
    [records],
  );

  const introReady = Boolean(challenge && gameState === "intro");
  const playing = gameState === "playing" && currentQuestion;
  const finished = gameState === "finished" && challenge;

  const handleChoice = (choice: ChallengeChoice) => {
    if (!currentQuestion) return;
    if (gameState !== "playing") return;
    if (answered) return;
    const now = performance.now();
    const responseMs = questionStart ? Math.round(now - questionStart) : -1;
    const correct = choice.isCorrect;
    setRecords((prev) => {
      const next = [...prev];
      next[currentIndex] = {
        questionId: currentQuestion.id,
        choiceId: choice.id,
        userAnswer: choice.label,
        correct,
        responseMs,
      };
      return next;
    });
  };

  const handleSubmitText = () => {
    if (!currentQuestion) return;
    if (gameState !== "playing") return;
    if (answered) return;
    const raw = textAnswer.trim();
    if (!raw) return;
    const userNorm = normString(raw);
    const accepted = currentQuestion.acceptedNorms ?? [];
    const isCorrect = accepted.length > 0 ? isFuzzyMatch(userNorm, accepted) : normString(currentQuestion.correctLabel) === userNorm;
    const now = performance.now();
    const responseMs = questionStart ? Math.round(now - questionStart) : -1;
    setRecords((prev) => {
      const next = [...prev];
      next[currentIndex] = {
        questionId: currentQuestion.id,
        choiceId: null,
        userAnswer: raw,
        correct: isCorrect,
        responseMs,
      };
      return next;
    });
  };


  const goNext = () => {
    if (!challenge) return;
    if (!answered) return;
    if (currentIndex + 1 < challenge.questions.length) {
      setCurrentIndex((index) => index + 1);
    } else {
      finishChallenge("completed");
    }
  };

  const startChallenge = () => {
    if (!challenge) return;
    const total = challenge.questions.length;
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

  const totalQuestions = challenge?.questionCount ?? 0;
  const progressLabel = playing ? `${currentIndex + 1}/${totalQuestions}` : null;
  const progressRatio = playing && totalQuestions > 0 ? Math.min(1, (currentIndex + (answered ? 1 : 0)) / totalQuestions) : 0;
  const progressPercent = Math.round(progressRatio * 100);
  const questionHasChoices = currentQuestion ? currentQuestion.choices.length > 0 : false;
  const formattedTotalDuration = typeof totalDuration === "number" ? formatDurationMs(totalDuration) : null;
  const totalTimeLabel = formatDurationMs(TOTAL_TIME_MS);
  const mistakes = useMemo(
    () => records.reduce((acc, record) => (record && !record.correct ? acc + 1 : acc), 0),
    [records],
  );
  const remainingLives = Math.max(0, TOTAL_LIVES - mistakes);
  const currentTheme = currentQuestion ? themeMeta(currentQuestion.theme) : null;
  const backgroundClass =
    "fixed inset-0 z-0 bg-[radial-gradient(1200px_800px_at_20%_10%,#191736_0%,transparent_60%),radial-gradient(900px_600px_at_80%_30%,#3e0f64_0%,transparent_55%),linear-gradient(180deg,#070611_0%,#120d21_45%,#0a0815_100%)]";
  const grainClass =
    "fixed inset-0 z-0 pointer-events-none opacity-[0.28] mix-blend-soft-light bg-[radial-gradient(circle,rgba(255,255,255,0.18)_0.5px,transparent_0.5px)] bg-[length:4px_4px] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,.95),rgba(0,0,0,.6)_60%,transparent_100%)]";


  return (
    <>
      <div aria-hidden className={backgroundClass} />
      <div aria-hidden className={grainClass} />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-10 text-white">
        <header className="flex flex-col gap-2 text-center">
          <div className="mx-auto rounded-full border border-white/15 bg-white/10 px-4 py-1 text-xs uppercase tracking-[0.4em] text-white/75">
            Défi du jour
          </div>
          <h1 className="font-brand text-4xl font-semibold tracking-wide md:text-5xl">
            {dayLabel ? `Défi du ${dayLabel} ${monthLabel}` : "Défi introuvable"}
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-white/75">
            Tu disposes de 3 minutes pour répondre aux 15 questions du jour et signer le meilleur score possible. Tu peux revenir au calendrier à tout moment.
          </p>
        </header>

        <div className="mt-6 text-center text-sm text-white/75">
          {loading && <span>Chargement du défi…</span>}
          {!loading && error && <span className="text-rose-200">{error}</span>}
          {!loading && !error && !challenge && <span>Aucun défi disponible pour cette date.</span>}
        </div>

        {introReady && challenge ? (
          <section className="mx-auto mt-12 w-full max-w-2xl rounded-[26px] border border-white/12 bg-white/5 p-8 text-center shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="text-sm uppercase tracking-[0.35em] text-white/60">Défi sélectionné</div>
            <div className="mt-3 text-3xl font-semibold">15 questions en 3 minutes</div>
            <p className="mt-4 text-white/75">
              Reste concentré : une seule session pour réaliser le meilleur score. Retrouve la correction complète et ton chrono final à la fin du défi.
            </p>
            <div className="mt-6 flex flex-col items-center gap-4 text-sm text-white/70">
              <TimerBadge seconds={TOTAL_TIME_MS / 1000} />
              <Lives lives={TOTAL_LIVES} total={TOTAL_LIVES} />
            </div>
            <button
              type="button"
              onClick={startChallenge}
              className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-8 py-3 text-sm font-semibold text-[#1f1232] transition-transform hover:scale-[1.03]"
            >
              Commencer le défi
            </button>
            <div className="mt-6 text-xs text-white/60">
              Besoin de changer de date ?
              <button
                type="button"
                onClick={() => navigate("/solo/daily")}
                className="ml-2 inline-flex items-center rounded-full border border-white/30 px-3 py-1 text-white transition-colors hover:border-white"
              >
                Retour au calendrier
              </button>
            </div>
          </section>
        ) : null}
        {playing && currentQuestion ? (
          <section className="mt-10 rounded-[32px] border border-white/12 bg-black/45 p-6 shadow-[0_20px_52px_rgba(0,0,0,0.55)] backdrop-blur-lg">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-white/60">
                {currentTheme ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: currentTheme.color }}
                      aria-hidden
                    />
                    <span>{currentTheme.label}</span>
                  </span>
                ) : null}
                {progressLabel ? (
                  <span className="tabular-nums text-white/70">Question {progressLabel}</span>
                ) : null}
                <span className="tabular-nums text-white/60">Score {correctCount}/{totalQuestions}</span>
              </div>
              <TimerBadge seconds={remainingSeconds} />
            </div>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#FF7DEB] via-[#A774FF] to-[#6C63FF] transition-[transform] duration-300"
                style={{ transform: `scaleX(${progressRatio || 0})`, transformOrigin: "left" }}
                aria-hidden
              />
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div className="space-y-5 rounded-[26px] border border-white/12 bg-black/60 px-6 py-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                {currentQuestion.slotLabel ? (
                  <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">{currentQuestion.slotLabel}</div>
                ) : null}
                <h2 className="text-2xl font-semibold leading-snug">{currentQuestion.text}</h2>

                <div className="flex flex-col gap-3 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
                  <Lives lives={remainingLives} total={TOTAL_LIVES} />
                  <div className="text-xs uppercase tracking-[0.3em] text-white/60">Réussites {correctCount}/{totalQuestions}</div>
                </div>

                {questionHasChoices ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {currentQuestion.choices.map((choice) => {
                      const record = currentRecord;
                      const isSelected = record?.choiceId === choice.id;
                      const reveal = Boolean(record);
                      const isCorrectChoice = choice.isCorrect;
                      const baseClasses =
                        "rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-all duration-200 ease-out backdrop-blur focus:outline-none";
                      let stateClasses = "border-white/25 bg-white/5 hover:border-white/60 hover:bg-white/10";
                      if (reveal) {
                        if (isCorrectChoice) {
                          stateClasses = "border-emerald-400/70 bg-emerald-500/20 text-emerald-200";
                        } else if (isSelected) {
                          stateClasses = "border-rose-400/70 bg-rose-500/20 text-rose-200";
                        } else {
                          stateClasses = "border-white/10 bg-transparent text-white/55";
                        }
                      }
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          disabled={reveal}
                          onClick={() => handleChoice(choice)}
                          className={`${baseClasses} ${stateClasses}`}
                        >
                          {choice.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <form
                    className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleSubmitText();
                    }}
                  >
                    <input
                      type="text"
                      value={answered ? currentRecord?.userAnswer ?? '' : textAnswer}
                      onChange={(event) => setTextAnswer(event.target.value)}
                      disabled={answered}
                      placeholder="Tape ta réponse…"
                      className="rounded-[16px] border border-white/25 bg-white/10 px-5 py-3 text-sm placeholder:text-white/50 focus:border-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={answered || !textAnswer.trim()}
                      className="inline-flex items-center justify-center rounded-[16px] border border-white bg-white px-6 py-3 text-sm font-semibold text-[#1f1232] transition-transform enabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:border-white/40 disabled:bg-white/60"
                    >
                      Envoyer
                    </button>
                  </form>
                )}
                {answered ? (
                  <div className="rounded-[18px] border border-white/12 bg-black/40 px-4 py-3 text-sm">
                    {currentRecord?.correct ? (
                      <span className="text-emerald-300">✔ Bonne réponse !</span>
                    ) : (
                      <span className="text-rose-200">
                        ✘ Mauvaise réponse.
                        {currentQuestion.correctLabel ? (
                          <> Réponse attendue : <span className="font-semibold text-white">{currentQuestion.correctLabel}</span></>
                        ) : null}
                      </span>
                    )}
                    {currentRecord?.responseMs && currentRecord.responseMs > 0 ? (
                      <span className="ml-4 text-xs text-white/60">{currentRecord.responseMs} ms</span>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => navigate("/solo/daily")}
                    className="inline-flex items-center justify-center rounded-full border border-white/40 px-5 py-2 text-xs uppercase tracking-[0.3em] text-white transition-colors hover:border-white"
                  >
                    Retour au calendrier
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!answered}
                    className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2 text-sm font-semibold text-[#1f1232] transition-transform enabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:bg-white/60"
                  >
                    {currentIndex + 1 < totalQuestions ? 'Question suivante' : 'Terminer le défi'}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-center">
                {currentQuestion.img ? (
                  <figure className="inline-flex max-w-full flex-col items-center gap-4 rounded-[24px] border border-white/12 bg-black/60 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                    <img
                      src={currentQuestion.img}
                      alt=""
                      className="max-h-[260px] w-full rounded-[18px] object-cover"
                      loading="lazy"
                    />
                  </figure>
                ) : (
                  <div className="flex min-h-[220px] w-full items-center justify-center rounded-[24px] border border-dashed border-white/15 bg-white/5 text-xs uppercase tracking-[0.3em] text-white/30">
                    Pas d'image
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}
        {finished && challenge ? (
          <section className="mt-12 space-y-6">
            <div className="rounded-[26px] border border-white/12 bg-black/50 p-8 text-center shadow-[0_20px_52px_rgba(0,0,0,0.5)] backdrop-blur">
              <div className="text-sm uppercase tracking-[0.35em] text-white/60">Défi complété</div>
              <div className="mt-3 text-3xl font-semibold">
                Score : {correctCount}/{challenge.questionCount}
              </div>
              {formattedTotalDuration ? (
                <div className="mt-1 text-sm text-white/70">Temps total : {formattedTotalDuration} / {totalTimeLabel}</div>
              ) : null}
              <p className="mt-4 text-white/75">
                Bravo ! Tu peux rejouer pour améliorer ton score ou revenir au calendrier pour sélectionner un autre défi.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={startChallenge}
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2 text-sm font-semibold text-[#1f1232] transition-transform hover:scale-[1.02]"
                >
                  Rejouer ce défi
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/solo/daily")}
                  className="inline-flex items-center justify-center rounded-full border border-white/40 px-6 py-2 text-sm font-semibold text-white transition-colors hover:border-white"
                >
                  Retour au calendrier
                </button>
              </div>
            </div>
            <div className="rounded-[24px] border border-white/12 bg-black/45 p-6 text-left shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur">
              <QuestionRecapList items={recapItems} />
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}