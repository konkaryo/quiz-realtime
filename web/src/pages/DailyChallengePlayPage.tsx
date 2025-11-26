// web/src/pages/DailyChallengePlayPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getThemeMeta } from "../lib/themeMeta";
import tabKey from "@/assets/tab-key.svg";
import enterKey from "@/assets/enter-key.svg";

const API_BASE = import.meta.env.VITE_API_BASE as string;
const QUESTION_DURATION_MS = 20000;
const TEXT_LIVES = Number(import.meta.env.VITE_TEXT_LIVES ?? 3);
const STORAGE_KEY = "dailyChallenge:results:v1";

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

type Choice = { id: string; label: string; isCorrect: boolean };
type Question = {
  id: string;
  text: string;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  choices: Choice[];
  acceptedNorms: string[];
  correctLabel: string;
  slotLabel: string | null;
  position: number;
};

type Challenge = {
  date: string;
  questionCount: number;
  questions: Question[];
};

type Result = {
  questionId: string;
  correct: boolean;
  answer: string | null;
  mode: "text" | "choice" | "timeout";
  responseMs: number;
  correctLabel: string;
};

type CompletedInfo = { score: number; completedAt: string };

type ChallengeResponse = { challenge: Challenge };

function normalizeAnswer(s: string): string {
  let t = (s ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "");

  t = t.replace(/['’`´]/g, "'");
  t = t.replace(/[^a-z0-9]+/g, " ").trim();

  if (!t) return "";

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

  const tokens = t.split(/\s+/).filter((tok) => tok && !STOP.has(tok));
  return tokens.join(" ");
}

function formatDateLabel(iso: string): string {
  const parts = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return iso;
  const year = Number(parts[1]);
  const monthIndex = Number(parts[2]) - 1;
  const day = Number(parts[3]);
  const monthName = MONTH_NAMES[monthIndex] ?? parts[2];
  return `${day} ${monthName} ${year}`;
}

function readStorage(): Record<string, CompletedInfo> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object")
      return parsed as Record<string, CompletedInfo>;
    return {};
  } catch {
    return {};
  }
}

