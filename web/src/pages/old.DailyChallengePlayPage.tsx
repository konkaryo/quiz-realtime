// web/src/pages/DailyChallengePlayPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getThemeMeta } from "../lib/themeMeta";
import tabKey from "@/assets/tab-key.svg";
import enterKey from "@/assets/enter-key.svg";
import { io, Socket } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");
const QUESTION_DURATION_MS = Number(import.meta.env.VITE_DAILY_ROUND_MS ?? 20000);
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

type Choice = { id: string; label: string };
type QuestionLite = {
  id: string;
  text: string;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  slotLabel: string | null;
};

type Result = {
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
};

type CompletedInfo = { score: number; completedAt: string };

type DailyRoundBegin = {
  index: number;
  total: number;
  endsAt: number;
  serverNow?: number;
  question: QuestionLite;
  score: number;
};

type DailyAnswerFeedback = {
  correct: boolean;
  correctChoiceId?: string | null;
  correctLabel?: string | null;
  responseMs?: number;
  livesLeft?: number;
  score?: number;
};

type DailyRoundEnd = {
  index: number;
  correctChoiceId: string | null;
  correctLabel: string | null;
  score: number;
};

type DailyFinished = { score: number; results: Result[] };

type ChallengeMeta = { date: string; questionCount: number } | null;

