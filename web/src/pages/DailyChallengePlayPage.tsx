// web/src/pages/DailyChallengePlayPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getThemeMeta } from "../lib/themeMeta";
import tabKey from "@/assets/tab-key.svg";
import enterKey from "@/assets/enter-key.svg";
import emptyQuestionImg from "../assets/empty_img.jpg";
import { io, Socket } from "socket.io-client";
import Background from "../components/Background";
import QuestionPanel, {
  Choice,
  QuestionLite,
  QuestionProgress,
} from "../components/QuestionPanel";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");
const QUESTION_DURATION_MS = Number(import.meta.env.VITE_DAILY_ROUND_MS ?? 20000);
const TEXT_LIVES = Number(import.meta.env.VITE_TEXT_LIVES ?? 3);
const STORAGE_KEY = "dailyChallenge:results:v1";
const DAILY_MAX_MC_USES = 3;
const RIGHT_IMAGE_WIDTH = 300;
const TOP_BAR_H = 12;
const NAVBAR_TOP = 52;
const FIXED_TOP = NAVBAR_TOP + TOP_BAR_H;

type Result = {
  questionId: string;
  questionText: string;
  slotLabel: string | null;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  correct: boolean;
  answer: string | null;
  mode: "text" | "choice" | "timeout" | "skip";
  responseMs: number;
  correctLabel: string;
};

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
  points?: number;
  skipped?: boolean;
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

type CompletedInfo = {
  score: number;
  completedAt: string;
  // nouvel ajout : états de chaque question (pour l’affichage sur DailyChallengePage)
  questionStates?: QuestionProgress[];
};

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
    // on garde le meilleur score ainsi que les états les plus récents
    if (!prev || info.score > prev.score) {
      data[date] = info;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch {
    // ignore
  }
}

// UI subcomponents -----------------------------------------------------------

function formatResultSeconds(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return `${(ms / 1000).toFixed(1).replace(".", ",")} sec`;
}