function writeStorage(date: string, info: CompletedInfo) {
  try {
    const data = readStorage();
    const prev = data[date];
    if (!prev || info.score > prev.score) {
      data[date] = info;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch {
    // ignore
  }
}

// UI subcomponents -----------------------------------------------------------

function Lives({ lives, total }: { lives: number; total: number }) {
  const full = Array.from({ length: lives }).map((_, i) => (
    <span key={`f${i}`} className="text-[18px] leading-none">
      ❤️
    </span>
  ));
  const empty = Array.from({ length: Math.max(0, total - lives) }).map(
    (_, i) => (
      <span key={`e${i}`} className="text-[18px] leading-none opacity-25">
        ❤️
      </span>
    ),
  );
  return (
    <div className="inline-flex items-center gap-1 px-5 py-2">
      {full}
      {empty}
    </div>
  );
}

function TimerBadge({ seconds }: { seconds: number | null }) {
  const total = Math.max(0, seconds ?? 0);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(
    2,
    "0",
  )}`;
  const urgent = total <= 5;

  return (
    <div
      aria-live="polite"
      className={[
        "inline-flex items-center gap-2 text-[18px] font-semibold tabular-nums tracking-[0.3em]",
        urgent
          ? "text-rose-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.9)] animate-pulse"
          : "text-slate-100",
      ].join(" ")}
    >
      <span className="text-[18px]">⏱</span>
      <span>{display}</span>
    </div>
  );
}

// Main component -------------------------------------------------------------

export default function DailyChallengePlayPage() {
  const navigate = useNavigate();
  const params = useParams<{ date?: string }>();
  const dateParam = params.date ?? "";
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam);

  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    validDate ? "loading" : "error",
  );
  const [error, setError] = useState<string | null>(
    validDate ? null : "Défi introuvable",
  );
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "playing" | "reveal" | "finished">(
    "idle",
  );
  const [lives, setLives] = useState(TEXT_LIVES);
  const [showChoices, setShowChoices] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [correctChoiceId, setCorrectChoiceId] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [questionStart, setQuestionStart] = useState<number | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [points, setPoints] = useState(0); // score total

  const phaseRef = useRef<"idle" | "playing" | "reveal" | "finished">("idle");
  const revealTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    return () => {
      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!validDate) return;
    let cancelled = false;

    async function loadChallenge() {
      setStatus("loading");
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/daily/challenges/${dateParam}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as ChallengeResponse;
        if (cancelled) return;
        setChallenge(data.challenge);
        setIndex(0);
        setResults([]);
        setPhase("idle");
        setLives(TEXT_LIVES);
        setShowChoices(false);
        setSelectedChoice(null);
        setCorrectChoiceId(null);
        setTextAnswer("");
        setFeedback(null);
        setRemainingSeconds(null);
        setPoints(0); // reset score au début du défi
        setStatus("ready");
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Impossible de charger le défi");
        setStatus("error");
      }
    }

    loadChallenge();
    return () => {
      cancelled = true;
    };
  }, [validDate, dateParam]);

  const questions = challenge?.questions ?? [];
  const question = questions[index];
  const totalQuestions = questions.length;
  const themeMeta = getThemeMeta(question?.theme ?? null);

  const timerProgress = useMemo(() => {
    if (remainingSeconds === null) return 1;
    return Math.max(
      0,
      Math.min(1, remainingSeconds / (QUESTION_DURATION_MS / 1000)),
    );
  }, [remainingSeconds]);

  const startQuestion = (nextIndex: number) => {
    if (!challenge) return;
    const nextQuestion = challenge.questions[nextIndex];
    if (!nextQuestion) {
      setPhase("finished");
      phaseRef.current = "finished";
      setRemainingSeconds(null);
      return;
    }
    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
    setIndex(nextIndex);
    setPhase("playing");
    phaseRef.current = "playing";
    setLives(TEXT_LIVES);
    setShowChoices(false);
    setSelectedChoice(null);
    setCorrectChoiceId(null);
    setTextAnswer("");
    setFeedback(null);
    const now = Date.now();
    setQuestionStart(now);
    setRemainingSeconds(Math.ceil(QUESTION_DURATION_MS / 1000));
    window.setTimeout(() => inputRef.current?.focus(), 60);
  };

  useEffect(() => {
    if (!challenge || status !== "ready") return;
    startQuestion(0);
  }, [challenge, status]);

  useEffect(() => {
    if (phaseRef.current !== "playing" || questionStart === null) return;
    const end = questionStart + QUESTION_DURATION_MS;
    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, end - now);
      const sec = Math.ceil(remaining / 1000);
      setRemainingSeconds(sec);
      if (remaining <= 0) {
        finishQuestion(false, { mode: "timeout", answer: null });
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [phase, questionStart, index]);

  const finishQuestion = (
    correct: boolean,
    options: { mode: "text" | "choice" | "timeout"; answer: string | null },
  ) => {
    if (phaseRef.current !== "playing" || !question || !challenge) return;
    const correctChoice = question.choices.find((choice) => choice.isCorrect);
    const responseMs = questionStart ? Date.now() - questionStart : 0;

    // calcul du score avant de figer le timer
    let gained = 0;
    if (correct) {
      const base =
        options.mode === "text"
          ? 100
          : options.mode === "choice"
          ? 60
          : 0;
      const secsLeft = Math.max(0, remainingSeconds ?? 0);
      const bonus = Math.floor(secsLeft / 2) * 5;
      gained = base + bonus;
    }
    if (gained > 0) {
      setPoints((prev) => prev + gained);
    }

    phaseRef.current = "reveal";
    setPhase("reveal");
    setQuestionStart(null);
    setRemainingSeconds(0);
    setCorrectChoiceId(correctChoice?.id ?? null);
    setShowChoices(true);
    setFeedback(
      correct
        ? "Bravo !"
        : options.mode === "timeout"
        ? "Temps écoulé !"
        : "Mauvaise réponse !",
    );
    setResults((prev) => [
      ...prev,
      {
        questionId: question.id,
        correct,
        answer: options.answer,
        mode: options.mode,
        responseMs,
        correctLabel: question.correctLabel,
      },
    ]);

    const nextIndex = index + 1;
    revealTimeoutRef.current = window.setTimeout(() => {
      if (!challenge.questions[nextIndex]) {
        setPhase("finished");
        phaseRef.current = "finished";
        setRemainingSeconds(null);
      } else {
        startQuestion(nextIndex);
      }
    }, 1600);
  };

  const submitText = () => {
    if (phaseRef.current !== "playing" || !question) return;
    const value = textAnswer.trim();
    if (!value) return;
    const normalized = normalizeAnswer(value);
    const accepted = new Set([
      normalizeAnswer(question.correctLabel),
      ...question.acceptedNorms,
    ]);
    if (normalized && accepted.has(normalized)) {
      finishQuestion(true, { mode: "text", answer: value });
    } else {
      const nextLives = Math.max(0, lives - 1);
      setLives(nextLives);
      setFeedback("Mauvaise réponse, essayez encore !");
      setTextAnswer("");
      if (nextLives <= 0) {
        finishQuestion(false, { mode: "text", answer: value });
      } else {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
  };

  const onSelectChoice = (choice: Choice) => {
    if (phaseRef.current !== "playing" || selectedChoice) return;
    setSelectedChoice(choice.id);
    finishQuestion(choice.isCorrect, { mode: "choice", answer: choice.label });
  };

  useEffect(() => {
    if (!challenge || phase !== "finished") return;
    writeStorage(challenge.date, {
      score: points,
      completedAt: new Date().toISOString(),
    });
  }, [phase, challenge, points]);

  const correctCount = useMemo(
    () => results.filter((r) => r.correct).length,
    [results],
  );

  const dateLabel = challenge
    ? formatDateLabel(challenge.date)
    : formatDateLabel(dateParam);

  const lastResult = results.length > 0 ? results[results.length - 1] : null;

  // RENDER -------------------------------------------------------------------

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#050816] via-[#050014] to-[#1b0308] text-slate-50">
      {/* halo rouge principal */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_top,rgba(248,113,113,0.15),transparent_60%),radial-gradient(circle_at_top,rgba(15,23,42,0.95),#020617)]"
      />

      {/* particules légères */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        {[...Array(18)].map((_, i) => (
          <div
            key={i}
            className="absolute h-[3px] w-[3px] rounded-full bg-rose-200/40"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: 0.55,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-16 pt-8 sm:px-8 lg:px-10">
        {/* top bar type landing samouraï */}
        <header className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-600 to-rose-400 shadow-[0_0_12px_rgba(248,113,113,0.7)]">
              <span className="text-lg font-black tracking-tight">刀</span>
            </div>
            <div className="leading-tight">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">
                Défi du jour
              </div>
              <div className="text-sm font-semibold text-slate-100">
                {dateLabel}
              </div>
            </div>
          </div>

          {/* score au centre */}
          <div className="flex flex-col items-center justify-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-200">
            <span className="text-[10px] text-slate-400">Score</span>
            <span className="mt-1 text-sm tabular-nums text-rose-300">
              {points} pts
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/solo/daily")}
              className="inline-flex items-center gap-2 rounded-[12px] border border-slate-800/80 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),rgba(15,23,42,0.99)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.9),#020617)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-100 transition hover:border-rose-400 hover:text-white"
            >
              <span className="text-xs">←</span>
              <span>Retour</span>
            </button>
          </div>
        </header>

        {status === "loading" && (
          <p className="mt-6 text-sm text-slate-200/80">Chargement du défi…</p>
        )}
        {status === "error" && (
          <p className="mt-6 max-w-xl text-sm text-slate-200/80">
            {error ?? "Ce défi n'est pas disponible."}
          </p>
        )}

        {status === "ready" && challenge && question && (
          <div className="mx-auto w-full max-w-6xl">
            {/* panneau principal style hero samouraï */}
            <div className="relative">
              <div className="pointer-events-none absolute -inset-[2px] rounded-[46px] opacity-70 blur-xl" />
              <div
                className={[
                  "relative w-full rounded-[40px] border border-slate-800/80",
                  "bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),rgba(15,23,42,0.99)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.9),#020617)]",
                  "shadow-[0_0_5px_rgba(248,248,248,0.8)]",
                  "sm:p-8 lg:p-8",
                ].join(" ")}
              >
                {/* bandeau supérieur : timer / info / vies */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="order-2 gap-4 font-medium text-slate-100 md:order-1">
                    Question {index + 1}
                    <span className="text-slate-500"> / {totalQuestions}</span>
                  </div>

                  <div className="order-1 flex justify-center md:order-2">
                    {phase === "reveal" && remainingSeconds === 0 ? (
                      <div className="text-[13px] font-semibold uppercase tracking-[0.3em] text-slate-300/80">
                        En attente...
                      </div>
                    ) : (
                      <TimerBadge seconds={remainingSeconds} />
                    )}
                  </div>

                  <div className="order-3 flex justify-end md:order-3">
                    <Lives lives={lives} total={TEXT_LIVES} />
                  </div>
                </div>

                {/* barre de progression rouge */}
                <div className="mt-5 h-[3px] w-full rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-white transition-all"
                    style={{ width: `${timerProgress * 100}%` }}
                  />
                </div>

                {/* question + image */}
                <div className="mt-8 flex flex-col gap-6 md:min-h-[14rem] md:flex-row md:items-stretch">
                  <div className={question.img ? "md:w-3/5" : "md:w-full"}>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <div className="inline-flex items-center gap-2 rounded-[12px] border border-slate-700/80 bg-black/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100">
                        <span
                          aria-hidden
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: themeMeta.color }}
                        />
                        {themeMeta.label}
                      </div>
                      {question.slotLabel && (
                        <span className="rounded-full bg-slate-900/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200">
                          {question.slotLabel}
                        </span>
                      )}
                    </div>

                    <p className="mt-5 text-[20px] font-semibold leading-snug text-slate-50 sm:text-[20px]">
                      {question.text}
                    </p>
                  </div>

                  {question.img && (
                    <div className="md:w-2/5">
                      <div className="relative h-full">
                        <div className="absolute inset-0 rounded-[26px] bg-gradient-to-br from-white/20 to-transparent opacity-40 mix-blend-screen" />
                        <img
                          src={question.img}
                          alt=""
                          className="relative max-h-56 w-full rounded-[26px] object-cover shadow-[0_20px_50px_rgba(0,0,0,0.95)]"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* zone saisie & boutons */}
                <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-end">
                  <div className="flex-1">
                    <div className="mt-2 rounded-[12px] border border-slate-700/80 bg-black/70 px-3 py-1 shadow-inner shadow-black/80">
                      <input
                        ref={inputRef}
                        value={textAnswer}
                        onChange={(e) => setTextAnswer(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            submitText();
                          }
                        }}
                        disabled={phaseRef.current !== "playing"}
                        className="w-full border-none bg-transparent px-2 py-2 text-[15px] font-medium tracking-[0.02em] text-slate-50 caret-[#cccccc] placeholder:text-slate-500/70 antialiased focus:outline-none focus:ring-0"
                        placeholder="Tapez votre réponse ici..."
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 md:ml-3">
                    {/* Bouton principal : Valider */}
                    <button
                      type="button"
                      onClick={submitText}
                      disabled={phaseRef.current !== "playing"}
                      className={[
                        "inline-flex items-center justify-center rounded-[12px] px-5 py-2.5",
                        "text-[11px] font-semibold uppercase tracking-[0.18em]",
                        "bg-[#2563ff] text-slate-50",
                        "shadow-[0_0_0px_rgba(37,99,235,0.45)]",
                        "transition hover:bg-[#1d4ed8]",
                        "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
                      ].join(" ")}
                    >
                      <img
                        src={enterKey}
                        alt=""
                        className="mr-2 h-7 w-7 opacity-90"
                      />
                      <span>Valider</span>
                    </button>

                    {/* Bouton secondaire : Propositions */}
                    <button
                      type="button"
                      onClick={() => setShowChoices(true)}
                      disabled={showChoices}
                      className={[
                        "inline-flex items-center justify-center rounded-[12px] px-4 py-2.5",
                        "text-[11px] font-semibold uppercase tracking-[0.18em]",
                        "border border-slate-700/80 bg-black/70",
                        "shadow-sm",
                        "transition hover:bg-[#020617] hover:text-[#bfdbfe]",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                      ].join(" ")}
                    >
                      <img
                        src={tabKey}
                        alt=""
                        className="mr-2 h-7 w-7 opacity-90"
                      />
                      <span>Propositions</span>
                    </button>
                  </div>
                </div>

{/* feedback + temps de réponse */}
{feedback && (
  <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-stretch md:gap-4">
    {/* cellule feedback */}
    <div className="inline-flex min-h-[42px] items-center gap-3 rounded-[12px] border border-slate-700/80 bg-black/80 px-6 py-2.5 text-sm text-slate-100 shadow-inner shadow-black/80">
      <span
        className={[
          "text-base",
          feedback === "Temps écoulé !"
            ? "text-amber-300"
            : feedback.includes("Bravo")
            ? "text-emerald-400"
            : "text-rose-400",
        ].join(" ")}
      >
        {feedback === "Temps écoulé !"
          ? "⏳"
          : feedback.includes("Bravo")
          ? "✅"
          : "❌"}
      </span>
      <div>
        <span className="font-medium">{feedback}</span>
      </div>
    </div>

    {/* cellule temps de réponse (uniquement si bonne réponse) */}
    {lastResult?.correct && (
      <div className="inline-flex min-h-[42px] items-center rounded-[12px] border border-slate-700/80 bg-black/80 px-5 py-2.5 text-xs text-slate-100 shadow-inner shadow-black/80">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Temps de réponse
          </span>
          <span className="mt-1 font-mono text-sm text-slate-50">
            {lastResult.responseMs.toLocaleString("fr-FR")} ms
          </span>
        </div>
      </div>
    )}
  </div>
)}

                {/* choix multiples */}
                {showChoices && (
                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    {question.choices.map((choice) => {
                      const isSelected = selectedChoice === choice.id;
                      const isCorrect = correctChoiceId === choice.id;

                      return (
                        <button
                          key={choice.id}
                          type="button"
                          onClick={() => onSelectChoice(choice)}
                          disabled={
                            phaseRef.current !== "playing" && !isSelected
                          }
                          className={[
                            "group relative overflow-hidden rounded-[12px] border px-4 py-3 text-left text-[15px] font-medium transition",
                            "backdrop-blur-xl",
                            // bon choix : fond vert plein
                            isCorrect
                              ? "border-emerald-600 bg-emerald-600 text-slate-50 shadow-[0_0_0px_rgba(52,211,153,0.75)]"
                              : // mauvais choix sélectionné : fond rouge plein
                              isSelected
                              ? "border-rose-700 bg-rose-700 text-slate-50 shadow-[0_0_0px_rgba(248,113,113,0.8)]"
                              : // état neutre
                                "border-slate-700/90 bg-black/75 text-slate-50 hover:border-white hover:bg-slate-900",
                            phaseRef.current !== "playing" ? "cursor-default" : "",
                          ].join(" ")}
                        >
                          {choice.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* bloc résultats façon stats bas de page */}
        {phase === "finished" && challenge && (
          <section className="mt-12 rounded-[34px] border border-slate-800/80 bg-black/80 p-6 shadow-[0_32px_90px_rgba(0,0,0,0.95)] backdrop-blur-2xl sm:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
                  Résultats du défi
                </h2>
                <p className="mt-2 text-sm text-slate-300/90">
                  Score :{" "}
                  <span className="font-semibold text-rose-400">
                    {points} pts
                  </span>{" "}
                  ·{" "}
                  <span className="font-semibold text-slate-100">
                    {correctCount}/{challenge.questions.length} bonnes réponses
                  </span>
                </p>
              </div>
              <div className="flex gap-8 text-right text-xs uppercase tracking-[0.3em] text-slate-300/80">
                <div>
                  <div className="text-3xl font-black text-rose-400">
                    {points}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    Points
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-black text-slate-50">
                    {correctCount}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    Réponses justes
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {challenge.questions.map((q, i) => {
                const result = results[i];
                const ok = result?.correct;
                return (
                  <div
                    key={q.id}
                    className={[
                      "rounded-2xl border px-4 py-3 text-sm backdrop-blur-xl",
                      ok
                        ? "border-emerald-400/70 bg-emerald-500/10"
                        : "border-rose-400/80 bg-rose-500/10",
                    ].join(" ")}
                  >
                    <div className="font-semibold text-slate-50">
                      Question {i + 1}
                    </div>
                    <div className="mt-1 text-slate-100">{q.text}</div>
                    <div className="mt-2 text-[12px] text-slate-300">
                      {ok
                        ? "Bonne réponse"
                        : `Réponse attendue : ${
                            result?.correctLabel || q.correctLabel
                          }`}
                      {result?.answer && (
                        <span className="mt-1 block text-slate-400">
                          Votre réponse : {result.answer}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
