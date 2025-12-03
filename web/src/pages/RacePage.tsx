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

// l’énergie gagnée par bonne réponse (on reprend les constantes existantes)
const ENERGY_BASE = 120;
const ENERGY_TIME_BONUS = 8;
const MAX_POINTS = 10000;

export default function RacePage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [question, setQuestion] = useState<RaceQuestion | null>(null);
  const [phase, setPhase] = useState<"idle" | "playing" | "reveal" | "finished">("idle");
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
  const [energy, setEnergy] = useState(0); // nouvelle ressource

  const phaseRef = useRef<"idle" | "playing" | "reveal" | "finished">("idle");
  const revealTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const roundStartRef = useRef<number | null>(null);
  const speedRef = useRef(0); // pour l’intervalle de points auto

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
    // si on a déjà atteint l'objectif, ne recharge plus de question
    if (points >= MAX_POINTS) {
      setPhase("finished");
      phaseRef.current = "finished";
      setStatus("ready");
      return;
    }

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

  const raceProgress = useMemo(
    () => Math.max(0, Math.min(1, points / MAX_POINTS)),
    [points],
  );

  // vitesse en fonction de l’énergie :
  // x = 10 * (sqrt(0.1 y - 3) - 0.5)
  const speed = useMemo(() => {
    const inner = 0.1 * energy - 3;
    if (inner <= 0) return 0;
    const base = Math.sqrt(inner) - 0.5;
    const raw = 10 * base;
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return raw;
  }, [energy]);

  // garder la vitesse à jour dans un ref pour l’intervalle
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const scheduleNextQuestion = () => {
    if (phaseRef.current === "finished") return;

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

    // 👉 Une bonne réponse donne de l’énergie (plus de points direct)
    if (res.correct) {
      const bonus = Math.max(
        0,
        Math.floor((QUESTION_DURATION_MS - responseMs) / 1000) * ENERGY_TIME_BONUS,
      );
      setEnergy((prev) => prev + ENERGY_BASE + bonus);
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

  // 👉 Intervalle qui ajoute automatiquement des points chaque seconde en fonction de la vitesse
  useEffect(() => {
    const id = window.setInterval(() => {
      setPoints((prev) => {
        if (phaseRef.current === "finished") return prev;

        const next = prev + speedRef.current;

        if (next >= MAX_POINTS) {
            setPhase("finished");
            phaseRef.current = "finished";
            setEndsAt(null);
            setRemainingSeconds(null);
            setFeedback("Bravo ! Objectif des 10 000 points atteint 🎉");

          return MAX_POINTS;
        }

        return next;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, []);

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
              {Math.floor(points)} pts
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

        {/* RACE PROGRESSION LINE */}
        <div className="mb-6">
          <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-slate-900/80">
            {/* ligne légère */}
            <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-rose-500/40 via-rose-300/25 to-emerald-400/40 opacity-60" />
            {/* curseur joueur */}
            <div
              className="absolute -top-[6px] h-3 w-3 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(248,113,113,0.9)]"
              style={{
                left: `${raceProgress * 100}%`,
                transform: "translateX(-50%)",
              }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
            <span>Départ</span>
            <span>10 000 pts</span>
          </div>
        </div>

        {/* PANEL / FIN DE COURSE */}
        {status === "loading" && (
          <p className="mt-6 text-sm text-slate-200/80">Chargement…</p>
        )}

        {status === "error" && (
          <p className="mt-6 text-sm text-rose-300">
            Impossible de charger une question.
          </p>
        )}

        {phase === "finished" && (
          <div className="mt-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-5 text-sm text-emerald-100 shadow-[0_0_40px_rgba(16,185,129,0.25)]">
            <div className="text-xs uppercase tracking-[0.3em] text-emerald-300">
              Course terminée
            </div>
            <div className="mt-2 text-lg font-semibold">
              Objectif des 10 000 points atteint 🎉
            </div>
            <div className="mt-2 text-[13px] text-emerald-100/80">
              Score final : <span className="font-semibold">{Math.floor(points)} pts</span>
            </div>
          </div>
        )}

        {status === "ready" && question && phase !== "finished" && (
          <div className="mt-4 flex flex-col gap-6 md:flex-row">
            {/* PANNEAU VITESSE / ÉNERGIE */}
            <aside className="w-full rounded-2xl border border-slate-800/80 bg-black/60 px-4 py-4 text-sm text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.7)] md:w-64">
              <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                Vitesse
              </div>
              <div className="mt-2 text-3xl font-bold tabular-nums text-rose-300">
                {speed.toFixed(1)} <span className="text-sm font-semibold">pts/s</span>
              </div>
              <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                Énergie
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-slate-50">
                {Math.floor(energy)}
              </div>
              <p className="mt-3 text-[11px] text-slate-400 leading-snug">
                Plus vous avez d&apos;énergie, plus votre vitesse de gain de points augmente.
              </p>
            </aside>

            {/* PANNEAU QUESTIONS */}
            <div className="flex-1">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
