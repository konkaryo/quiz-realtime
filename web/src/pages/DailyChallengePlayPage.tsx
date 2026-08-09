// web/src/pages/DailyChallengePlayPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useLocation, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import emptyQuestionImg from "../assets/empty_img.jpg";
import { io, Socket } from "socket.io-client";
import QuestionPanel, {
  Choice,
  QuestionLite,
  QuestionProgress,
} from "../components/QuestionPanel";

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");

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
  points?: number;
  averageScore?: number;
  correctRate?: number;
  stats?: { correct: number; correctQcm: number; wrong: number };
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

type DailyRankingSnapshot = {
  year?: number;
  month?: number;
  totalScore: number;
  rank: number | null;
  totalPlayers: number;
  percentile: number | null;
  bands: { label: string; percentile: number; score: number }[];
  distribution: { index: number; count: number; minScore: number; maxScore: number; highlighted: boolean }[];
};

type DailyFinished = {
  score: number;
  results: Result[];
  monthlyRanking?: DailyRankingSnapshot | null;
  dailyRanking?: DailyRankingSnapshot | null;
};

type CompletedResultPayload = {
  score: number;
  completedAt: string;
  questionCount: number;
  results: Result[];
  monthlyRanking?: DailyRankingSnapshot | null;
  dailyRanking?: DailyRankingSnapshot | null;
};

type ChallengeMeta = { date: string; questionCount: number } | null;

type SelfProfile = { playerName?: string | null; displayName?: string | null; img?: string | null } | null;

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