function formatAccuracy(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

function difficultyStarCount(difficulty: string | null): number {
  if (!difficulty) return 2;
  const numeric = Number(difficulty);
  if (Number.isFinite(numeric)) return Math.max(1, Math.min(5, Math.round(numeric)));

  const normalized = difficulty.toLowerCase();
  if (normalized.includes("facile") || normalized.includes("easy")) return 1;
  if (normalized.includes("difficile") || normalized.includes("hard")) return 3;
  if (normalized.includes("expert") || normalized.includes("extr")) return 4;
  return 2;
}

function normalizeDifficultyLabel(difficulty: string | null): string {
  if (!difficulty) return "Moyen";
  const lower = difficulty.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function DailyFinalResults({
  results,
  totalQuestions,
}: {
  results: Result[];
  totalQuestions: number;
}) {
  const total = Math.max(totalQuestions, results.length);
  const correctCount = results.filter((result) => result.correct).length;
  const accuracy = formatAccuracy(correctCount, total);

  return (
    <section className="mt-8 grid min-h-[calc(100vh-150px)] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.62fr)_minmax(720px,1.38fr)] 2xl:grid-cols-[minmax(0,0.72fr)_minmax(820px,1.28fr)]">
      <div
        className="hidden min-h-[560px] rounded-[24px] border border-transparent xl:block"
        aria-hidden="true"
      />

      <div className="rounded-[14px] bg-[#131930] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.36)] sm:p-5">
        <div className="mb-4 border-b border-white/[0.06] pb-3">
          <h2 className="font-brandUpright text-[24px] uppercase leading-none tracking-[0.05em] text-white">
            Récapitulatif des questions
          </h2>
        </div>

        <div className="max-h-[calc(100vh-210px)] space-y-2 overflow-y-auto pr-1 [scrollbar-color:rgba(124,58,237,0.55)_rgba(15,23,42,0.3)] [scrollbar-width:thin]">
          {results.map((result, i) => {
            const ok = result.correct;
            const meta = getThemeMeta(result.theme ?? null);
            const accentColor = ok ? "#34D399" : "#F56471";
            const railOverlay = ok
              ? "bg-[#10222C]"
              : "bg-[#1F182B]";
            const statusClasses = ok
              ? "bg-emerald-400 text-[#07111d]"
              : "bg-[#F56471] text-[#160911]";
            const ringColor = ok ? "#2EEB8E" : "#F56471";
            const questionAccuracy = ok ? Math.max(accuracy, 77) : Math.min(accuracy || 45, 45);
            const difficultyStars = "★".repeat(difficultyStarCount(result.difficulty));

            return (
              <article key={`${result.questionId}:${i}`} className="group relative pl-[4px]">
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 w-[32px] rounded-l-[10px]"
                  style={{ backgroundColor: accentColor }}
                />
                <div
                  className={[
                    "relative overflow-hidden rounded-[10px] border border-white/[0.06] bg-[#0b1228]/88",
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-colors group-hover:border-white/12",
                  ].join(" ")}
                >
                  <div className="relative z-20 grid grid-cols-[0px_0px_minmax(0,1fr)_0px] items-center gap-3 py-3 sm:grid-cols-[32px_32px_minmax(0,1fr)_96px] sm:px-4">
                    <div className="relative z-10 flex items-center justify-center">
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${statusClasses}`}>
                        {ok ? (
                          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M3.5 8.1 6.7 11.3 12.8 4.7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                          </svg>
                        )}
                      </span>
                    </div>
                    <div className={`hidden text-center font-brand text-[18px] font-black italic leading-none sm:block ${ok ? "text-emerald-300" : "text-rose-300"}`}>
                      {i + 1}
                    </div>

                    <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[9px] font-medium uppercase tracking-[0.14em] text-slate-400">
                      <span>{meta.label}</span>
                      <span className="text-slate-600">|</span>
                      <span aria-label={`${difficultyStars.length} étoile${difficultyStars.length > 1 ? "s" : ""} de difficulté`}>{difficultyStars}</span>
                    </div>
                    <h3 className="truncate font-sans text-[12px] font-semibold leading-snug text-slate-50 sm:text-[13px]">
                      {result.questionText}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-sans text-[11px] font-medium">
                      <span className="text-slate-400">Réponse : {result.correctLabel}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <div className="hidden items-center gap-1.5 text-[11px] font-semibold tabular-nums text-slate-400 sm:flex">
                      <span aria-hidden="true">◷</span>
                      {formatResultSeconds(result.responseMs)}
                    </div>
                    <div
                      className="grid size-11 min-h-11 min-w-11 flex-none shrink-0 place-items-center rounded-full p-[3px]"
                      style={{
                        background: `conic-gradient(${ringColor} ${questionAccuracy * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
                      }}
                      aria-label={`${questionAccuracy}% de réussite`}
                    >
                      <div className="grid size-full place-items-center rounded-full bg-[#071023] text-[10px] font-black tabular-nums text-white">
                        {questionAccuracy}%
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
                <div className={`pointer-events-none absolute inset-y-0 left-[4px] z-10 w-[42px] rounded-l-[10px] sm:w-[42px] ${railOverlay}`} />
              </article>
            );
          })}

          {!results.length && (
            <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
              Aucune question à récapituler.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Main component -------------------------------------------------------------

export default function DailyChallengePlayPage() {
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
  const [feedbackResponseMs, setFeedbackResponseMs] = useState<number | null>(null);
  const [feedbackWasCorrect, setFeedbackWasCorrect] = useState<boolean | null>(null);
  const [feedbackCorrectLabel, setFeedbackCorrectLabel] = useState<string | null>(null);
  const [feedbackPoints, setFeedbackPoints] = useState<number | null>(null);
  const [answerMode, setAnswerMode] = useState<"text" | "choice" | null>(null);
  const [choicesRevealed, setChoicesRevealed] = useState(false);
  const [mcUses, setMcUses] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [points, setPoints] = useState(0);
  const [skew, setSkew] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [questionProgress, setQuestionProgress] = useState<QuestionProgress[]>([]);

  const phaseRef = useRef<"idle" | "playing" | "reveal" | "finished">("idle");
  const feedbackWasCorrectRef = useRef<boolean | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    feedbackWasCorrectRef.current = feedbackWasCorrect;
  }, [feedbackWasCorrect]);

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

      // initialisation de la barre de progression à la première question
      if (p.index === 0) {
        setQuestionProgress(Array(p.total).fill("pending"));
        setMcUses(0);
      }

      setQuestion(p.question);
      setLives(TEXT_LIVES);
      setShowChoices(false);
      setChoices(null);
      setSelectedChoice(null);
      setCorrectChoiceId(null);
      setTextAnswer("");
      setFeedbackResponseMs(null);
      setFeedbackWasCorrect(null);
      feedbackWasCorrectRef.current = null;
      setFeedbackCorrectLabel(null);
      setFeedbackPoints(null);
      setAnswerMode(null);
      setChoicesRevealed(false);
      setEndsAt(p.endsAt);
      setPoints(p.score);
      setRemainingSeconds(
        Math.max(0, Math.ceil((p.endsAt - (p.serverNow ?? Date.now())) / 1000)),
      );
      window.setTimeout(() => inputRef.current?.focus(), 60);
    });

    s.on("daily_multiple_choice", (p: { choices: Choice[] }) => {
      setShowChoices(true);
      setChoices(p.choices);
      setTextAnswer("");
      setChoicesRevealed(true);
    });

    s.on("daily_answer_feedback", (p: DailyAnswerFeedback) => {
      if (typeof p.score === "number") setPoints(p.score);
      if (typeof p.correct === "boolean") {
        setFeedbackWasCorrect(p.correct);
        feedbackWasCorrectRef.current = p.correct;
      }
      if (typeof p.points === "number") setFeedbackPoints(p.points);
      if (typeof p.responseMs === "number") setFeedbackResponseMs(p.responseMs);
      if (p.correctChoiceId) setCorrectChoiceId(p.correctChoiceId);
      if (typeof p.correctLabel === "string" && p.correctLabel) {
        setFeedbackCorrectLabel(p.correctLabel);
      }
      if (typeof p.livesLeft === "number") setLives(p.livesLeft);
      if (p.skipped) {
        setFeedback("Question passée !");
        return;
      }
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
      if (p.correctLabel) {
        setFeedbackCorrectLabel(p.correctLabel);
      }

      // mise à jour de la barre de progression pour la question courante
      setQuestionProgress((prev) => {
        if (!prev.length) return prev;
        const next = [...prev];
        const wasCorrect = feedbackWasCorrectRef.current === true;
        next[p.index] = wasCorrect ? "correct" : "wrong";
        return next;
      });

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
        setError(
          res?.reason === "not-found" ? "Défi introuvable" : "Impossible de rejoindre le défi",
        );
        s.close();
      } else {
        setStatus("ready");
        // Ne pas toucher à `phase` ici : c'est `daily_round_begin` qui le gère.
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

  const textLocked = choicesRevealed || showChoices;

  const submitText = () => {
    if (phaseRef.current !== "playing" || !question || !socket) return;
    if (choicesRevealed || showChoices) return;
    const value = textAnswer.trim();
    if (!value) return;
    setAnswerMode("text");
    socket.emit("daily_submit_answer_text", { text: value });
  };

  const onSelectChoice = (choice: Choice) => {
    if (!socket || phaseRef.current !== "playing" || selectedChoice) return;
    setSelectedChoice(choice.id);
    setAnswerMode("choice");
    socket.emit("daily_submit_answer", { choiceId: choice.id });
  };

  const showMultipleChoice = () => {
    if (!socket || phaseRef.current !== "playing" || lives <= 0 || !!feedback?.includes("Bravo"))
      return;
    if (mcUses >= DAILY_MAX_MC_USES) {
      setFeedback("Mode QCM indisponible : limite de 3 utilisations atteinte.");
      return;
    }
    setChoicesRevealed(true);
    socket.emit("daily_request_choices", (res: { ok: boolean; reason?: string; mcUses?: number }) => {
      if (res?.ok) {
        if (typeof res.mcUses === "number") setMcUses(res.mcUses);
        return;
      }
      setChoicesRevealed(false);
      if (res?.reason === "mc-limit") {
        setMcUses(DAILY_MAX_MC_USES);
        setFeedback("Mode QCM indisponible : limite de 3 utilisations atteinte.");
      }
    });
  };

  const skipQuestion = () => {
    if (!socket || phaseRef.current !== "playing" || lives <= 0 || !!feedback?.includes("Bravo"))
      return;
    setAnswerMode("text");
    setChoicesRevealed(true);
    socket.emit("daily_skip_question", (res: { ok: boolean; reason?: string }) => {
      if (res?.ok) return;
      setChoicesRevealed(false);
      setAnswerMode(null);
      if (res?.reason === "already" || res?.reason === "too-late") return;
      setFeedback("Impossible de passer cette question.");
    });
  };

  // Sauvegarde du score + états des questions à la fin du défi
  useEffect(() => {
    if (phase === "finished" && challengeMeta) {
      writeStorage(challengeMeta.date, {
        score: points,
        completedAt: new Date().toISOString(),
        questionStates: questionProgress,
      });
    }
  }, [phase, challengeMeta, points, questionProgress]);

  const normalizedQuestion = useMemo(() => {
    if (!question) return null;
    const img = question.img
      ? question.img.startsWith("http") || question.img.startsWith("/")
        ? question.img
        : "/" + question.img.replace(/^\.?\//, "")
      : null;

    return {
      ...question,
      img,
    };
  }, [question]);
  

  // RENDER -------------------------------------------------------------------

  return (
    <div className="relative min-h-full overflow-hidden text-slate-50">
      <Background />

      <div
        className={[
          "relative z-10 mx-auto flex flex-col px-4 pb-16 pt-8 sm:px-8 lg:px-10",
          phase === "finished" ? "w-full max-w-[1500px]" : "max-w-6xl",
        ].join(" ")}
      >

        {status === "loading" && (
          <p className="mt-6 text-sm text-slate-200/80">Chargement du défi…</p>
        )}
        {status === "error" && (
          <p className="mt-6 max-w-xl text-sm text-slate-200/80">
            {error ?? "Ce défi n'est pas disponible."}
          </p>
        )}

        {status === "ready" && phase !== "finished" && (
          <aside
            className="hidden lg:block fixed bottom-0 right-0 z-20"
            style={{ top: FIXED_TOP, width: RIGHT_IMAGE_WIDTH }}
          >
            <div className="h-full overflow-visible bg-transparent pb-3 pl-3 pr-6 pt-3">
              <div className="flex flex-col gap-4 overflow-visible">
                <div className="overflow-hidden rounded-[6px] border border-white/10 bg-[#121421]">
                  <div className="relative aspect-video w-full">
                    <img
                      src={normalizedQuestion?.img || emptyQuestionImg}
                      alt="Illustration de la question"
                      className="h-full w-full object-cover"
                      loading="lazy"
                      draggable={false}
                      onError={(event) => {
                        event.currentTarget.src = emptyQuestionImg;
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

{status === "ready" && normalizedQuestion && (
  <QuestionPanel
    question={normalizedQuestion}
    index={index}
    totalQuestions={totalQuestions}
    lives={lives}
    totalLives={TEXT_LIVES}
    remainingSeconds={remainingSeconds}
    timerProgress={timerProgress}
    isReveal={phase === "reveal" && remainingSeconds === 0}
    isPlaying={phase === "playing" && socketStatus === "connected"}
    inputRef={inputRef}
    textAnswer={textAnswer}
    textLocked={textLocked}
    onChangeText={setTextAnswer}
    onSubmitText={submitText}
    onShowChoices={showMultipleChoice}
    onSkipQuestion={skipQuestion}
    feedback={feedback}
    feedbackResponseMs={feedbackResponseMs}
    feedbackWasCorrect={feedbackWasCorrect}
    feedbackCorrectLabel={feedbackCorrectLabel}
    feedbackPoints={feedbackPoints}
    answerMode={answerMode}
    choicesRevealed={choicesRevealed}
    showChoices={showChoices}
    choices={choices}
    selectedChoice={selectedChoice}
    correctChoiceId={correctChoiceId}
    onSelectChoice={onSelectChoice}
    questionProgress={questionProgress}
    qcmUsesLeft={Math.max(0, DAILY_MAX_MC_USES - mcUses)}
    correctLabelPlacement="above"
  />
)}

        {phase === "finished" && (
          <DailyFinalResults
            results={results}
            totalQuestions={totalQuestions}
          />
        )}
      </div>
    </div>
  );
}
