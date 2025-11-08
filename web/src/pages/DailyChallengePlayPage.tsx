// web/src/pages/DailyChallengePlayPage.tsx
import { useEffect, useMemo, useState } from "react";
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
        setChallenge(data.challenge);
        setRecords(Array.from({ length: data.challenge.questions.length }, () => null));
        setGameState("intro");
        setCurrentIndex(0);
        setTextAnswer("");
        setRunStartedAt(null);
        setTotalDuration(null);
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
      if (runStartedAt !== null) {
        setTotalDuration(Math.round(performance.now() - runStartedAt));
      }
      setGameState("finished");
    }
  };

  const startChallenge = () => {
    if (!challenge) return;
    setRecords(Array.from({ length: challenge.questions.length }, () => null));
    setCurrentIndex(0);
    setGameState("playing");
    setRunStartedAt(performance.now());
    setTotalDuration(null);
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
  const questionHasChoices = currentQuestion ? currentQuestion.choices.length > 0 : false;

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_top,_#5522aa,_#1c0c33_55%,_#060111_100%)]"
      />
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none opacity-40 mix-blend-soft-light bg-[radial-gradient(circle,_rgba(255,105,255,0.2)_0.5px,_transparent_0.5px)] bg-[length:4px_4px]"
      />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-10 text-white">
        <header className="flex flex-col gap-2 text-center">
          <div className="mx-auto rounded-full border border-white/15 bg-white/10 px-4 py-1 text-xs uppercase tracking-[0.4em] text-white/75">
            Défi du jour
          </div>
          <h1 className="font-brand text-4xl font-semibold tracking-wide md:text-5xl">
            {dayLabel ? `Défi du ${dayLabel} ${monthLabel}` : "Défi introuvable"}
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-white/75">
            Enchaîne les questions pour établir ton meilleur score. Tu peux revenir au calendrier à tout moment.
          </p>
        </header>

        <div className="mt-6 text-center text-sm text-white/75">
          {loading && <span>Chargement du défi…</span>}
          {!loading && error && <span className="text-rose-200">{error}</span>}
          {!loading && !error && !challenge && <span>Aucun défi disponible pour cette date.</span>}
        </div>

        {introReady && challenge ? (
          <section className="mx-auto mt-10 w-full max-w-3xl rounded-[28px] border border-white/15 bg-white/8 p-8 text-center shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur">
            <div className="text-sm uppercase tracking-[0.35em] text-white/60">Défi sélectionné</div>
            <div className="mt-3 text-3xl font-semibold">{challenge.questionCount} questions à enchaîner</div>
            <p className="mt-4 text-white/75">
              Une fois le défi lancé, réponds aux questions pour tenter le sans-faute. Tu obtiendras un récapitulatif complet à la fin.
            </p>
            <button
              type="button"
              onClick={startChallenge}
              className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-slate-900 transition hover:scale-[1.02]"
            >
              Commencer le défi
            </button>
            <div className="mt-6 text-xs text-white/60">
              Besoin de changer de date ?
              <button
                type="button"
                onClick={() => navigate("/solo/daily")}
                className="ml-2 inline-flex items-center rounded-full border border-white/30 px-3 py-1 text-white transition hover:border-white"
              >
                Retour au calendrier
              </button>
            </div>
          </section>
        ) : null}

        {playing && currentQuestion && (
          <section className="mx-auto mt-8 w-full max-w-4xl rounded-[28px] border border-white/15 bg-[#0f1420]/90 p-6 shadow-[0_16px_32px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-xs uppercase tracking-[0.3em] text-white/60">
                Question {progressLabel}
              </div>
              <div className="text-xs text-white/50">
                Réussies : {correctCount}/{totalQuestions}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-5 md:flex-row">
              {currentQuestion.img ? (
                <img
                  src={currentQuestion.img}
                  alt=""
                  className="h-40 w-full max-w-xs flex-shrink-0 rounded-xl border border-white/10 object-cover"
                  loading="lazy"
                />
              ) : null}
              <div className="flex-1">
                {currentQuestion.slotLabel ? (
                  <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">
                    {currentQuestion.slotLabel}
                  </div>
                ) : null}
                <h2 className="mt-2 text-2xl font-semibold leading-snug">{currentQuestion.text}</h2>
              </div>
            </div>

            {questionHasChoices ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {currentQuestion.choices.map((choice) => {
                  const record = currentRecord;
                  const isSelected = record?.choiceId === choice.id;
                  const reveal = Boolean(record);
                  const isCorrectChoice = choice.isCorrect;
                  const baseClasses =
                    "flex items-center gap-3 rounded-2xl border bg-white/5 px-4 py-3 text-left transition focus:outline-none";
                  let stateClasses = "hover:bg-white/10";
                  if (reveal) {
                    if (isCorrectChoice) {
                      stateClasses = "border-emerald-400/60 bg-emerald-500/15";
                    } else if (isSelected) {
                      stateClasses = "border-rose-400/70 bg-rose-500/15";
                    } else {
                      stateClasses = "opacity-60";
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
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold">
                        {choice.label.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium leading-snug">{choice.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <form
                className="mt-6 flex flex-col gap-4 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSubmitText();
                }}
              >
                <input
                  type="text"
                  value={answered ? currentRecord?.userAnswer ?? "" : textAnswer}
                  onChange={(event) => setTextAnswer(event.target.value)}
                  disabled={answered}
                  placeholder="Tape ta réponse..."
                  className="flex-1 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm placeholder:text-white/40 focus:border-white focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={answered || !textAnswer.trim()}
                  className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition enabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:bg-white/60"
                >
                  Valider ma réponse
                </button>
              </form>
            )}

            {answered ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm">
                {currentRecord?.correct ? (
                  <span className="text-emerald-300">✔ Bonne réponse !</span>
                ) : (
                  <span className="text-rose-200">
                    ✘ Mauvaise réponse.
                    {currentQuestion.correctLabel ? (
                      <>
                        {" "}Réponse attendue : <span className="font-semibold">{currentQuestion.correctLabel}</span>
                      </>
                    ) : null}
                  </span>
                )}
                {currentRecord?.responseMs && currentRecord.responseMs > 0 ? (
                  <span className="ml-4 text-xs text-white/60">Temps : {currentRecord.responseMs} ms</span>
                ) : null}
              </div>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => navigate("/solo/daily")}
                className="inline-flex items-center justify-center rounded-full border border-white/30 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white transition hover:border-white"
              >
                Retour au calendrier
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!answered}
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2 text-sm font-semibold text-slate-900 transition enabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:bg-white/60"
              >
                {currentIndex + 1 < totalQuestions ? "Question suivante" : "Terminer le défi"}
              </button>
            </div>
          </section>
        )}

        {finished && challenge && (
          <section className="mx-auto mt-10 w-full max-w-4xl space-y-6 text-center">
            <div className="rounded-[26px] border border-white/15 bg-white/10 p-8 shadow-[0_18px_44px_rgba(0,0,0,0.4)] backdrop-blur">
              <div className="text-sm uppercase tracking-[0.35em] text-white/60">Défi complété</div>
              <div className="mt-3 text-3xl font-semibold">
                Score : {correctCount}/{challenge.questionCount}
              </div>
              {typeof totalDuration === "number" ? (
                <div className="mt-1 text-sm text-white/70">Temps total : {totalDuration} ms</div>
              ) : null}
              <p className="mt-4 text-white/75">
                Bravo ! Tu peux rejouer pour améliorer ton score ou revenir au calendrier pour sélectionner un autre défi.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={startChallenge}
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2 text-sm font-semibold text-slate-900 transition hover:scale-[1.02]"
                >
                  Rejouer ce défi
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/solo/daily")}
                  className="inline-flex items-center justify-center rounded-full border border-white/40 px-6 py-2 text-sm font-semibold text-white transition hover:border-white"
                >
                  Retour au calendrier
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/15 bg-[#0f1420]/90 p-6 text-left shadow-[0_16px_32px_rgba(0,0,0,0.45)] backdrop-blur">
              <QuestionRecapList items={recapItems} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}