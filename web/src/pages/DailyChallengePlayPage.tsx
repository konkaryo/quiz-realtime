// web/src/pages/DailyChallengePlayPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getThemeMeta } from "../lib/themeMeta";
import tabKey from "@/assets/tab-key.svg";
import enterKey from "@/assets/enter-key.svg";
import { io, Socket } from "socket.io-client";
import QuestionPanel, {
  Choice,
  QuestionLite,
  QuestionProgress,
} from "../components/QuestionPanel";
import Background from "../components/Background";

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

type CompletedInfo = {
  score: number;
  completedAt: string;
  // nouvel ajout : états de chaque question (pour l’affichage sur DailyChallengePage)
  questionStates?: QuestionProgress[];
};

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
  const [feedbackResponseMs, setFeedbackResponseMs] = useState<number | null>(null);
  const [feedbackWasCorrect, setFeedbackWasCorrect] = useState<boolean | null>(null);
  const [feedbackCorrectLabel, setFeedbackCorrectLabel] = useState<string | null>(null);
  const [answerMode, setAnswerMode] = useState<"text" | "choice" | null>(null);
  const [choicesRevealed, setChoicesRevealed] = useState(false);
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
      if (typeof p.responseMs === "number") setFeedbackResponseMs(p.responseMs);
      if (p.correctChoiceId) setCorrectChoiceId(p.correctChoiceId);
      if (typeof p.correctLabel === "string" && p.correctLabel) {
        setFeedbackCorrectLabel(p.correctLabel);
      }
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

  const submitText = () => {
    if (phaseRef.current !== "playing" || !question || !socket) return;
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
    socket.emit("daily_request_choices");
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

  const correctCount = useMemo(() => results.filter((r) => r.correct).length, [results]);

  const dateLabel = challengeMeta
    ? formatDateLabel(challengeMeta.date)
    : formatDateLabel(dateParam);

  const showResponseTime = feedbackWasCorrect === true && feedbackResponseMs !== null;
  const showCorrectLabelCell =
    !!feedbackCorrectLabel &&
    (answerMode === "text" ||
      (answerMode === null && feedback === "Temps écoulé !" && !choicesRevealed));

  const themeMeta = getThemeMeta(question?.theme ?? null);

  // RENDER -------------------------------------------------------------------

  return (
    <div className="relative text-slate-50">
      <Background />

      {/* CONTENU : wrapper sans min-h-screen, comme Home/DailyChallengePage */}
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 pb-16 pt-8 sm:px-8 lg:px-10">
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
              onClick={() => navigate("/solo/daily", { state: { selectedDate: dateParam } })}
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
  <QuestionPanel
    question={question}
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
    onChangeText={setTextAnswer}
    onSubmitText={submitText}
    onShowChoices={showMultipleChoice}
    feedback={feedback}
    feedbackResponseMs={feedbackResponseMs}
    feedbackWasCorrect={feedbackWasCorrect}
    feedbackCorrectLabel={feedbackCorrectLabel}
    answerMode={answerMode}
    choicesRevealed={choicesRevealed}
    showChoices={showChoices}
    choices={choices}
    selectedChoice={selectedChoice}
    correctChoiceId={correctChoiceId}
    onSelectChoice={onSelectChoice}
    questionProgress={questionProgress}
  />
)}

        {/* bloc résultats façon stats bas de page */}
        {phase === "finished" && (
          <section className="mt-12 rounded-[34px] border border-slate-800/80 bg-black/80 p-6 shadow-[0_32px_90px_rgba(0,0,0,0.95)] backdrop-blur-2xl sm:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
                  Résultats du défi
                </h2>
                <p className="mt-2 text-sm text-slate-300/90">
                  Score :{" "}
                  <span className="font-semibold text-rose-400">{points} pts</span> ·{" "}
                  <span className="font-semibold text-slate-100">
                    {correctCount}/{totalQuestions} bonnes réponses
                  </span>
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
                      ok
                        ? "border-emerald-400/70 bg-emerald-500/10"
                        : "border-rose-400/80 bg-rose-500/10",
                    ].join(" ")}
                  >
                    <div className="font-semibold text-slate-50">Question {i + 1}</div>
                    <div className="mt-1 text-slate-100">{res.questionText}</div>
                    <div className="mt-2 text-[12px] text-slate-300">
                      {ok ? "Bonne réponse" : `Réponse attendue : ${res.correctLabel}`}
                      {res.answer && (
                        <span className="mt-1 block text-slate-400">
                          Votre réponse : {res.answer}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {meta.label}
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
