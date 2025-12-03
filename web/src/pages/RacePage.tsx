// web/src/pages/RacePage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getThemeMeta } from "../lib/themeMeta";
import tabKey from "@/assets/tab-key.svg";
import enterKey from "@/assets/enter-key.svg";

const QUESTION_DURATION_MS = Number(import.meta.env.VITE_DAILY_ROUND_MS ?? 20000);
const TEXT_LIVES = Number(import.meta.env.VITE_TEXT_LIVES ?? 3);

const SCORE_BASE = 120;
const SCORE_TIME_BONUS = 8;

export type Choice = { id: string; label: string };

export type RaceQuestion = {
  id: string;
  text: string;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  choices: Choice[];
  correctChoiceId: string | null;
  correctLabel: string | null;
  acceptedNorms: string[];
};

export type AnswerResponse = {
  correct: boolean;
  correctChoiceId: string | null;
  correctLabel: string | null;
};

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

export default function RacePage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [question, setQuestion] = useState<RaceQuestion | null>(null);
  const [phase, setPhase] = useState<"idle" | "playing" | "reveal">("idle");
  const [lives, setLives] = useState(TEXT_LIVES);
  const [showChoices, setShowChoices] = useState(false);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [correctChoiceId, setCorrectChoiceId] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackResponseMs, setFeedbackResponseMs] = useState<number | null>(null);
  const [feedbackWasCorrect, setFeedbackWasCorrect] = useState<boolean | null>(null);
  const [feedbackCorrectLabel, setFeedbackCorrectLabel] = useState<string | null>(null);
  const [answerMode, setAnswerMode] = useState<"text" | "choice" | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [points, setPoints] = useState(0);
  const [questionCounter, setQuestionCounter] = useState(0);

  const phaseRef = useRef<"idle" | "playing" | "reveal">("idle");
  const revealTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const roundStartRef = useRef<number | null>(null);

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
    if (!endsAt || phase !== "playing") return;
    const id = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        window.clearInterval(id);
        handleTimeout();
      }
    }, 350);
    return () => window.clearInterval(id);
  }, [endsAt, phase]);

  const handleTimeout = () => {
    if (phaseRef.current !== "playing") return;
    setPhase("reveal");
    phaseRef.current = "reveal";
    setFeedback("Temps écoulé !");
    setFeedbackWasCorrect(false);
    setAnswerMode(null);
    setFeedbackCorrectLabel(question?.correctLabel ?? null);
    setCorrectChoiceId(question?.correctChoiceId ?? null);
    scheduleNextQuestion();
  };

  const loadQuestion = async () => {
    setStatus("loading");
    setFeedback(null);
    setFeedbackWasCorrect(null);
    setFeedbackCorrectLabel(null);
    setSelectedChoice(null);
    setCorrectChoiceId(null);
    setTextAnswer("");
    setAnswerMode(null);
    setLives(TEXT_LIVES);
    setShowChoices(false);
    setChoices(null);
    try {
      const res = await fetch(`/race/question`, { credentials: "include" });
      if (!res.ok) throw new Error("question-fetch");
      const data = (await res.json()) as { question: RaceQuestion };
      const q = data.question;
      setQuestion(q);
      setChoices(q.choices);
      setPhase("playing");
      phaseRef.current = "playing";
      setQuestionCounter((prev) => prev + 1);
      const now = Date.now();
      roundStartRef.current = now;
      const end = now + QUESTION_DURATION_MS;
      setEndsAt(end);
      setRemainingSeconds(Math.ceil(QUESTION_DURATION_MS / 1000));
      setStatus("ready");
      window.setTimeout(() => inputRef.current?.focus(), 60);
    } catch (err) {
      console.error("[race-question]", err);
      setStatus("error");
      setPhase("idle");
    }

  };

  useEffect(() => {
    void loadQuestion();
  }, []);
  useEffect(() => {
    if (phase === "playing") inputRef.current?.focus();
  }, [phase, question]);

  const timerProgress = useMemo(() => {
    if (remainingSeconds === null) return 1;
    return Math.max(0, Math.min(1, remainingSeconds / (QUESTION_DURATION_MS / 1000)));
  }, [remainingSeconds]);

  const scheduleNextQuestion = () => {
    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
    }
    revealTimeoutRef.current = window.setTimeout(() => {
      void loadQuestion();
    }, 1400);
  };

  const processAnswer = (res: AnswerResponse, mode: "text" | "choice") => {
    const responseMs = Math.max(0, Date.now() - (roundStartRef.current ?? Date.now()));
    setAnswerMode(mode);
    setFeedbackWasCorrect(res.correct);
    setFeedbackResponseMs(responseMs);
    setFeedbackCorrectLabel(res.correctLabel ?? question?.correctLabel ?? null);
    setCorrectChoiceId(res.correctChoiceId ?? question?.correctChoiceId ?? null);
    setPhase("reveal");
    phaseRef.current = "reveal";
    setRemainingSeconds(0);
    setFeedback(res.correct ? "Bravo !" : "Mauvaise réponse !");
    if (res.correct) {
      const bonus = Math.max(0, Math.floor((QUESTION_DURATION_MS - responseMs) / 1000) * SCORE_TIME_BONUS);
      setPoints((prev) => prev + SCORE_BASE + bonus);
    }
    scheduleNextQuestion();
  };

  const submitText = async () => {
    if (phaseRef.current !== "playing" || !question) return;
    const value = textAnswer.trim();
    if (!value) return;
    try {
      const res = await fetch(`/race/answer`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, mode: "text", text: value }),
      });
      if (!res.ok) throw new Error("answer-text");
      const data = (await res.json()) as AnswerResponse;
      if (!data.correct) {
        setLives((prev) => {
          const next = Math.max(0, prev - 1);
          if (next > 0) {
            setFeedback("Mauvaise réponse, essayez encore !");
            setTextAnswer("");
            requestAnimationFrame(() => inputRef.current?.focus());
          } else {
            processAnswer(data, "text");
          }
          return next;
        });
        return;
      }
      processAnswer(data, "text");
    } catch (err) {
      console.error("[race-answer-text]", err);
      setFeedback("Erreur lors de l'envoi de la réponse");
    }
  };
  const onSelectChoice = async (choice: Choice) => {
    if (phaseRef.current !== "playing" || selectedChoice) return;
    setSelectedChoice(choice.id);
    try {
      const res = await fetch(`/race/answer`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question?.id, mode: "choice", choiceId: choice.id }),
      });
      if (!res.ok) throw new Error("answer-choice");
      const data = (await res.json()) as AnswerResponse;
      processAnswer(data, "choice");
    } catch (err) {
      console.error("[race-answer-choice]", err);
      setFeedback("Impossible de valider votre choix");
    }
  };

  const themeMeta = getThemeMeta(question?.theme ?? null);
  const showResponseTime = feedbackWasCorrect === true && feedbackResponseMs !== null;

  return (
    <div className="relative text-slate-50">
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-gradient-to-br from-[#050816] via-[#050014] to-[#1b0308]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_top,rgba(248,113,113,0.15),transparent_60%),radial-gradient(circle_at_top,rgba(15,23,42,0.95),#020617)]"
      />
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

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 pb-16 pt-8 sm:px-8 lg:px-10">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-600 to-rose-400 shadow-[0_0_12px_rgba(248,113,113,0.7)]">
              <span className="text-lg font-black tracking-tight">⚡</span>
            </div>
            <div className="leading-tight">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">
                Mode course
              </div>
              <div className="text-sm font-semibold text-slate-100">
                Questions infinies
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-200">
            <span className="text-[10px] text-slate-400">Score</span>
            <span className="mt-1 text-sm tabular-nums text-rose-300">{points} pts</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 rounded-[12px] border border-slate-800/80 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),rgba(15,23,42,0.99)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.9),#020617)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-100 transition hover:border-rose-400 hover:text-white"
            >
              <span className="text-xs">←</span>
              <span>Retour</span>
            </button>
          </div>
        </header>

        <div className="relative overflow-hidden rounded-[20px] border border-rose-300/10 bg-[radial-gradient(circle_at_top,_rgba(248,113,113,0.06),rgba(248,113,113,0.02)),radial-gradient(circle_at_bottom,_rgba(30,41,59,0.9),rgba(15,23,42,0.98))] shadow-[0_0_40px_rgba(248,113,113,0.08)]">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-rose-400 via-rose-300/60 to-purple-500" />

          <div className="flex flex-col gap-6 px-5 pb-6 pt-5 sm:px-8 sm:pt-7">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-rose-200/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-rose-200">
                Question {questionCounter}
              </div>
              {themeMeta && (
                <div className="flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/40 px-3 py-1 text-xs font-semibold tracking-[0.1em] text-slate-200">
                  <span
                    aria-hidden
                    className="h-[10px] w-[10px] rounded-full"
                    style={{ backgroundColor: themeMeta.color }}
                  />
                  <span>{themeMeta.label}</span>
                </div>
              )}
              {question?.difficulty && (
                <div className="rounded-full border border-slate-800/80 bg-slate-950/40 px-3 py-1 text-xs font-semibold tracking-[0.1em] text-slate-200">
                  Difficulté {question.difficulty}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex-1 space-y-2">
                <div className="text-[15px] font-semibold uppercase tracking-[0.18em] text-rose-300">
                  Question
                </div>
                <div className="text-lg font-semibold leading-relaxed text-slate-50 sm:text-xl">
                  {question?.text || (status === "loading" ? "Chargement..." : "")}
                </div>
                {question?.img && (
                  <div className="mt-2 overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900/50">
                    <img src={question.img} alt="Visuel question" className="h-auto w-full object-cover" />
                  </div>
                )}
              </div>

              <div className="flex w-full max-w-xs flex-col items-end gap-3 sm:w-auto">
                <TimerBadge seconds={remainingSeconds} />
                <div className="h-[6px] w-full max-w-[220px] overflow-hidden rounded-full bg-slate-900/60">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-300 transition-all"
                    style={{ width: `${timerProgress * 100}%` }}
                  />
                </div>
                <Lives lives={lives} total={TEXT_LIVES} />
              </div>
            </div>

            <div className="relative rounded-[16px] border border-slate-800/80 bg-slate-950/70 p-4 shadow-inner shadow-rose-900/10">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Réponse libre
                  </div>
                  <div className="text-[12px] text-slate-500">Tapez votre réponse ou ouvrez les choix</div>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-slate-500">
                  <div className="flex items-center gap-1 rounded-full border border-slate-800/60 bg-slate-900/60 px-2 py-1">
                    <img src={tabKey} alt="Tab" className="h-4 w-4" />
                    <span>Afficher choix</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-full border border-slate-800/60 bg-slate-900/60 px-2 py-1">
                    <img src={enterKey} alt="Entrer" className="h-4 w-4" />
                    <span>Valider</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  disabled={phase !== "playing"}
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitText();
                    if (e.key === "Tab") {
                      e.preventDefault();
                      setShowChoices(true);
                      requestAnimationFrame(() => document.getElementById("race-choices")?.scrollIntoView({ behavior: "smooth" }));
                    }
                  }}
                  className="w-full rounded-[12px] border border-slate-800/60 bg-slate-900/60 px-4 py-3 text-base text-slate-50 outline-none ring-1 ring-transparent transition focus:border-rose-400 focus:ring-rose-400/40 disabled:opacity-60"
                  placeholder="Saisissez la réponse ici"
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={submitText}
                    disabled={phase !== "playing" || !textAnswer.trim()}
                    className="inline-flex items-center justify-center rounded-[12px] bg-gradient-to-br from-rose-500 to-orange-400 px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-[0_10px_40px_rgba(248,113,113,0.35)] transition hover:brightness-110 disabled:opacity-50"
                  >
                    Envoyer
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChoices(true)}
                    className="inline-flex items-center justify-center rounded-[12px] border border-slate-800/80 bg-slate-900/60 px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-rose-400 hover:text-white"
                  >
                    Afficher les choix
                  </button>
                </div>
              </div>
              {feedback && (
                <div className="mt-3 text-sm font-semibold text-rose-300">{feedback}</div>
              )}
              {showResponseTime && (
                <div className="mt-1 text-xs text-slate-400">
                  Réponse en {Math.round((feedbackResponseMs ?? 0) / 10) / 100}s
                </div>
              )}
            </div>
            {showChoices && choices && (
              <div id="race-choices" className="grid gap-3 sm:grid-cols-2">
                {choices.map((c) => {
                  const isCorrect = correctChoiceId === c.id;
                  const isSelected = selectedChoice === c.id;
                  const reveal = phase !== "playing";

                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={phase !== "playing" && !isSelected && !isCorrect}
                      onClick={() => onSelectChoice(c)}
                      className={[
                        "group flex items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-left text-sm font-semibold transition",
                        reveal && isCorrect
                          ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-100 shadow-[0_0_20px_rgba(52,211,153,0.25)]"
                          : "border-slate-800/70 bg-slate-900/60 hover:border-rose-300/60 hover:text-white",
                        isSelected && !reveal
                          ? "border-rose-400/80 bg-rose-500/10 text-rose-100"
                          : "",
                        reveal && !isCorrect && isSelected
                          ? "border-rose-500/70 bg-rose-500/10 text-rose-200"
                          : "",
                      ].join(" ")}
                    >
                      <span>{c.label}</span>
                      {reveal && isCorrect && <span className="text-lg">✅</span>}
                      {reveal && !isCorrect && isSelected && <span className="text-lg">❌</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {phase === "reveal" && feedbackCorrectLabel && (
              <div className="rounded-[12px] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                <div className="text-xs uppercase tracking-[0.2em] text-emerald-300">Bonne réponse</div>
                <div className="font-semibold">{feedbackCorrectLabel}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
