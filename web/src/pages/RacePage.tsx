// web/src/pages/RacePage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import QuestionPanel from "../components/QuestionPanel";
import Cursor from "../assets/cursor.png"; // image curseur

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const QUESTION_DURATION_MS = Number(import.meta.env.VITE_DAILY_ROUND_MS ?? 20000);
const TEXT_LIVES = Number(import.meta.env.VITE_TEXT_LIVES ?? 3);
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");

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

type RaceLeaderboardEntry = { id: string; name: string; points: number; speed: number };

// l’énergie gagnée par bonne réponse
const ENERGY_BASE = 120;
const ENERGY_TIME_BONUS = 8;
const MAX_POINTS = 10000;

export default function RacePage() {
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
  const [energy, setEnergy] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [raceId, setRaceId] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("race_id") : null,
  );
  const [leaderboard, setLeaderboard] = useState<RaceLeaderboardEntry[]>([]);

  const phaseRef = useRef<"idle" | "playing" | "reveal" | "finished">("idle");
  const revealTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const roundStartRef = useRef<number | null>(null);
  const speedRef = useRef(0);

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
    const storedRaceId = typeof window !== "undefined" ? sessionStorage.getItem("race_id") : null;
    if (storedRaceId) setRaceId(storedRaceId);

    const s = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    setSocket(s);

    s.on("connect", () => {
      const currentRaceId = typeof window !== "undefined" ? sessionStorage.getItem("race_id") : null;
      if (currentRaceId) {
        s.emit("race_join", { raceId: currentRaceId }, (res: { ok: boolean; players?: RaceLeaderboardEntry[] }) => {
          if (res?.ok) {
            setRaceId(currentRaceId);
            setLeaderboard(res.players ?? []);
          }
        });
      }
    });

    s.on("race_leaderboard", (payload: { players?: RaceLeaderboardEntry[] }) => {
      setLeaderboard(payload.players ?? []);
    });

    return () => {
      s.close();
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
    setFeedbackResponseMs(null);
    setSelectedChoice(null);
    setCorrectChoiceId(null);
    setTextAnswer("");
    setAnswerMode(null);
    setLives(TEXT_LIVES);
    setShowChoices(false);
    setChoices(null);

    try {
      while (true) {
        const res = await fetch(`/race/question?speed=${encodeURIComponent(speedRef.current ?? 0)}`, {
          credentials: "include",
        });

        if (res.status === 503) {
          await new Promise((resolve) => setTimeout(resolve, 750));
          continue;
        }

        if (!res.ok) throw new Error("question-fetch");

        const data = (await res.json()) as { question: RaceQuestion };
        const q = data.question;

        setQuestion(q);
        setChoices(shuffleArray(q.choices)); // <-- SHUFFLE APPLIQUÉ ICI
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
        break;
      }
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

  const speed = useMemo(() => {
    const inner = 0.1 * energy - 3;
    if (inner <= 0) return 0;
    const base = Math.sqrt(inner) - 0.5;
    const raw = 10 * base;
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return raw;
  }, [energy]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    if (!socket || !raceId) return;

    const id = window.setInterval(() => {
      socket.emit("race_progress", { raceId, points: Math.floor(points), speed });
    }, 1000);

    return () => window.clearInterval(id);
  }, [socket, raceId, points, speed]);


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

    if (res.correct) {
      if (mode === "text") setEnergy((prev) => prev + 100);
      else if (mode === "choice") setEnergy((prev) => prev + 60);
    } else {
      setEnergy((prev) => Math.max(0, prev - 20));
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

      setEnergy((prev) => {
        if (phaseRef.current === "finished" || prev <= 0) return prev;
        const next = prev * 0.98;
        return next < 0.001 ? 0 : next;
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

      <div className="relative z-10 mx-auto w-full max-w-none px-4 pb-16 pt-8 sm:px-8 lg:px-10 xl:px-14">
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,22vw)_minmax(0,1fr)_minmax(240px,20vw)] xl:gap-8 2xl:gap-10">

          {/* COLONNE GAUCHE */}
          <div className="flex items-start justify-start">
            <aside className="w-full max-w-xs rounded-2xl border border-slate-800/80 bg-black/60 px-4 py-4 text-sm text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                    Classement
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Actualisé toutes les secondes</p>
                </div>
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-rose-200">
                  {leaderboard.length} joueurs
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {leaderboard.map((player, index) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-slate-900/80 px-3 py-2 shadow-inner shadow-black/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/15 text-xs font-semibold text-rose-100">
                        #{index + 1}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-50">{player.name}</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{player.speed.toFixed(1)} pts/s</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold tabular-nums text-rose-300">{player.points}</div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Points</div>
                    </div>
                  </div>
                ))}

                {!leaderboard.length && (
                  <div className="rounded-xl border border-dashed border-slate-800/70 bg-slate-900/50 px-4 py-5 text-center text-xs text-slate-400">
                    En attente des premiers joueurs…
                  </div>
                )}
              </div>
            </aside>
          </div>

          {/* COLONNE CENTRALE */}
          <div className="flex flex-col gap-6 px-4 lg:px-8 xl:px-12">
            {/* BARRE DE PROGRESSION */}
            <div>
              <div className="relative h-[2px] w-full rounded-full bg-slate-900/80">
                <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-rose-500/40 via-rose-300/25 to-emerald-400/40 opacity-60" />

                {/* Curseur image AU-DESSUS de la barre, légèrement réduit */}
                <img
                  src={Cursor}
                  alt=""
                  className="pointer-events-none select-none absolute -top-6 h-6 w-auto -translate-x-1/2"
                  style={{
                    left: `${raceProgress * 100}%`,
                  }}
                />
              </div>

              <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                <span>Départ</span>
                <span>10 000 pts</span>
              </div>
            </div>

            {status === "loading" && (
              <p className="text-sm text-slate-200/80">Chargement…</p>
            )}

            {status === "error" && (
              <p className="text-sm text-rose-300">Impossible de charger une question.</p>
            )}

            {phase === "finished" && (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-5 text-sm text-emerald-100 shadow-[0_0_40px_rgba(16,185,129,0.25)]">
                <div className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                  Course terminée
                </div>
                <div className="mt-2 text-lg font-semibold">
                  Objectif des 10 000 points atteint 🎉
                </div>
                <div className="mt-2 text-[13px] text-emerald-100/80">
                  Score final :{" "}
                  <span className="font-semibold">{Math.floor(points)} pts</span>
                </div>
              </div>
            )}

            {status === "ready" && question && phase !== "finished" && (
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
                questionProgress={[]}
              />
            )}
          </div>

          {/* COLONNE DROITE */}
          <div className="flex items-start justify-end">
            <div className="w-full max-w-xs rounded-2xl border border-slate-800/70 bg-black/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