type SocketStatus = "idle" | "connecting" | "connected";

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
    if (parsed && typeof parsed === "object") return parsed as Record<string, CompletedInfo>;
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
  const empty = Array.from({ length: Math.max(0, total - lives) }).map((_, i) => (
    <span key={`e${i}`} className="text-[18px] leading-none opacity-25">
      ❤️
    </span>
  ));
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
  const display = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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
  const [error, setError] = useState<string | null>(validDate ? null : "Défi introuvable");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("idle");
  const [challengeMeta, setChallengeMeta] = useState<ChallengeMeta>(null);
  const [index, setIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [phase, setPhase] = useState<"idle" | "playing" | "reveal" | "finished">("idle");
  const [lives, setLives] = useState(TEXT_LIVES);
  const [showChoices, setShowChoices] = useState(false);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [correctChoiceId, setCorrectChoiceId] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionLite | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [points, setPoints] = useState(0);
  const [skew, setSkew] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());

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
    if (!endsAt) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [endsAt]);

  useEffect(() => {
    if (remainingSeconds === null && endsAt) {
      const serverNow = Date.now() + skew;
      setRemainingSeconds(Math.max(0, Math.ceil((endsAt - serverNow) / 1000)));
    }
  }, [endsAt, skew, remainingSeconds]);

  useEffect(() => {
    if (!endsAt) return;
    const serverNow = Date.now() + skew;
    setRemainingSeconds(Math.max(0, Math.ceil((endsAt - serverNow) / 1000)));
  }, [nowTick, endsAt, skew]);


  useEffect(() => {
    if (!validDate) return;
    let cancelled = false;

    const s = io(SOCKET_URL, {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    setSocket(s);
    setSocketStatus("connecting");
    setError(null);

    s.on("connect", () => setSocketStatus("connected"));

    s.on("daily_round_begin", (p: DailyRoundBegin) => {
      if (typeof p.serverNow === "number") setSkew(p.serverNow - Date.now());
      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
      setPhase("playing");
      phaseRef.current = "playing";
      setIndex(p.index);
      setTotalQuestions(p.total);
      setChallengeMeta({ date: dateParam, questionCount: p.total });
      setQuestion(p.question);
      setLives(TEXT_LIVES);
      setShowChoices(false);
      setChoices(null);
      setSelectedChoice(null);
      setCorrectChoiceId(null);
      setTextAnswer("");
      setEndsAt(p.endsAt);
      setPoints(p.score);
      setRemainingSeconds(Math.max(0, Math.ceil((p.endsAt - (p.serverNow ?? Date.now())) / 1000)));
      window.setTimeout(() => inputRef.current?.focus(), 60);
    });

    s.on("daily_multiple_choice", (p: { choices: Choice[] }) => {
      setShowChoices(true);
      setChoices(p.choices);
      setTextAnswer("");
    });

    s.on("daily_answer_feedback", (p: DailyAnswerFeedback) => {
      if (typeof p.score === "number") setPoints(p.score);
      if (p.correctChoiceId) setCorrectChoiceId(p.correctChoiceId);
      if (typeof p.livesLeft === "number") setLives(p.livesLeft);
      if (!p.correct && typeof p.livesLeft === "number" && p.livesLeft > 0) {
        setFeedback("Mauvaise réponse, essayez encore !");
        setTextAnswer("");
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      if (p.correct) setFeedback("Bravo !");
      if (p.correct === false && (p.livesLeft ?? 0) <= 0) setFeedback("Mauvaise réponse !");
    });

    s.on("daily_round_end", (p: DailyRoundEnd) => {
      setPhase("reveal");
      phaseRef.current = "reveal";
      setCorrectChoiceId(p.correctChoiceId);
      setFeedback((prev) => prev ?? "Temps écoulé !");
      setEndsAt(null);
      setRemainingSeconds(0);
      setPoints(p.score);
      setShowChoices(true);
      revealTimeoutRef.current = window.setTimeout(() => {
        setFeedback(null);
      }, 1500);
    });

    s.on("daily_finished", (p: DailyFinished) => {
      setPhase("finished");
      phaseRef.current = "finished";
      setQuestion(null);
      setChoices(null);
      setSelectedChoice(null);
      setCorrectChoiceId(null);
      setFeedback(null);
      setEndsAt(null);
      setRemainingSeconds(null);
      setPoints(p.score);
      setResults(p.results);
    });

    s.on("disconnect", () => {
      if (!cancelled) {
        setStatus("error");
        setError("Connexion perdue");
        setSocketStatus("idle");
      }
    });

    // NEW SERVER CALL
    s.emit("join_daily", { date: dateParam }, (res: { ok: boolean; reason?: string }) => {
      if (cancelled) return;
      if (!res?.ok) {
        setStatus("error");
        setError(res?.reason === "not-found" ? "Défi introuvable" : "Impossible de rejoindre le défi");
        s.close();
      } else {
        setStatus("ready");
        setPhase("idle");
        phaseRef.current = "idle";
      }
    });

    return () => {
      cancelled = true;
      s.close();
    };
  }, [dateParam, validDate]);

  useEffect(() => {
    if (phase === "playing") inputRef.current?.focus();
  }, [phase, question]);

    const timerProgress = useMemo(() => {
    if (remainingSeconds === null) return 1;
    return Math.max(0, Math.min(1, remainingSeconds / (QUESTION_DURATION_MS / 1000)));
  }, [remainingSeconds]);


  const submitText = () => {
    if (phaseRef.current !== "playing" || !question || !socket) return;
    const value = textAnswer.trim();
    if (!value) return;
    socket.emit("daily_submit_answer_text", { text: value });
  };

  const onSelectChoice = (choice: Choice) => {
    if (!socket || phaseRef.current !== "playing" || selectedChoice) return;
    setSelectedChoice(choice.id);
    socket.emit("daily_submit_answer", { choiceId: choice.id });
  };

  const showMultipleChoice = () => {
    if (!socket || phaseRef.current !== "playing" || lives <= 0 || !!feedback?.includes("Bravo")) return;
    socket.emit("daily_request_choices");
  };

  useEffect(() => {
    if (phase === "finished" && challengeMeta) {
      writeStorage(challengeMeta.date, {
        score: points,
        completedAt: new Date().toISOString(),
      });
    }
  }, [phase, challengeMeta, points]);

  const correctCount = useMemo(() => results.filter((r) => r.correct).length, [results]);

  const dateLabel = challengeMeta
    ? formatDateLabel(challengeMeta.date)
    : formatDateLabel(dateParam);

  const lastResult = results.length > 0 ? results[results.length - 1] : null;

  const themeMeta = getThemeMeta(question?.theme ?? null);

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
              <div className="text-sm font-semibold text-slate-100">{dateLabel}</div>
            </div>
          </div>

          {/* score au centre */}
          <div className="flex flex-col items-center justify-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-200">
            <span className="text-[10px] text-slate-400">Score</span>
            <span className="mt-1 text-sm tabular-nums text-rose-300">{points} pts</span>
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

        {status === "ready" && question && (
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
                      <div className="text-[13px] font-semibold uppercase tracking-[0.3em] text-slate-300/80">En attente...</div>
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

                    <p className="mt-5 text-[20px] font-semibold leading-snug text-slate-50 sm:text-[20px]">{question.text}</p>
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
                          if (e.key === "Tab") {
                            e.preventDefault();
                            showMultipleChoice();
                          }
                        }}
                        disabled={phaseRef.current !== "playing" || socketStatus !== "connected"}
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
                      disabled={phaseRef.current !== "playing" || socketStatus !== "connected"}
                      className={[
                        "inline-flex items-center justify-center rounded-[12px] px-5 py-2.5",
                        "text-[11px] font-semibold uppercase tracking-[0.18em]",
                        "bg-[#2563ff] text-slate-50",
                        "shadow-[0_0_0px_rgba(37,99,235,0.45)]",
                        "transition duration-150 hover:brightness-110",
                        phaseRef.current !== "playing" || socketStatus !== "connected"
                          ? "opacity-60"
                          : "shadow-[0_0_20px_rgba(37,99,235,0.45)]",
                      ].join(" ")}
                    >
                      <img src={enterKey} alt="Entrée" className="mr-2 h-5 w-5" />
                      Valider
                    </button>
                    {/* Bouton secondaire : voir les choix */}
                    <button
                      type="button"
                      onClick={showMultipleChoice}
                      disabled={phaseRef.current !== "playing" || socketStatus !== "connected"}
                      className={[
                        "inline-flex items-center justify-center rounded-[12px] px-4 py-2.5",
                        "text-[11px] font-semibold uppercase tracking-[0.18em]",
                        "border border-slate-700 bg-slate-900/70",
                        "text-slate-200",
                        "transition duration-150 hover:border-white/70 hover:text-white",
                        phaseRef.current !== "playing" || socketStatus !== "connected"
                          ? "opacity-60"
                          : "",
                      ].join(" ")}
                    >
                      <img src={tabKey} alt="Tab" className="mr-2 h-5 w-5" />
                      Voir les choix
                    </button>
                  </div>
                </div>

                {/* feedback */}
                {feedback && (
                  <div
                    className="mt-4 flex items-center gap-3 rounded-[14px] border border-slate-800/80 bg-black/70 px-4 py-3 text-sm text-slate-100 shadow-inner shadow-black/60"
                    role="status"
                  >
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
                      {feedback === "Temps écoulé !" ? "⏳" : feedback.includes("Bravo") ? "✅" : "❌"}
                    </span>
                    <div>
                      <span className="font-medium">{feedback}</span>
                    </div>
                  </div>
                )}

                {/* cellule temps de réponse (uniquement si bonne réponse) */}
                {lastResult?.correct && (
                  <div className="mt-4 inline-flex min-h-[42px] items-center rounded-[12px] border border-slate-700/80 bg-black/80 px-5 py-2.5 text-xs text-slate-100 shadow-inner shadow-black/80">
                    <div className="flex flex-col leading-tight">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Temps de réponse</span>
                      <span className="mt-1 font-mono text-sm text-slate-50">
                        {lastResult.responseMs.toLocaleString("fr-FR")} ms
                      </span>
                    </div>
                  </div>
                )}

                {/* choix multiples */}
                {showChoices && choices && (
                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    {choices.map((choice) => {
                      const isSelected = selectedChoice === choice.id;
                      const isCorrect = correctChoiceId === choice.id;

                      return (
                        <button
                          key={choice.id}
                          type="button"
                          onClick={() => onSelectChoice(choice)}
                          disabled={phaseRef.current !== "playing" && !isSelected}
                          className={[
                            "group relative overflow-hidden rounded-[12px] border px-4 py-3 text-left text-[15px] font-medium transition",
                            "backdrop-blur-xl",
                            isCorrect
                              ? "border-emerald-600 bg-emerald-600 text-slate-50 shadow-[0_0_0px_rgba(52,211,153,0.75)]"
                              : isSelected
                              ? "border-rose-700 bg-rose-700 text-slate-50 shadow-[0_0_0px_rgba(248,113,113,0.8)]"
                              : "border-slate-700/90 bg-black/75 text-slate-50 hover:border-white hover:bg-slate-900",
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
        {phase === "finished" && (
          <section className="mt-12 rounded-[34px] border border-slate-800/80 bg-black/80 p-6 shadow-[0_32px_90px_rgba(0,0,0,0.95)] backdrop-blur-2xl sm:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-50">Résultats du défi</h2>
                <p className="mt-2 text-sm text-slate-300/90">
                  Score :{" "}
                  <span className="font-semibold text-rose-400">{points} pts</span>{" "}·{" "}
                  <span className="font-semibold text-slate-100">{correctCount}/{totalQuestions} bonnes réponses</span>
                </p>
              </div>
              <div className="flex gap-8 text-right text-xs uppercase tracking-[0.3em] text-slate-300/80">
                <div>
                  <div className="text-3xl font-black text-rose-400">{points}</div>
                  <div className="mt-1 text-[10px] text-slate-400">Points</div>
                </div>
                <div>
                  <div className="text-3xl font-black text-slate-50">{correctCount}</div>
                  <div className="mt-1 text-[10px] text-slate-400">Réponses justes</div>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {results.map((res, i) => {
                const ok = res.correct;
                const meta = getThemeMeta(res.theme ?? null);
                return (
                  <div
                    key={res.questionId}
                    className={[
                      "rounded-2xl border px-4 py-3 text-sm backdrop-blur-xl",
                      ok ? "border-emerald-400/70 bg-emerald-500/10" : "border-rose-400/80 bg-rose-500/10",
                    ].join(" ")}
                  >
                    <div className="font-semibold text-slate-50">Question {i + 1}</div>
                    <div className="mt-1 text-slate-100">{res.questionText}</div>
                    <div className="mt-2 text-[12px] text-slate-300">
                      {ok ? "Bonne réponse" : `Réponse attendue : ${res.correctLabel}`}
                      {res.answer && <span className="mt-1 block text-slate-400">Votre réponse : {res.answer}</span>}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{meta.label}</div>
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
