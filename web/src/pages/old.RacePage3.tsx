// web/src/pages/RacePage.tsx

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QuestionPanel from "../components/QuestionPanel";

const QUESTION_DURATION_MS = Number(import.meta.env.VITE_DAILY_ROUND_MS ?? 20000);
const TEXT_LIVES = Number(import.meta.env.VITE_TEXT_LIVES ?? 3);

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

const SCORE_BASE = 120;
const SCORE_TIME_BONUS = 8;

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
      const bonus = Math.max(
        0,
        Math.floor((QUESTION_DURATION_MS - responseMs) / 1000) * SCORE_TIME_BONUS
      );
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
        body: JSON.stringify({
          questionId: question?.id,
          mode: "choice",
          choiceId: choice.id,
        }),
      });

      if (!res.ok) throw new Error("answer-choice");

      const data = (await res.json()) as AnswerResponse;
      processAnswer(data, "choice");
    } catch (err) {
      console.error("[race-answer-choice]", err);
      setFeedback("Impossible de valider votre choix");
    }
  };

  const showMultipleChoice = () => {
    setShowChoices(true);
  };

  return (
    <div className="relative text-slate-50">
      {/* BACKGROUND */}
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

      {/* CONTENT WRAPPER */}
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 pb-16 pt-8 sm:px-8 lg:px-10">
        {/* HEADER */}
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

          <div className="flex flex-col items-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-200">
            <span className="text-[10px] text-slate-400">Score</span>
            <span className="mt-1 text-sm tabular-nums text-rose-300">
              {points} pts
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-[12px] border border-slate-800/80 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),rgba(15,23,42,0.99)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.9),#020617)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-100 transition hover:border-rose-400 hover:text-white"
          >
            <span className="text-xs">←</span>
            <span>Retour</span>
          </button>
        </header>

        {/* PANEL */}
        {status === "loading" && (
          <p className="mt-6 text-sm text-slate-200/80">Chargement…</p>
        )}

        {status === "error" && (
          <p className="mt-6 text-sm text-rose-300">
            Impossible de charger une question.
          </p>
        )}

        {status === "ready" && question && (
          <QuestionPanel
            question={{
              id: question.id,
              text: question.text,
              theme: question.theme,
              difficulty: question.difficulty,
              img: question.img,
              slotLabel: null,
            }}
            index={questionCounter - 1}
            totalQuestions={null}
            lives={lives}
            totalLives={TEXT_LIVES}
            remainingSeconds={remainingSeconds}
            timerProgress={timerProgress}
            isReveal={phase === "reveal" && remainingSeconds === 0}
            isPlaying={phase === "playing"}
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
            choicesRevealed={showChoices}
            showChoices={showChoices}
            choices={choices}
            selectedChoice={selectedChoice}
            correctChoiceId={correctChoiceId}
            onSelectChoice={onSelectChoice}
            questionProgress={[]} // Pas de barre des 15 questions en mode course
          />
        )}
      </div>
    </div>
  );
}