function progressStateFromResult(result: Result): QuestionProgress {
  if (!result.correct) return "wrong";
  return result.mode === "choice" ? "correct-mc" : "correct";
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
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

function formatIntegerFr(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatChallengeDateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function resolveQuestionImageUrl(img: string | null | undefined): string | null {
  if (!img) return null;
  if (/^(?:https?:|data:|blob:)/i.test(img)) return img;
  const path = `/${img.replace(/^\.?\//, "")}`;
  return `${API_BASE.replace(/\/$/, "")}${path}`;
}

function DailyResultPlayerCard({
  score,
  results,
  totalQuestions,
  ranking,
  selfProfile,
}: {
  score: number;
  results: Result[];
  totalQuestions: number;
  ranking: DailyRankingSnapshot | null;
  selfProfile: SelfProfile;
}) {
  const total = Math.max(totalQuestions, results.length);
  const correctCount = results.filter((result) => result.correct).length;
  const totalResponseMs = results.reduce((sum, result) => (Number.isFinite(result.responseMs) && result.responseMs > 0 ? sum + result.responseMs : sum), 0);
  const rank = ranking?.rank ?? 1;
  const percentile = ranking?.percentile !== null && ranking?.percentile !== undefined
    ? Math.max(1, Math.ceil(ranking.percentile))
    : null;
  const accent = rank === 1 ? "#FFD33F" : rank === 2 ? "#91AFFF" : rank === 3 ? "#FF865E" : "#8AA7FF";
  const displayName = selfProfile?.playerName || selfProfile?.displayName || "Joueur";

  return (
    <article
      className="relative w-[254px] max-w-full rounded-[10px] p-px text-center shadow-[0_18px_46px_rgba(0,0,0,0.32)]"
      style={{ background: `linear-gradient(180deg, ${accent} 0%, #11131F 42%)` }}
      aria-label={`Résultat du défi quotidien : ${correctCount} bonnes réponses sur ${total}`}
    >
      <div
        className="absolute -top-4 left-1/2 z-20 grid h-10 w-10 -translate-x-1/2 place-items-center"
        style={{ backgroundColor: accent, clipPath: "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}
      >
        <span className="font-brutal text-[15px] leading-none text-[#11131F]">{rank}</span>
      </div>
      <span className="pointer-events-none absolute inset-px translate-y-1 rounded-[9px]" style={{ backgroundColor: accent }} aria-hidden="true" />

      <div className="relative flex min-h-[312px] flex-col items-center rounded-[9px] bg-[linear-gradient(180deg,#24273C_0%,#151723_100%)] px-5 pb-5 pt-9">
        <div className="grid h-[58px] w-[58px] place-items-center rounded-full" style={{ boxShadow: `0 0 0 2px ${accent}` }}>
          {selfProfile?.img ? (
            <span className="block h-full w-full rounded-full bg-[#D8DCE3] bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url("${selfProfile.img}")` }} aria-hidden="true" />
          ) : (
            <div className="grid h-full w-full place-items-center rounded-full bg-[linear-gradient(135deg,#ff7b5f_0%,#7c5cff_52%,#14244a_100%)] font-inter text-xl font-black text-white">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <h2 className="notranslate mt-3 max-w-full truncate font-inter text-[18px] font-extrabold leading-tight text-white" translate="no" lang="zxx">{displayName}</h2>
        <div className="mt-4 leading-none" style={{ fontFamily: '"Acumin Pro Extra Condensed Bold Italic", "Acumin Pro Extra Condensed", sans-serif', fontStyle: "italic", color: accent }}>
          <span className="text-[34px]">{formatIntegerFr(score)}</span><span className="ml-1 text-[17px]">pts</span>
        </div>

        <div className="mt-4 grid w-full grid-cols-2 gap-2">
          <div className="rounded-[7px] border border-white/[0.09] bg-[#11131f]/25 px-2 py-1.5">
            <div className="font-acuminSemiBold text-[10px] uppercase text-slate-400">Temps</div>
            <div className="mt-1 font-inter text-[13px] font-extrabold tabular-nums text-white">{formatResultSeconds(totalResponseMs)}</div>
          </div>
          <div className="rounded-[7px] border border-white/[0.09] bg-[#11131f]/25 px-2 py-1.5">
            <div className="font-acuminSemiBold text-[10px] uppercase text-slate-400">Score</div>
            <div className="mt-1 font-inter text-[13px] font-extrabold tabular-nums text-white">{correctCount}/{total}</div>
          </div>
        </div>
        {percentile !== null ? (
          <div className="mt-auto flex items-center gap-2 pt-4 font-inter text-[12px] font-extrabold" style={{ color: accent }}>
            <TrendingUp className="h-5 w-5" aria-hidden="true" />Top {percentile}%
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DailyQuestionResultPanel({
  result,
  results,
  index,
  total,
  onSelectIndex,
}: {
  result: Result;
  results: Result[];
  index: number;
  total: number;
  onSelectIndex: (index: number) => void;
}) {
  const ok = result.correct;
  const pointsWon = Math.max(0, result.points ?? 0);
  const responseStats = result.stats ?? { correct: ok && result.mode !== "choice" ? 1 : 0, correctQcm: ok && result.mode === "choice" ? 1 : 0, wrong: ok ? 0 : 1 };
  const responseCount = responseStats.correct + responseStats.correctQcm + responseStats.wrong;
  const segmentTotal = Math.max(1, responseCount);
  const hasNoResponses = responseCount === 0;
  const correctWidth = `${(100 * responseStats.correct) / segmentTotal}%`;
  const qcmWidth = `${(100 * responseStats.correctQcm) / segmentTotal}%`;
  const wrongWidth = `${(100 * responseStats.wrong) / segmentTotal}%`;
  const dummyInputRef = useRef<HTMLInputElement | null>(null);
  const questionPanel: QuestionLite = {
    id: result.questionId,
    text: result.questionText,
    theme: result.theme,
    difficulty: result.difficulty,
    img: result.img,
    slotLabel: result.slotLabel,
  };

  return (
    <div className="flex h-full min-h-0 flex-col items-center pb-24 pt-10 md:pt-12">
      <h2 className="font-brand text-[28px] font-black uppercase italic leading-none tracking-[0.055em] text-white md:text-[34px]">Question {index + 1} / {total}</h2>
      <div className="mt-10 w-full">
        <QuestionPanel
          question={questionPanel}
          index={index}
          totalQuestions={total}
          lives={0}
          totalLives={TEXT_LIVES}
          remainingSeconds={null}
          timerProgress={0}
          isReveal={false}
          isPlaying={false}
          inputRef={dummyInputRef}
          textAnswer=""
          wrongTextAnswer={null}
          textLocked
          onChangeText={() => {}}
          onSubmitText={() => {}}
          onShowChoices={() => {}}
          feedback={null}
          feedbackResponseMs={null}
          feedbackWasCorrect={null}
          feedbackCorrectLabel={result.correctLabel}
          feedbackPoints={null}
          reserveFeedbackSpace
          thumbButtonBackgroundClass="bg-[#191c2c]"
          qcmChoiceBackgroundClass="bg-[#272b40] hover:bg-[#30354a] active:bg-[#373c55]"
          answerMode={null}
          choicesRevealed={false}
          showChoices={false}
          choices={null}
          selectedChoice={null}
          correctChoiceId={null}
          onSelectChoice={() => {}}
          questionProgress={[]}
          showTimer={false}
          showAnswerSection={false}
          showProgress={false}
          animateQuestionText={false}
        />
      </div>

      <div className="mt-10 grid w-full max-w-[560px] grid-cols-[1fr_auto_1fr] items-center">
        <div className="flex items-center justify-end gap-3 pr-3">
          <span className="text-[13px] font-semibold tabular-nums text-white/70">+{pointsWon} pts</span>
          <span className="text-white/35" aria-hidden>|</span>
        </div>
        <div className="inline-flex items-center rounded-[6px] border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-[13px] font-semibold text-slate-50">
          {result.correctLabel ?? "—"}
        </div>
        <div className="flex items-center gap-3 pl-3">
          <span className="text-white/35" aria-hidden>|</span>
          <span className="text-[13px] font-semibold tabular-nums text-white/70">{Math.max(0, result.responseMs)} ms</span>
        </div>
      </div>
      <div className="mx-auto mt-10 w-[420px] max-w-full space-y-4">
        <div className="flex items-center gap-2">
          {hasNoResponses ? <div className="h-[10px] w-full rounded-[3px] bg-slate-500" /> : null}
          {responseStats.correct > 0 ? <div className="h-[10px] min-w-[14px] rounded-[3px] bg-emerald-600" style={{ width: correctWidth }} /> : null}
          {responseStats.correctQcm > 0 ? <div className="h-[10px] min-w-[14px] rounded-[3px] bg-[#6F5BD4]" style={{ width: qcmWidth }} /> : null}
          {responseStats.wrong > 0 ? <div className="h-[10px] min-w-[14px] rounded-[3px] bg-[#AF2D33]" style={{ width: wrongWidth }} /> : null}
        </div>
        <div className="flex items-center gap-2 text-white">
          {hasNoResponses ? (
            <div className="inline-flex w-full items-center justify-center gap-3" aria-label="Aucune réponse">
              <span className="inline-flex h-5 items-center tabular-nums text-[18px] font-brand italic leading-none">0</span>
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-slate-500 text-[12px] font-semibold leading-none text-white">-</span>
            </div>
          ) : null}
          {responseStats.correct > 0 ? (
            <div className="inline-flex items-center justify-center gap-3" style={{ width: correctWidth }} aria-label="Bonnes réponses">
              <span className="inline-flex h-5 items-center tabular-nums text-[18px] font-brand italic leading-none">{responseStats.correct}</span>
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-emerald-600 text-[12px] font-semibold leading-none text-white">✓</span>
            </div>
          ) : null}
          {responseStats.correctQcm > 0 ? (
            <div className="inline-flex items-center justify-center gap-3" style={{ width: qcmWidth }} aria-label="Réponses QCM">
              <span className="inline-flex h-5 items-center tabular-nums text-[18px] font-brand italic leading-none">{responseStats.correctQcm}</span>
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-[#6F5BD4] text-[12px] font-semibold leading-none text-white">⚡︎</span>
            </div>
          ) : null}
          {responseStats.wrong > 0 ? (
            <div className="inline-flex items-center justify-center gap-3" style={{ width: wrongWidth }} aria-label="Mauvaises réponses">
              <span className="inline-flex h-5 items-center tabular-nums text-[18px] font-brand italic leading-none">{responseStats.wrong}</span>
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-[#AF2D33] text-[12px] font-semibold leading-none text-white">✕</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="order-last mt-auto flex flex-wrap items-center justify-center gap-2 pt-14">
        {Array.from({ length: total }, (_, itemIndex) => {
          const item = results[itemIndex];
          const state = item?.correct ? (item.mode === "choice" ? "correct-mc" : "correct") : "wrong";
          const colorClass = state === "correct" ? "bg-emerald-600 text-white" : state === "correct-mc" ? "bg-[#6F5BD4] text-white" : "bg-[#AF2D33] text-white";
          return <button key={itemIndex} type="button" onClick={() => onSelectIndex(itemIndex)} className={`flex h-8 w-8 items-center justify-center rounded-[7px] text-[12px] font-semibold transition-all hover:ring-2 hover:ring-white/70 ${colorClass} ${itemIndex === index ? "ring-2 ring-white/70" : ""}`} aria-label={`Voir question ${itemIndex + 1}`}>{itemIndex + 1}</button>;
        })}
      </div>
    </div>
  );
}

function DailyFinalResults({
  results,
  totalQuestions,
  monthlyRanking,
  score,
  challengeDate,
}: {
  results: Result[];
  totalQuestions: number;
  monthlyRanking: DailyRankingSnapshot | null;
  score: number;
  challengeDate: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const maxIndex = results.length;
  const selectedResult = selectedIndex > 0 ? results[selectedIndex - 1] : null;
  const selectedResultImage = resolveQuestionImageUrl(selectedResult?.img);
  const challengeDateLabel = formatChallengeDateLabel(challengeDate);
  const [selfProfile, setSelfProfile] = useState<SelfProfile>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { user?: SelfProfile };
      })
      .then((payload) => {
        if (!cancelled) setSelfProfile(payload?.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setSelfProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setSelectedIndex((current) =>
        event.key === "ArrowLeft"
          ? Math.max(0, current - 1)
          : Math.min(maxIndex, current + 1),
      );
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [maxIndex]);

  return (
    <section className="relative h-full min-h-0 px-12 md:px-16">
      {selectedResultImage ? (
        <aside className="fixed bottom-0 right-0 z-20 hidden lg:block" style={{ top: FIXED_TOP, width: RIGHT_IMAGE_WIDTH }}>
          <div className="h-full overflow-visible bg-transparent pb-3 pl-3 pr-6 pt-3">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#131829]">
              <img
                src={selectedResultImage}
                alt="Illustration de la question récapitulée"
                className="h-full w-full object-cover"
                loading="lazy"
                draggable={false}
                onError={(event) => {
                  event.currentTarget.src = emptyQuestionImg;
                }}
              />
            </div>
          </div>
        </aside>
      ) : null}
      <button
        type="button"
        onClick={() => setSelectedIndex((current) => Math.max(0, current - 1))}
        disabled={selectedIndex === 0}
        className="absolute left-0 z-30 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#131829] text-white transition hover:border-white/35 hover:bg-[#1B2136] disabled:cursor-not-allowed disabled:opacity-25 md:left-[10%] xl:left-[12%]"
        style={{ top: `calc((100dvh - ${NAVBAR_TOP}px - ${TOP_BAR_H}px) / 2 - 40px)` }}
        aria-label="Afficher l’élément précédent"
      >
        <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
      </button>
      <button
        type="button"
        onClick={() => setSelectedIndex((current) => Math.min(maxIndex, current + 1))}
        disabled={selectedIndex >= maxIndex}
        className="absolute right-0 z-30 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#131829] text-white transition hover:border-white/35 hover:bg-[#1B2136] disabled:cursor-not-allowed disabled:opacity-25 md:right-[10%] xl:right-[12%]"
        style={{ top: `calc((100dvh - ${NAVBAR_TOP}px - ${TOP_BAR_H}px) / 2 - 40px)` }}
        aria-label="Afficher l’élément suivant"
      >
        <ChevronRight className="h-6 w-6" strokeWidth={2.2} />
      </button>

      {selectedResult ? (
        <DailyQuestionResultPanel result={selectedResult} results={results} index={selectedIndex - 1} total={results.length} onSelectIndex={(index) => setSelectedIndex(index + 1)} />
      ) : (
        <div className="flex h-full min-h-0 flex-col items-center pb-24 pt-10 text-center md:pt-12">
          <h2 className="font-brand text-[28px] font-black uppercase italic leading-none tracking-[0.055em] text-white md:text-[34px]">Résultats - {challengeDateLabel}</h2>
          <div className="mt-16">
            <DailyResultPlayerCard score={score} results={results} totalQuestions={totalQuestions} ranking={monthlyRanking} selfProfile={selfProfile} />
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-center gap-2 pt-14">
            {results.map((result, index) => {
              const state = result.correct ? (result.mode === "choice" ? "correct-mc" : "correct") : "wrong";
              const colorClass = state === "correct" ? "bg-emerald-600" : state === "correct-mc" ? "bg-[#6F5BD4]" : "bg-[#AF2D33]";
              return (
                <button key={`${result.questionId}:${index}`} type="button" onClick={() => setSelectedIndex(index + 1)} className={`flex h-8 w-8 items-center justify-center rounded-[7px] text-[12px] font-semibold text-white transition hover:ring-2 hover:ring-white/70 ${colorClass}`} aria-label={`Voir question ${index + 1}`}>{index + 1}</button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// Main component -------------------------------------------------------------

export default function DailyChallengePlayPage() {
  const params = useParams<{ date?: string }>();
  const location = useLocation();
  const dateParam = params.date ?? "";
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam);
  const completedInfoFromNavigation = (
    location.state as { completedInfo?: CompletedInfo } | null
  )?.completedInfo;
  const completedInfoFromStorage = validDate
    ? readStorage()[dateParam]
    : undefined;
  const [serverCompleted, setServerCompleted] =
    useState<CompletedResultPayload | null>(null);
  const [completedLookupDone, setCompletedLookupDone] = useState(!validDate);
  const completedInfo = completedInfoFromNavigation ?? completedInfoFromStorage;
  const shouldShowStoredResults = Boolean(completedInfo || serverCompleted);

  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    !validDate ? "error" : shouldShowStoredResults ? "ready" : "loading",
  );
  const [error, setError] = useState<string | null>(validDate ? null : "Défi introuvable");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("idle");
  const [challengeMeta, setChallengeMeta] = useState<ChallengeMeta>(null);
  const [index, setIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(completedInfo?.questionStates?.length ?? 0);
  const [phase, setPhase] = useState<"idle" | "playing" | "reveal" | "finished">(shouldShowStoredResults ? "finished" : "idle");
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
  const [dailyRanking, setDailyRanking] = useState<DailyRankingSnapshot | null>(
    serverCompleted?.dailyRanking ?? null,
  );
  const [points, setPoints] = useState(completedInfo?.score ?? 0);
  const [skew, setSkew] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [questionProgress, setQuestionProgress] = useState<QuestionProgress[]>(completedInfo?.questionStates ?? []);

  const phaseRef = useRef<"idle" | "playing" | "reveal" | "finished">(shouldShowStoredResults ? "finished" : "idle");
  const answerModeRef = useRef<"text" | "choice" | null>(null);
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
    answerModeRef.current = answerMode;
  }, [answerMode]);

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
    setCompletedLookupDone(false);

    fetch(`${API_BASE}/daily/results/${dateParam}`, { credentials: "include" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404 || res.status === 401) {
          setCompletedLookupDone(true);
          return;
        }
        if (!res.ok) throw new Error("daily_result_lookup_failed");
        const payload = (await res.json()) as {
          completed?: CompletedResultPayload;
        };
        if (!payload.completed) {
          setCompletedLookupDone(true);
          return;
        }
        setServerCompleted(payload.completed);
        setResults(payload.completed.results);
        setDailyRanking(payload.completed.dailyRanking ?? null);
        setPoints(payload.completed.score);
        setTotalQuestions(payload.completed.questionCount);
        setQuestionProgress(payload.completed.results.map(progressStateFromResult));
        setPhase("finished");
        phaseRef.current = "finished";
        setStatus("ready");
        setCompletedLookupDone(true);
      })
      .catch(() => {
        if (cancelled) return;
        setCompletedLookupDone(true);
      });

    return () => {
      cancelled = true;
    };
  }, [dateParam, validDate]);

  useEffect(() => {
    if (!validDate || shouldShowStoredResults || !completedLookupDone) return;
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
      answerModeRef.current = null;
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
        next[p.index] = wasCorrect
          ? answerModeRef.current === "choice"
            ? "correct-mc"
            : "correct"
          : "wrong";
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
      setDailyRanking(p.dailyRanking ?? null);
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
  }, [dateParam, validDate, shouldShowStoredResults, completedLookupDone]);

  useEffect(() => {
    if (phase === "playing") inputRef.current?.focus();
  }, [phase, question]);

  const timerProgress = useMemo(() => {
    if (remainingSeconds === null) return 1;
    return Math.max(0, Math.min(1, remainingSeconds / (QUESTION_DURATION_MS / 1000)));
  }, [remainingSeconds]);

  const textLocked = choicesRevealed || showChoices;
  const shouldConfirmDeparture = status === "ready" && (phase === "playing" || phase === "reveal");
  const navigationBlocker = useBlocker(shouldConfirmDeparture);

  useEffect(() => {
    if (!shouldConfirmDeparture) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldConfirmDeparture]);

  useEffect(() => {
    if (navigationBlocker.state !== "blocked") return;
    const confirmed = window.confirm(
      "Quitter le défi ? Les questions restantes seront considérées comme mal répondues.",
    );
    if (!confirmed) {
      navigationBlocker.reset();
      return;
    }
    if (!socket?.connected) {
      navigationBlocker.proceed();
      return;
    }
    socket.emit("daily_abandon", (response: { ok: boolean }) => {
      if (response?.ok || navigationBlocker.state === "blocked") navigationBlocker.proceed();
    });
  }, [navigationBlocker, socket]);

  const submitText = () => {
    if (phaseRef.current !== "playing" || !question || !socket) return;
    if (choicesRevealed || showChoices) return;
    const value = textAnswer.trim();
    if (!value) return;
    setAnswerMode("text");
    answerModeRef.current = "text";
    socket.emit("daily_submit_answer_text", { text: value });
  };

  const onSelectChoice = (choice: Choice) => {
    if (!socket || phaseRef.current !== "playing" || selectedChoice) return;
    setSelectedChoice(choice.id);
    setAnswerMode("choice");
    answerModeRef.current = "choice";
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
    answerModeRef.current = "text";
    setChoicesRevealed(true);
    socket.emit("daily_skip_question", (res: { ok: boolean; reason?: string }) => {
      if (res?.ok) return;
      setChoicesRevealed(false);
      setAnswerMode(null);
      answerModeRef.current = null;
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
    <div className={`relative overflow-hidden text-slate-50 ${phase === "finished" ? `h-[calc(100dvh-${NAVBAR_TOP}px)]` : "min-h-full"}`}>
      <div aria-hidden className="fixed inset-0 bg-[#11131f]" />

      <div
        className={[
          "relative z-10 mx-auto flex flex-col px-4 sm:px-8 lg:px-10",
          phase === "finished"
            ? "h-full w-full max-w-[1500px] pb-8 pt-8"
            : "max-w-6xl pb-16 pt-8",
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
                <div className="overflow-hidden rounded-xl bg-[#131829]">
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
    thumbButtonBackgroundClass="bg-[#191c2c]"
    skipButtonPlacement="below-progress"
  />
)}

        {phase === "finished" && (
          <DailyFinalResults
            results={results}
            totalQuestions={totalQuestions}
            monthlyRanking={dailyRanking}
            score={points}
            challengeDate={dateParam}
          />
        )}
      </div>
    </div>
  );
}
