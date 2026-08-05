// web/src/pages/RoomPage.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePersistentGameInputFocus } from "../hooks/usePersistentGameInputFocus";
import type React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { initSfx, playCorrect } from "../sfx";
import { FinalLeaderboard } from "../components/FinalLeaderboard";
import emptyQuestionImg from "../assets/empty_img.jpg";
import crownImage from "../assets/crown.png";
import QuestionPanel, {
  Choice as QuestionPanelChoice,
  OverwatchTimerBadge,
  QuestionProgress as QuestionPanelProgress,
} from "../components/QuestionPanel";
import { getLevelFromExperience } from "../utils/experience";
import { ArrowUp, Crosshair, ChevronLeft, ChevronRight, LogOut, Play, Users } from "lucide-react";

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");
const TEXT_LIVES = Number(import.meta.env.VITE_TEXT_LIVES ?? 3);
const PROFILE_AVATAR_UPDATED_EVENT = "profile-avatar-updated";

type ChoiceLite = { id: string; label: string };
type QuestionLite = {
  id: string;
  text: string;
  img?: string | null;
  theme?: string | null;
  difficulty?: number | null;
};
type Phase = "idle" | "countdown" | "playing" | "reveal" | "between" | "final";

function CountdownLevelShield({ level }: { level: number }) {
  return (
    <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center text-white drop-shadow-[0_6px_14px_rgba(0,0,0,0.35)]">
      <svg
        viewBox="0 0 72 72"
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M36 3 64.6 19.5v33L36 69 7.4 52.5v-33L36 3z"
          fill="#172033"
          stroke="#8b5cf6"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="relative z-10 font-inter text-[14px] font-black leading-none">{level}</span>
    </span>
  );
}

type LeaderRow = {
  id: string;
  playerId?: string | null;
  name: string;
  score: number;
  img?: string | null;
  bits?: number;
  xp?: number;
  experience?: number;
};
type RoomMeta = {
  id: string;
  code: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  name?: string | null;
  image?: string | null;
  ownerId?: string | null;
  manualQuestionLaunch?: boolean;
};
type AnsweredStatus = "correct" | "correct-mc" | "wrong";
type QuestionStatus = "pending" | "correct" | "correct-mc" | "wrong";
type FinalQuestionStats = { correct: number; correctQcm: number; wrong: number };
type FinalQuestionSnapshot = {
  questionId: string;
  index: number;
  text: string;
  img?: string | null;
  theme?: string | null;
  correctLabel?: string | null;
};

function maskRoomCode(code: string | null | undefined) {
  const normalized = (code ?? "").trim();
  if (!normalized) return "—";
  return "****";
}

function FinalCountdownRing({ seconds, progress }: { seconds: number; progress: number }) {
  const normalizedSeconds = Math.max(0, Math.floor(seconds));

  return (
    <div className="w-full rounded-xl border border-white/[0.06] bg-[#131829] px-4 pb-4 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_18px_42px_rgba(0,0,0,0.28)]">
      <h3 className="font-acumin text-[12px] font-semibold uppercase tracking-[0.06em] text-white">PROCHAINE PARTIE</h3>

      <div className="mt-5 flex justify-center">
        <div className="scale-[1.18]">
          <OverwatchTimerBadge
            seconds={normalizedSeconds}
            progress={progress}
            segmentColor="#8E63FF"
            textClassName="font-acumin text-[22px] font-bold leading-[0.9] text-white"
          />
        </div>
      </div>
    </div>
  );
}

/* Récapitulatif final (affiché à gauche uniquement en phase 'final') */
type RecapItem = {
  index: number;
  questionId: string;
  text: string;
  img?: string | null;
  theme?: string | null;
  correctLabel?: string | null;
  yourAnswer?: string | null;
  correct: boolean;
  responseMs: number;
  points: number;
};

/* ============================== UI PRIMITIVES ============================== */

function SmallPill({ label, value }: { label: string; value: string | number }) {
  const valueStr = String(value);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 min-w-0 overflow-hidden">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
        {label}
      </div>

      <div
        className="mt-0.5 text-[12px] font-semibold tabular-nums text-white overflow-hidden text-ellipsis whitespace-nowrap"
        title={valueStr}
      >
        {valueStr}
      </div>
    </div>
  );
}

function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-white/55">
        {children}
      </div>
      {right ? <div className="text-[12px] text-white/55">{right}</div> : null}
    </div>
  );
}

function PlayerCell({
  row,
  accentColor,
  onNameClick,
}: {
  row: LeaderRow;
  accentColor: string;
  onNameClick?: (row: LeaderRow) => void;
}) {
  const canNavigate = !!onNameClick && !!row.playerId;

  const nameClasses = [
    "truncate text-[13px] font-semibold",
    canNavigate ? "cursor-pointer hover:underline" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="relative w-full max-w-full overflow-visible">
      <span aria-hidden className="absolute inset-0 translate-y-1 rounded-[6px]" style={{ backgroundColor: accentColor }} />
      <div
        className={[
          "relative z-10 w-full min-w-0 flex items-center justify-between gap-3",
          "rounded-[6px]",
          "py-1 pl-3 pr-4",
          "overflow-hidden",
          "text-white",
        ].join(" ")}
        style={{
          background: "#2A2E44",
        }}
      >
        {/* Avatar + Nom */}
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          {row.img ? (
            <img
              src={row.img}
              alt=""
              className="w-7 h-7 rounded-[3px] object-cover flex-shrink-0"
              draggable={false}
              loading="lazy"
            />
          ) : (
            <div className="w-7 h-7 rounded-[3px] bg-white/10 flex-shrink-0" />
          )}

          <div className="min-w-0 -translate-y-[3px] leading-tight overflow-hidden">
            {canNavigate ? (
              <button
                type="button"
                onClick={() => onNameClick?.(row)}
                className={nameClasses}
              >
                {row.name}
              </button>
            ) : (
              <div className={nameClasses}>{row.name}</div>
            )}

              <div className="text-[11px] text-white/75">
              Niveau {getLevelFromExperience(row.experience ?? 0)}
            </div>
          </div>
        </div>

        {/* Score */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="tabular-nums text-[13px] font-semibold text-white/90">
            {row.score}
          </span>
        </div>
      </div>
    </div>
  );
}


/* ============================== PAGE ============================== */

export default function RoomPage() {
  const nav = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();

  const handlePlayerProfile = (row: LeaderRow) => {
    if (!row.playerId) return;
    nav(`/players/${row.playerId}/profile`);
  };


  const [socket, setSocket] = useState<Socket | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  const [answeredByPg, setAnsweredByPg] = useState<
    Record<string, AnsweredStatus>
  >({});
  const [question, setQuestion] = useState<QuestionLite | null>(null);
  const [dynamicQuestionDisplay, setDynamicQuestionDisplay] = useState(true);
  const [manualQuestionLaunch, setManualQuestionLaunch] = useState(false);
  const [manualNextAvailable, setManualNextAvailable] = useState(false);
  const [manualNextPending, setManualNextPending] = useState(false);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);

  const [mcChoices, setMcChoices] = useState<ChoiceLite[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [wrongTextAnswer, setWrongTextAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackResponseMs, setFeedbackResponseMs] = useState<number | null>(
    null
  );
  const [feedbackWasCorrect, setFeedbackWasCorrect] = useState<boolean | null>(
    null
  );
  const [feedbackCorrectLabel, setFeedbackCorrectLabel] = useState<string | null>(
    null
  );
  const [answerMode, setAnswerMode] = useState<"text" | "choice" | null>(null);
  const [feedbackPoints, setFeedbackPoints] = useState<number | null>(null);
  const [choicesRevealed, setChoicesRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastSubmittedTextRef = useRef<string>("");
  const answerModeRef = useRef<"text" | "choice" | null>(null);
  const feedbackWasCorrectRef = useRef<boolean | null>(null);
  const indexRef = useRef(0);
  const totalRef = useRef(0);

  const [lives, setLives] = useState<number>(TEXT_LIVES);
  const livesRef = useRef<number>(TEXT_LIVES);

  const mcChoicesRef = useRef<ChoiceLite[] | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [bitsByPgId, setBitsByPgId] = useState<Record<string, number>>({});
  const [xpByPgId, setXpByPgId] = useState<Record<string, number>>({});
  const [selfId, setSelfId] = useState<string | null>(null);
  const [selfPlayerId, setSelfPlayerId] = useState<string | null>(null);
  const [selfName, setSelfName] = useState<string | null>(null);
  const avatarOverridesRef = useRef<Record<string, string>>({});
  const [questionStatuses, setQuestionStatuses] = useState<QuestionStatus[]>([]);
  const [rankPulseKey, setRankPulseKey] = useState(0);
  const rankRef = useRef<number | null>(null);
  const [displayScore, setDisplayScore] = useState(0);
  const displayScoreRef = useRef(0);
  const scoreAnimationRef = useRef<number | null>(null);
  const leaderboardRef = useRef<HTMLOListElement | null>(null);
  const [keepSelfCentered, setKeepSelfCentered] = useState(false);
  const [isLeaderboardTargetingPaused, setIsLeaderboardTargetingPaused] = useState(false);
  const leaderboardTargetingTimerRef = useRef<number | null>(null);
  const isProgrammaticLeaderboardScrollRef = useRef(false);


  const [roomMeta, setRoomMeta] = useState<RoomMeta | null>(null);
  const [isRoomCodeVisible, setIsRoomCodeVisible] = useState(false);

  /* ---- recap des questions reçu en fin de partie ---- */
  const [finalRecap, setFinalRecap] = useState<RecapItem[] | null>(null);
  const [finalQuestionSnapshots, setFinalQuestionSnapshots] = useState<FinalQuestionSnapshot[]>([]);
  const [selectedFinalIndex, setSelectedFinalIndex] = useState(0);

  // ✅ Top 10 visibles (le reste accessible via scroll)
  const LB_VISIBLE = 10;

  const selfIndex = useMemo(() => {
    return leaderboard.findIndex(
      (r) =>
        (selfId && r.id === selfId) ||
        (!!selfName &&
          typeof r.name === "string" &&
          r.name.toLowerCase() === selfName.toLowerCase())
    );
  }, [leaderboard, selfId, selfName]);
  const selfRow = selfIndex >= 0 ? leaderboard[selfIndex] : null;

  /* -------- timer bar (inversée) -------- */
  const [skew, setSkew] = useState(0);
  const nowServer = () => Date.now() + skew;

  // timing
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [roundStartedAt, setRoundStartedAt] = useState<number | null>(null);
  const [roundDuration, setRoundDuration] = useState<number | null>(null);
  const [finalEndsAt, setFinalEndsAt] = useState<number | null>(null);
  const [finalDuration, setFinalDuration] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [gameCountdown, setGameCountdown] = useState<number | null>(null);
  const [gameCountdownTotal, setGameCountdownTotal] = useState<number | null>(null);
  const [gameCountdownEndsAt, setGameCountdownEndsAt] = useState<number | null>(null);
  const [gameCountdownDuration, setGameCountdownDuration] = useState<number | null>(null);
  const [countdownPlayerPage, setCountdownPlayerPage] = useState(0);


  const remaining = useMemo(
    () => (endsAt ? Math.max(0, Math.ceil((endsAt - nowServer()) / 1000)) : null),
    [endsAt, nowTick, skew]
  );

  const finalRemaining = useMemo(
    () =>
      finalEndsAt
        ? Math.max(0, Math.ceil((finalEndsAt - nowServer()) / 1000))
        : null,
    [finalEndsAt, nowTick, skew]
  );

  const timerProgress = useMemo(() => {
    if (!endsAt || !roundDuration) return 0;
    const remainingMs = Math.max(0, endsAt - nowServer());
    const progress = remainingMs / roundDuration;
    return Math.min(1, Math.max(0, progress));
  }, [endsAt, roundDuration, nowTick, skew]);

  const finalProgress = useMemo(() => {
    if (!finalEndsAt || !finalDuration) return 0;
    const remainingMs = Math.max(0, finalEndsAt - nowServer());
    const progress = remainingMs / finalDuration;
    return Math.min(1, Math.max(0, progress));
  }, [finalEndsAt, finalDuration, nowTick, skew]);

  const questionRevealStartedAtMs = useMemo(
    () => (roundStartedAt !== null ? roundStartedAt - skew : null),
    [roundStartedAt, skew]
  );

  const gameCountdownRemainingSeconds = useMemo(() => {
    if (!gameCountdownEndsAt) return gameCountdown;
    return Math.max(0, Math.ceil((gameCountdownEndsAt - nowServer()) / 1000));
  }, [gameCountdownEndsAt, gameCountdown, nowTick, skew]);

  const gameCountdownProgress = useMemo(() => {
    if (!gameCountdownEndsAt || !gameCountdownDuration || gameCountdownDuration <= 0) return 0;
    const remainingMs = Math.max(0, gameCountdownEndsAt - nowServer());
    const progress = remainingMs / gameCountdownDuration;
    return Math.min(1, Math.max(0, progress));
  }, [gameCountdownEndsAt, gameCountdownDuration, nowTick, skew]);

  const countdownPlayers = useMemo(
    () =>
      [...leaderboard].sort((a, b) => {
        const levelDelta = getLevelFromExperience(b.experience ?? 0) - getLevelFromExperience(a.experience ?? 0);
        if (levelDelta !== 0) return levelDelta;
        const scoreDelta = (b.score ?? 0) - (a.score ?? 0);
        if (scoreDelta !== 0) return scoreDelta;
        return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
      }),
    [leaderboard]
  );
  const countdownPlayerPageCount = Math.max(1, Math.ceil(countdownPlayers.length / 5));
  const isGameCountdownActive = gameCountdown !== null;
  const visibleCountdownPlayers = useMemo(
    () => countdownPlayers.slice(countdownPlayerPage * 5, countdownPlayerPage * 5 + 5),
    [countdownPlayerPage, countdownPlayers]
  );
  const shouldHideLeftRail = phase !== "final" && gameCountdown !== null;
  const shouldHideRightQuestionImage = phase === "final" || gameCountdown !== null;

  const applyAvatarOverrides = (rows: LeaderRow[]) => {
    const overrides = avatarOverridesRef.current;
    if (!rows.length || !Object.keys(overrides).length) return rows;
    return rows.map((row) => {
      const playerId = row.playerId ?? "";
      const override = playerId ? overrides[playerId] : null;
      return override ? { ...row, img: override } : row;
    });
  };

  useEffect(() => {
    if (!endsAt && !finalEndsAt && !gameCountdownEndsAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt, finalEndsAt, gameCountdownEndsAt]);

  useEffect(() => {
    if (!gameCountdownEndsAt) return;

    let frame = 0;
    const tick = () => {
      setNowTick(Date.now());
      if (gameCountdownEndsAt - nowServer() > 0) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [gameCountdownEndsAt, skew]);

  useEffect(() => {
    if (gameCountdown === null) return;
    const id = setTimeout(() => {
      setGameCountdown((prev) => (prev !== null ? (prev > 0 ? prev - 1 : null) : null));
    }, 1000);
    return () => clearTimeout(id);
  }, [gameCountdown]);

  useEffect(() => {
    setCountdownPlayerPage((page) =>
      isGameCountdownActive ? Math.min(page, countdownPlayerPageCount - 1) : 0
    );
  }, [countdownPlayerPageCount, isGameCountdownActive]);

  useEffect(() => {
    if (!isGameCountdownActive || countdownPlayerPageCount <= 1) return;

    const handleCountdownPlayersNavigation = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCountdownPlayerPage((page) =>
          (page - 1 + countdownPlayerPageCount) % countdownPlayerPageCount
        );
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setCountdownPlayerPage((page) => (page + 1) % countdownPlayerPageCount);
      }
    };

    window.addEventListener("keydown", handleCountdownPlayersNavigation);
    return () => window.removeEventListener("keydown", handleCountdownPlayersNavigation);
  }, [isGameCountdownActive, countdownPlayerPageCount]);


  useEffect(() => {
    if (mcChoices) setChoicesRevealed(true);
  }, [mcChoices]);

  /* ----------------------------- effects ----------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const u = data?.user ?? {};
        if (typeof u.id === "string") setSelfId(u.id);
        if (typeof u.playerId === "string") setSelfPlayerId(u.playerId);
        if (typeof u.displayName === "string") setSelfName(u.displayName);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ img?: string | null; playerId?: string | null }>;
      const nextImg = customEvent.detail?.img;
      const playerId = customEvent.detail?.playerId ?? selfPlayerId;
      if (!nextImg || !playerId) return;
      avatarOverridesRef.current = { ...avatarOverridesRef.current, [playerId]: nextImg };
      setLeaderboard((prev) =>
        prev.map((row) => (row.playerId === playerId ? { ...row, img: nextImg } : row))
      );
    };
    window.addEventListener(PROFILE_AVATAR_UPDATED_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(PROFILE_AVATAR_UPDATED_EVENT, handler as EventListener);
    };
  }, [selfPlayerId]);

  useEffect(() => {
    if (!selfPlayerId || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(`profile-avatar:${selfPlayerId}`);
    if (!stored) return;
    avatarOverridesRef.current = { ...avatarOverridesRef.current, [selfPlayerId]: stored };
    setLeaderboard((prev) =>
      prev.map((row) => (row.playerId === selfPlayerId ? { ...row, img: stored } : row))
    );
  }, [selfPlayerId]);

  useEffect(() => {
    if (!roomId) return;

    const s = io(SOCKET_URL, {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    setSocket(s);

    s.on("room_closed", ({ roomId: rid }: { roomId: string }) => {
      if (rid === roomId) {
        alert("La room a été fermée.");
        s.close();
        nav("/");
      }
    });

    s.on("room_deleted", ({ roomId: rid }: { roomId: string }) => {
      if (rid === roomId) {
        alert("La room a été supprimée.");
        s.close();
        nav("/");
      }
    });

    s.on("return_to_lobby", ({ roomId: rid }: { roomId: string }) => {
      if (rid === roomId) {
        nav(`/rooms/${rid}/lobby`);
      }
    });

    s.on(
      "game_countdown",
      (p: { seconds?: number; endsAt?: number; serverNow?: number; leaderboard?: LeaderRow[] }) => {
        const nextSkew =
          typeof p.serverNow === "number" ? p.serverNow - Date.now() : skew;
        if (typeof p.serverNow === "number") setSkew(nextSkew);

        const countdownDurationSeconds =
          typeof p.endsAt === "number"
            ? Math.max(1, Math.ceil((p.endsAt - (Date.now() + nextSkew)) / 1000))
            : Math.max(1, Math.floor(p.seconds ?? 5));
        const countdownEndsAt =
          typeof p.endsAt === "number"
            ? p.endsAt
            : Date.now() + nextSkew + countdownDurationSeconds * 1000;

        setPhase("countdown");
        setGameCountdown(countdownDurationSeconds);
        setGameCountdownTotal(countdownDurationSeconds);
        setGameCountdownEndsAt(countdownEndsAt);
        setGameCountdownDuration(countdownDurationSeconds * 1000);
        if (Array.isArray(p.leaderboard)) setLeaderboard(applyAvatarOverrides(p.leaderboard));
        setQuestion(null);
        setRoundStartedAt(null);
        setMcChoices(null);
        setSelected(null);
        setTextAnswer("");
        setWrongTextAnswer(null);
        lastSubmittedTextRef.current = "";
        setCorrectId(null);
        setFeedback(null);
        setFeedbackResponseMs(null);
        setFeedbackWasCorrect(null);
        setFeedbackCorrectLabel(null);
        setFeedbackPoints(null);
        setAnswerMode(null);
        setChoicesRevealed(false);
        setFinalRecap(null);
        setFinalQuestionSnapshots([]);
        setPending(false);
        setQuestionStatuses([]);
      }
    );

    s.on(
      "round_begin",
      (p: {
        index: number;
        total: number;
        startedAt?: number;
        endsAt: number;
        durationMs?: number;
        question: QuestionLite;
        dynamicQuestionDisplay?: boolean;
        manualQuestionLaunch?: boolean;
        serverNow?: number;
      }) => {
        const nextSkew = typeof p.serverNow === "number" ? p.serverNow - Date.now() : skew;
        if (typeof p.serverNow === "number") setSkew(nextSkew);

        setGameCountdown(null);
        setGameCountdownTotal(null);
        setGameCountdownEndsAt(null);
        setGameCountdownDuration(null);
        setPhase("playing");
        setIndex(p.index);
        setTotal(p.total);
        indexRef.current = p.index;
        totalRef.current = p.total;
        const serverNow = Date.now() + nextSkew;
        const startedAt = typeof p.startedAt === "number" ? p.startedAt : serverNow;
        const durationMs =
          typeof p.durationMs === "number" ? Math.max(0, p.durationMs) : Math.max(0, p.endsAt - startedAt);
        setEndsAt(p.endsAt);
        setRoundStartedAt(startedAt);
        setFinalEndsAt(null);
        setFinalDuration(null);

        setRoundDuration(durationMs);

        setDynamicQuestionDisplay(p.dynamicQuestionDisplay ?? true);
        setManualQuestionLaunch(p.manualQuestionLaunch ?? false);
        setManualNextAvailable(false);
        setManualNextPending(false);
        setQuestion(p.question);
        setAnsweredByPg({});
        setSelected(null);
        setCorrectId(null);
        setMcChoices(() => {
          mcChoicesRef.current = null;
          return null;
        });
        setTextAnswer("");
        setWrongTextAnswer(null);
        lastSubmittedTextRef.current = "";
        setFeedback(null);
        setFeedbackResponseMs(null);
        setFeedbackWasCorrect(null);
        setFeedbackCorrectLabel(null);
        setFeedbackPoints(null);
        setAnswerMode(null);
        setChoicesRevealed(false);
        setLives(() => {
          livesRef.current = TEXT_LIVES;
          return TEXT_LIVES;
        });
        setFinalRecap(null);
        setFinalQuestionSnapshots((prev) => {
          const next = Array.from({ length: p.total }, (_, idx) => prev[idx] ?? null);
          const existing = next[p.index];
          next[p.index] = {
            questionId: p.question.id,
            index: p.index,
            text: p.question.text,
            img: p.question.img ?? existing?.img ?? null,
            theme: p.question.theme ?? existing?.theme ?? null,
            correctLabel: existing?.correctLabel ?? null,
          };
          return next.filter((item): item is FinalQuestionSnapshot => !!item);
        });
        setPending(false);
        setQuestionStatuses((prev) =>
          Array.from({ length: p.total }, (_, idx) => prev[idx] ?? "pending")
        );
        initSfx();
      }
    );

    s.on("multiple_choice", (p: { choices: ChoiceLite[] }) => {
      setMcChoices(() => {
        mcChoicesRef.current = p.choices;
        return p.choices;
      });
      setTextAnswer("");
    });

    s.on(
      "answer_feedback",
      (p: {
        correct: boolean;
        correctChoiceId: string | null;
        correctLabel: string | null;
        responseMs?: number;
        points?: number;
      }) => {
        if (typeof p.responseMs === "number")
          setFeedbackResponseMs(p.responseMs);
        if (typeof p.correct === "boolean") setFeedbackWasCorrect(p.correct);
        if (typeof p.correctLabel === "string" && p.correctLabel)
          setFeedbackCorrectLabel(p.correctLabel);
        if (p.correctChoiceId) setCorrectId(p.correctChoiceId);
        if (typeof p.points === "number") setFeedbackPoints(p.points);

        let nextLives = livesRef.current;

        if (mcChoicesRef.current === null) {
          if (!p.correct) {
            const attempt = lastSubmittedTextRef.current.trim();
            setWrongTextAnswer(attempt || null);
          } else {
            setWrongTextAnswer(null);
            lastSubmittedTextRef.current = "";
          }
          if (p.correct) {
            setLives(() => {
              livesRef.current = 0;
              return 0;
            });
            nextLives = 0;
          } else {
            const updatedLives = Math.max(0, livesRef.current - 1);
            setLives(updatedLives);
            livesRef.current = updatedLives;
            nextLives = updatedLives;

            if (updatedLives > 0) {
              setTextAnswer("");
              requestAnimationFrame(() => inputRef.current?.focus());
            }
          }
        }

        const shouldResolveStatus =
          p.correct ||
          (mcChoicesRef.current !== null ? true : (nextLives ?? 0) <= 0);

        if (shouldResolveStatus) {
          setQuestionStatuses((prev) => {
            const next = prev.length
              ? [...prev]
              : Array.from({ length: totalRef.current }, () => "pending" as QuestionStatus);

            const resolvedIndex = indexRef.current;
            const nextStatus: QuestionStatus = p.correct
              ? answerModeRef.current === "choice"
                ? "correct-mc"
                : "correct"
              : "wrong";

            if (resolvedIndex >= 0 && resolvedIndex < next.length) {
              next[resolvedIndex] = nextStatus;
            }
            return next;
          });
        }

        if (p.correct) setFeedback("Bravo !");
        else if (mcChoicesRef.current === null && (nextLives ?? 0) > 0)
          setFeedback("Mauvaise réponse, essayez encore !");
        else setFeedback("Mauvaise réponse !");

        try {
          if (p.correct) playCorrect();
        } catch {}
      }
    );

    s.on(
      "player_answered",
      (p: { pgId: string; correct?: boolean; mode?: "mc" | "text" }) => {
        if (!p?.pgId) return;
        const nextStatus: AnsweredStatus = p.correct
          ? p.mode === "mc"
            ? "correct-mc"
            : "correct"
          : "wrong";
        setAnsweredByPg((prev) => ({ ...prev, [p.pgId]: nextStatus }));
      }
    );

    s.on(
      "round_end",
      (p: {
        index: number;
        correctChoiceId: string | null;
        correctLabel?: string | null;
        leaderboard?: LeaderRow[];
      }) => {
        setPhase("reveal");
        setCorrectId(p.correctChoiceId);

        setQuestionStatuses((prev) => {
          const next = prev.length
            ? [...prev]
            : Array.from({ length: totalRef.current }, () => "pending" as QuestionStatus);

          const resolvedIndex =
            typeof p.index === "number" ? p.index : indexRef.current;

          const nextStatus: QuestionStatus =
            feedbackWasCorrectRef.current === true
              ? answerModeRef.current === "choice"
                ? "correct-mc"
                : "correct"
              : "wrong";

          if (resolvedIndex >= 0 && resolvedIndex < next.length) {
            next[resolvedIndex] = nextStatus;
          }
          return next;
        });

        if (Array.isArray(p.leaderboard)) setLeaderboard(applyAvatarOverrides(p.leaderboard));

        setAnsweredByPg((prev) => {
          const rows = Array.isArray(p.leaderboard)
            ? applyAvatarOverrides(p.leaderboard)
            : applyAvatarOverrides(leaderboard);
          if (!rows.length) return prev;
          const next = { ...prev };
          rows.forEach((row) => {
            if (!next[row.id]) next[row.id] = "wrong";
          });
          return next;
        });

        setFeedback((prev) => prev ?? "Temps écoulé !");
        if (p.correctLabel) setFeedbackCorrectLabel(p.correctLabel);
        if (typeof p.index === "number") {
          setFinalQuestionSnapshots((prev) =>
            prev.map((item, idx) =>
              idx === p.index ? { ...item, correctLabel: p.correctLabel ?? item.correctLabel ?? null } : item
            )
          );
        }
        setEndsAt(null);
        setRoundDuration(null);
        setPending(false);
      }
    );

    s.on("manual_round_ready", (p: { index?: number; total?: number }) => {
      if (typeof p.index === "number") {
        setIndex(p.index);
        indexRef.current = p.index;
      }
      if (typeof p.total === "number") {
        setTotal(p.total);
        totalRef.current = p.total;
      }
      setManualNextAvailable(true);
      setManualNextPending(false);
      setPending(false);
    });

    s.on("leaderboard_update", (p: { leaderboard: LeaderRow[] }) => {
      setLeaderboard(applyAvatarOverrides(p.leaderboard ?? []));
    });

    s.on("final_leaderboard", (p: { leaderboard: LeaderRow[]; displayMs?: number }) => {
      setPhase("final");
      setSelectedFinalIndex(0);
      setLeaderboard(applyAvatarOverrides(p.leaderboard ?? []));
      setBitsByPgId({});
      setXpByPgId({});
      setQuestion(null);
      setMcChoices(null);
      setSelected(null);
      setTextAnswer("");
      setWrongTextAnswer(null);
      lastSubmittedTextRef.current = "";
      setCorrectId(null);
      setFeedback(null);
      setFeedbackResponseMs(null);
      setFeedbackWasCorrect(null);
      setFeedbackCorrectLabel(null);
      setFeedbackPoints(null);
      setAnswerMode(null);
      setChoicesRevealed(false);
      setEndsAt(null);
      setRoundStartedAt(null);
      setRoundDuration(null);

      if (typeof p.displayMs === "number") {
        const displayMs = Math.max(0, p.displayMs ?? 0);
        setFinalEndsAt(Date.now() + displayMs);
        setFinalDuration(displayMs);
      } else {
        setFinalEndsAt(null);
        setFinalDuration(null);
      }

      setPending(false);
    });

    s.on(
      "bits_awarded",
      (p: { rewards?: { playerGameId: string; rank: number; bits: number }[] }) => {
        const rewards = p.rewards ?? [];
        if (!Array.isArray(rewards)) return;

        setBitsByPgId((prev) => {
          const next = { ...prev };
          rewards.forEach((reward) => {
            if (!reward?.playerGameId) return;
            next[reward.playerGameId] = reward.bits ?? 0;
          });
          return next;
        });

        fetch(`${API_BASE}/auth/me`, { credentials: "include" })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            const totalBits = data?.user?.bits;
            if (Number.isFinite(totalBits)) {
              window.dispatchEvent(
                new CustomEvent("bits-updated", { detail: { total: totalBits } })
              );
            }
          })
          .catch(() => {});
      }
    );

    s.on("xp_awarded", (p: { rewards?: { playerGameId: string; xp: number }[] }) => {
      const rewards = p.rewards ?? [];
      if (!Array.isArray(rewards)) return;

      setXpByPgId((prev) => {
        const next = { ...prev };
        rewards.forEach((reward) => {
          if (!reward?.playerGameId) return;
          next[reward.playerGameId] = reward.xp ?? 0;
        });
        return next;
      });

      fetch(`${API_BASE}/auth/me`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const totalXp = data?.user?.experience;
          if (Number.isFinite(totalXp)) {
            window.dispatchEvent(
              new CustomEvent("experience-updated", { detail: { total: totalXp } })
            );
          }
        })
        .catch(() => {});
    });

    /* récapitulatif individuel de la partie (unicast) */
    s.on("final_summary", (p: { summary: RecapItem[] }) => {
      setFinalRecap(Array.isArray(p.summary) ? p.summary : []);
    });

    s.on("game_over", () => {
      setPhase("between");
      setQuestion(null);
      setEndsAt(null);
      setRoundDuration(null);
      setFinalEndsAt(null);
      setFinalDuration(null);
      setPending(false);
      setGameCountdown(null);
      setGameCountdownTotal(null);
      setGameCountdownEndsAt(null);
      setGameCountdownDuration(null);
    });

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/rooms/${roomId}`, {
          credentials: "include",
        });

        if (res.status === 410) {
          s.close();
          nav("/");
          return;
        }

        if (res.ok) {
          const { room } = (await res.json()) as { room: RoomMeta };
          setRoomMeta(room);

          if (room.visibility === "PUBLIC" || !room.code)
            s.emit("join_game", { roomId: room.id });
          else s.emit("join_game", { code: room.code });
        } else {
          s.close();
        }
      } catch {
        s.close();
      }
    })();

    return () => {
      s.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, nav]);

  const finalRows = useMemo(
    () =>
      leaderboard.map((row) => ({
        ...row,
        bits: bitsByPgId[row.id] ?? 0,
        xp: xpByPgId[row.id] ?? 0,
      })),
    [leaderboard, bitsByPgId, xpByPgId]
  );

  useEffect(() => {
    if (phase === "playing") inputRef.current?.focus();
  }, [phase, question]);

  usePersistentGameInputFocus({ enabled: phase === "playing", inputRef });

  useEffect(() => {
    answerModeRef.current = answerMode;
  }, [answerMode]);

  useEffect(() => {
    feedbackWasCorrectRef.current = feedbackWasCorrect;
  }, [feedbackWasCorrect]);

  useEffect(() => {
    indexRef.current = index;
    totalRef.current = total;
  }, [index, total]);

  useEffect(() => {
    livesRef.current = lives;
  }, [lives]);

  useEffect(() => {
    mcChoicesRef.current = mcChoices;
  }, [mcChoices]);

  useEffect(() => {
    if (selfIndex < 0) return;
    if (rankRef.current !== null && rankRef.current !== selfIndex) {
      setRankPulseKey((prev) => prev + 1);
    }
    rankRef.current = selfIndex;
  }, [selfIndex]);

  useEffect(() => {
    displayScoreRef.current = displayScore;
  }, [displayScore]);

  useEffect(() => {
    if (!selfRow || typeof selfRow.score !== "number") {
      if (scoreAnimationRef.current !== null) {
        cancelAnimationFrame(scoreAnimationRef.current);
        scoreAnimationRef.current = null;
      }
      setDisplayScore(0);
      displayScoreRef.current = 0;
      return;
    }

    const start = displayScoreRef.current;
    const end = selfRow.score;
    if (start === end) return;

    if (scoreAnimationRef.current !== null) {
      cancelAnimationFrame(scoreAnimationRef.current);
      scoreAnimationRef.current = null;
    }

    const duration = 650;
    const startTime = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(start + (end - start) * eased);
      setDisplayScore(value);

      if (progress < 1) scoreAnimationRef.current = requestAnimationFrame(tick);
      else scoreAnimationRef.current = null;
    };

    scoreAnimationRef.current = requestAnimationFrame(tick);

    return () => {
      if (scoreAnimationRef.current !== null) {
        cancelAnimationFrame(scoreAnimationRef.current);
        scoreAnimationRef.current = null;
      }
    };
  }, [selfRow]);

  /* --------------------------- actions --------------------------- */
  const sendText = () => {
    if (!socket || phase !== "playing" || !question || lives <= 0) return;
    if (choicesRevealed || mcChoicesRef.current) return;

    const t = (textAnswer || "").trim();
    if (!t) return;

    lastSubmittedTextRef.current = t;
    setPending(true);
    setAnswerMode("text");
    socket.emit(
      "submit_answer_text",
      { text: t },
      (res: { ok: boolean; reason?: string }) => {
        setPending(false);
        if (!res?.ok && res?.reason === "no-lives") {
          setLives(0);
          lastSubmittedTextRef.current = "";
        }
      }
    );
  };

  const showMultipleChoice = () => {
    if (
      !socket ||
      phase !== "playing" ||
      lives <= 0 ||
      feedbackWasCorrect === true
    )
      return;
    setChoicesRevealed(true);
    socket.emit("request_choices");
  };

  const answerByChoice = (choiceId: string) => {
    if (!socket || phase !== "playing" || !question || selected) return;
    setSelected(choiceId);
    setAnswerMode("choice");
    socket.emit("submit_answer", { code: "N/A", choiceId });
  };

  /* ----------------------------- UI ----------------------------- */

  const normalizedQuestion = useMemo(() => {
    if (!question) return null;
    const img = question.img
      ? question.img.startsWith("http") || question.img.startsWith("/")
        ? question.img
        : "/" + question.img.replace(/^\.?\//, "")
      : null;

    return {
      id: question.id,
      text: question.text,
      theme: question.theme ?? null,
      difficulty:
        question.difficulty !== null && question.difficulty !== undefined
          ? String(question.difficulty)
          : null,
      img,
      slotLabel: null,
    };
  }, [question]);

  const feedbackText = useMemo(() => {
    if (feedback) return feedback;
    if (phase === "reveal" && remaining === 0) return "Temps écoulé !";
    return null;
  }, [feedback, phase, remaining]);

  const choicesForPanel = useMemo(
    () =>
      mcChoices
        ? mcChoices.map<QuestionPanelChoice>((c) => ({ id: c.id, label: c.label }))
        : null,
    [mcChoices]
  );

  const isPlaying = phase === "playing" && lives > 0;
  const showChoices = !!mcChoices;
  const textLocked = choicesRevealed || showChoices;

  const isPrivateRoom = roomMeta?.visibility === "PRIVATE";
  const isRoomOwner = !!selfId && !!roomMeta?.ownerId && roomMeta.ownerId === selfId;
  const lobbyRoomId = roomMeta?.id ?? roomId;
  const lobbyPath = lobbyRoomId ? `/rooms/${lobbyRoomId}/lobby` : "/";
  const roomBadgeClass = "inline-flex items-center gap-1.5 rounded-[6px] bg-black/45 px-3 py-1.5 font-brand text-[15px] italic leading-none text-white shadow-[0_8px_18px_rgba(0,0,0,0.35)] backdrop-blur-sm";
  const displayedRoomCode = isRoomCodeVisible ? roomMeta?.code ?? "—" : maskRoomCode(roomMeta?.code);

  // ✅ Layout widths (LG+)
  const leftW = 360;
  const rightW = 300;

  // ✅ panneau haut
  const TOP_BAR_H = 12; // px
  const NAVBAR_TOP = 52; // px (ton offset actuel)
  const fixedTop = NAVBAR_TOP + TOP_BAR_H;

  const hasScrollableLeaderboard = leaderboard.length > LB_VISIBLE;

  const questionTrackerItems = useMemo(
    () =>
      Array.from({ length: total }, (_, idx) => questionStatuses[idx] ?? "pending"),
    [questionStatuses, total]
  );
  const questionProgress: QuestionPanelProgress[] = useMemo(
    () =>
      questionTrackerItems.map((status) =>
        status === "wrong"
          ? "wrong"
          : status === "correct-mc"
            ? "correct-mc"
            : status === "correct"
              ? "correct"
              : "pending"
      ),
    [questionTrackerItems]
  );

  function launchNextQuestion() {
    if (!socket || !manualNextAvailable || !isRoomOwner) return;
    setManualNextPending(true);
    socket.emit("launch_next_question", {}, (res?: { ok?: boolean; reason?: string }) => {
      if (res?.ok) {
        setManualNextAvailable(false);
        return;
      }
      setManualNextPending(false);
      setFeedback(res?.reason === "forbidden" ? "Seul le propriétaire peut lancer la question." : "Impossible de lancer la question.");
    });
  }

  const finalQuestions = useMemo(() => {
    if (!finalRecap?.length) return [];

    type Agg = {
      questionId: string;
      index: number;
      text: string;
      img?: string | null;
      theme?: string | null;
      correctLabel?: string | null;
      stats?: FinalQuestionStats;
      attempts: { correct: boolean }[];
      status: QuestionStatus;
    };

    const byId = new Map<string, Agg>();
    const ordered: Agg[] = [];

    for (const item of finalRecap) {
      let agg = byId.get(item.questionId);
      if (!agg) {
        const statsRaw = (item as { stats?: Partial<FinalQuestionStats> })?.stats;
        const statsAlt: Partial<FinalQuestionStats> = {
          correct: (item as { statsCorrect?: number })?.statsCorrect,
          correctQcm: (item as { statsCorrectQcm?: number })?.statsCorrectQcm,
          wrong: (item as { statsWrong?: number })?.statsWrong,
        };
        const stats =
          statsRaw &&
          typeof statsRaw.correct === "number" &&
          typeof statsRaw.correctQcm === "number" &&
          typeof statsRaw.wrong === "number"
            ? {
                correct: statsRaw.correct,
                correctQcm: statsRaw.correctQcm,
                wrong: statsRaw.wrong,
              }
            : typeof statsAlt.correct === "number" &&
              typeof statsAlt.correctQcm === "number" &&
              typeof statsAlt.wrong === "number"
            ? {
                correct: statsAlt.correct,
                correctQcm: statsAlt.correctQcm,
                wrong: statsAlt.wrong,
              }
            : undefined;

        agg = {
          questionId: item.questionId,
          index: item.index,
          text: item.text,
          img: item.img ?? null,
          theme: item.theme ?? null,
          correctLabel: item.correctLabel ?? null,
          stats,
          attempts: [],
          status: "pending",
        };

        byId.set(item.questionId, agg);
        ordered.push(agg);
      }

      if (item.correctLabel) agg.correctLabel = item.correctLabel;
      if (item.theme && !agg.theme) agg.theme = item.theme;
      agg.attempts.push({ correct: !!item.correct });
    }

    return ordered.map((agg) => {
      const isCorrect = agg.attempts.some((attempt) => attempt.correct);
      return {
        ...agg,
        status:
          agg.attempts.length === 0 ? "pending" : isCorrect ? "correct" : "wrong",
      };
    });
  }, [finalRecap]);

  const finalTrackerItems = useMemo(
    () =>
      phase === "final"
        ? (["pending" as QuestionStatus, ...questionTrackerItems])
        : questionTrackerItems,
    [phase, questionTrackerItems]
  );

  const finalStatsByQuestionId = useMemo(() => {
    const map = new Map<string, FinalQuestionStats>();
    finalQuestions.forEach((q) => {
      if (q.stats) map.set(q.questionId, q.stats);
    });
    return map;
  }, [finalQuestions]);

  const selectedFinalQuestionSnapshot =
    selectedFinalIndex > 0 ? finalQuestionSnapshots[selectedFinalIndex - 1] ?? null : null;

  const selectedFinalQuestion = useMemo(() => {
    if (!selectedFinalQuestionSnapshot) return null;
    return {
      ...selectedFinalQuestionSnapshot,
      stats: finalStatsByQuestionId.get(selectedFinalQuestionSnapshot.questionId),
    };
  }, [selectedFinalQuestionSnapshot, finalStatsByQuestionId]);
  const isFinalLeaderboardSelected = selectedFinalIndex === 0;

  useEffect(() => {
    if (phase !== "final" || finalQuestionSnapshots.length === 0) return;

    const handleFinalNavigationKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelectedFinalIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelectedFinalIndex((current) => Math.min(finalQuestionSnapshots.length, current + 1));
      }
    };

    window.addEventListener("keydown", handleFinalNavigationKey);
    return () => window.removeEventListener("keydown", handleFinalNavigationKey);
  }, [phase, finalQuestionSnapshots.length]);

  const selectedFinalQuestionPanel = useMemo(() => {
    if (!selectedFinalQuestion) return null;
    const img = selectedFinalQuestion.img
      ? selectedFinalQuestion.img.startsWith("http") || selectedFinalQuestion.img.startsWith("/")
        ? selectedFinalQuestion.img
        : "/" + selectedFinalQuestion.img.replace(/^\.?\//, "")
      : null;

    return {
      id: selectedFinalQuestion.questionId,
      text: selectedFinalQuestion.text,
      theme: selectedFinalQuestion.theme ?? null,
      difficulty: null,
      img,
      slotLabel: null,
    };
  }, [selectedFinalQuestion]);
  const selectedFinalStatsLayout = useMemo(() => {
    const stats = selectedFinalQuestion?.stats;
    if (!stats) return null;
    const responseCount = stats.correct + stats.correctQcm + stats.wrong;
    const total = Math.max(1, responseCount);
    return {
      stats,
      hasNoResponses: responseCount === 0,
      correctWidth: `${(100 * stats.correct) / total}%`,
      qcmWidth: `${(100 * stats.correctQcm) / total}%`,
      wrongWidth: `${(100 * stats.wrong) / total}%`,
    };
  }, [selectedFinalQuestion]);


  // ✅ Nom du salon affiché en gros à droite
  const roomDisplayName = roomMeta?.name?.trim() || "-";

  const rankLabel = useMemo(() => {
    if (selfIndex < 0) return null;
    const rank = selfIndex + 1;
    const suffix = rank === 1 ? "er" : "ème";
    return { value: String(rank), suffix, rank };
  }, [selfIndex]);

  const rankAnimationVars = useMemo(() => {
    if (!rankLabel) return null;
    const clampedRank = Math.min(Math.max(rankLabel.rank, 1), 20);
    const intensity = (20 - clampedRank) / 19;
    const translate = 1 + intensity * 9;
    const scale = 0.995 - intensity * 0.055;
    const opacity = 0.95 - intensity * 0.55;
    const duration = 280 + intensity * 220;

    return {
      "--rank-pop-translate": `${translate.toFixed(1)}px`,
      "--rank-pop-scale": `${scale.toFixed(3)}`,
      "--rank-pop-opacity": `${opacity.toFixed(2)}`,
      animationDuration: `${Math.round(duration)}ms`,
    } as React.CSSProperties;
  }, [rankLabel]);

  useLayoutEffect(() => {
    const list = leaderboardRef.current;
    if (!list || isLeaderboardTargetingPaused) return;
    isProgrammaticLeaderboardScrollRef.current = true;
    if (!keepSelfCentered) {
      list.scrollTop = 0;
    } else {
      const selfCell = list.querySelector<HTMLElement>('[data-self="true"]');
      if (selfCell) {
        const centeredTop = selfCell.offsetTop - (list.clientHeight - selfCell.offsetHeight) / 2;
        list.scrollTop = Math.max(0, centeredTop);
      }
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        isProgrammaticLeaderboardScrollRef.current = false;
      });
    });
  }, [keepSelfCentered, isLeaderboardTargetingPaused, leaderboard, selfIndex]);

  useEffect(() => {
    return () => {
      if (leaderboardTargetingTimerRef.current !== null) {
        window.clearTimeout(leaderboardTargetingTimerRef.current);
      }
    };
  }, []);

  const pauseLeaderboardTargeting = () => {
    if (isProgrammaticLeaderboardScrollRef.current) return;
    setIsLeaderboardTargetingPaused(true);
    if (leaderboardTargetingTimerRef.current !== null) {
      window.clearTimeout(leaderboardTargetingTimerRef.current);
    }
    leaderboardTargetingTimerRef.current = window.setTimeout(() => {
      setIsLeaderboardTargetingPaused(false);
      leaderboardTargetingTimerRef.current = null;
    }, 5000);
  };

  const toggleLeaderboardTarget = () => {
    if (leaderboardTargetingTimerRef.current !== null) {
      window.clearTimeout(leaderboardTargetingTimerRef.current);
      leaderboardTargetingTimerRef.current = null;
    }
    setIsLeaderboardTargetingPaused(false);
    setKeepSelfCentered((centered) => !centered);
  };

  // ✅ rendu unique d'une ligne leaderboard (cellule + badge)
  const renderLeaderboardLine = (r: LeaderRow, rank: number, isSelf: boolean, allowProfileNavigation = true) => {
    const status = phase === "final" || phase === "countdown" || gameCountdown !== null ? null : answeredByPg[r.id];

    const badgeTitle =
      status === "correct"
        ? "Bonne réponse"
        : status === "correct-mc"
        ? "Bonne réponse (QCM)"
        : status === "wrong"
        ? "Mauvaise réponse"
        : "Pas encore répondu";

    const badgeVisual =
      status === "correct"
        ? {
            ch: "✓",
            cls: "bg-emerald-600 text-white",
          }
        : status === "correct-mc"
        ? {
            ch: "\u26A1\uFE0E",
            cls: "bg-[#6F5BD4] text-white",
          }
        : status === "wrong"
        ? {
            ch: "✕",
            cls: "bg-[#AF2D33] text-white",
          }
        : {
            ch: "",
            cls: "bg-[#3B3E4D] text-transparent",
          };

    const rankNode = (
      <span className={`relative inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[6px] pt-[1px] font-brand tabular-nums text-[16px] font-bold leading-none text-white [text-rendering:geometricPrecision] ${isSelf ? "bg-[#7C5CFF]" : "bg-[#1F2437]"}`}>
        {rank === 1 && allowProfileNavigation ? (
          <img
            src={crownImage}
            alt="Couronne du premier joueur"
            className="pointer-events-none absolute -top-6 left-1/2 z-20 h-auto w-10 -translate-x-1/2 select-none drop-shadow-[0_8px_10px_rgba(0,0,0,0.4)]"
            draggable={false}
            loading="lazy"
          />
        ) : null}
        {rank}
      </span>
    );

return (
  <div className="flex items-center gap-2">
    {rankNode}

    <div className="flex-1 min-w-0">
      <PlayerCell row={r} accentColor={isSelf ? "#7C5CFF" : "#1F2437"} onNameClick={allowProfileNavigation ? handlePlayerProfile : undefined} />
    </div>

    {/* ✅ Badge: carré neutre/vert/violet/rouge */}
    <span
      className={`flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-[5px] text-[12px] font-extrabold leading-none ${badgeVisual.cls}`}
      title={badgeTitle}
      aria-label={badgeTitle}
    >
      {badgeVisual.ch}
    </span>
  </div>
);
  };

  return (
    <>
      <div aria-hidden className="fixed inset-0 bg-[#11131f]" />

      {/* ✅ Scrollbar style global */}
      <style>{`
        .lb-scroll {
          scrollbar-width: thin;
          scrollbar-color: #eef1ff #191c2c;
        }
        .lb-scroll::-webkit-scrollbar { width: 10px; }
        .lb-scroll::-webkit-scrollbar-track {
          background: #191c2c;
          border-radius: 999px;
        }
        .lb-scroll::-webkit-scrollbar-button {
          display: none;
          height: 0;
          width: 0;
        }
        .lb-scroll::-webkit-scrollbar-thumb {
          background: #eef1ff;
          border-radius: 999px;
          border: 3px solid #191c2c;
          background-clip: padding-box;
        }
        .lb-scroll::-webkit-scrollbar-thumb:hover {
          background: #eef1ff;
          border: 3px solid #191c2c;  
          background-clip: padding-box;
        }

        @keyframes rankPop {
          0% {
            transform: translateY(var(--rank-pop-translate, 4px)) scale(var(--rank-pop-scale, 0.98));
            opacity: var(--rank-pop-opacity, 0.6);
          }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .rank-pop {
          animation: rankPop 420ms ease-out;
        }
      `}</style>

      <div className="relative z-10 min-h-[calc(100dvh-64px)] text-white lg:overflow-hidden">
        <div className="relative">
          <div className="relative grid grid-cols-1 lg:block">
{/* LEFT */}
{!shouldHideLeftRail ? (
<aside
  className="hidden lg:block fixed left-0 bottom-12 z-30 overflow-visible"
  style={{ top: fixedTop, width: leftW }}
>
  <div className="h-full overflow-visible bg-transparent pb-6 pr-3 pt-3 pl-3">
    <div className="h-full px-4 pb-5 flex flex-col min-h-0 overflow-visible">
        <div className="relative mb-6 border-b border-white/10 pb-4 text-white">
          <h2 className="truncate font-brandUpright text-[22px] uppercase leading-tight" title={roomDisplayName}>
            Salon - {roomDisplayName}
          </h2>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="font-inter text-[12px] font-semibold text-white/55">
              {leaderboard.length} joueur{leaderboard.length > 1 ? "s" : ""}
            </p>
            {isPrivateRoom && (
              <button
                type="button"
                onClick={() => setIsRoomCodeVisible((visible) => !visible)}
                className={roomBadgeClass}
                aria-label={isRoomCodeVisible ? "Masquer le code du salon" : "Afficher le code du salon"}
                title={isRoomCodeVisible ? "Masquer le code" : "Afficher le code"}
              >
                <span className="max-w-full truncate">{displayedRoomCode}</span>
              </button>
            )}
          </div>
        </div>
        {leaderboard.length === 0 ? (
          <div className="text-white/45 text-sm">—</div>
        ) : (
          <>
            <ol
              ref={leaderboardRef}
              onScroll={pauseLeaderboardTargeting}
              className={[
                "lb-scroll",
                "m-0 space-y-2 pt-7",
                "overflow-y-auto overflow-x-hidden",
                hasScrollableLeaderboard ? "pr-3" : "pr-0",
                "flex-1 min-h-0",
              ].join(" ")}
            >
              {leaderboard.map((r, i) => {
                const isSelf =
                  (selfId && r.id === selfId) ||
                  (!!selfName &&
                    typeof r.name === "string" &&
                    r.name.toLowerCase() === selfName.toLowerCase());

                return (
                  <li key={r.id} data-self={isSelf ? "true" : undefined} className="max-w-full overflow-visible">
                    {renderLeaderboardLine(r, i + 1, isSelf)}
                  </li>
                );
              })}
            </ol>

            {/* ✅ self row en bas (si scroll) */}
            {hasScrollableLeaderboard && selfRow ? (
              <div
                className="mt-4 cursor-pointer overflow-x-hidden border-t border-white/10 pt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                role="button"
                tabIndex={0}
                aria-label={keepSelfCentered ? "Revenir en haut du classement" : "Garder le classement centré sur ma position"}
                aria-pressed={keepSelfCentered}
                onClick={toggleLeaderboardTarget}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleLeaderboardTarget();
                  }
                }}
              >
                {renderLeaderboardLine(selfRow, selfIndex + 1, true, false)}
                <span className={`ml-9 mt-2 flex justify-start ${isLeaderboardTargetingPaused ? "text-white/30" : keepSelfCentered ? "text-violet-400" : "text-white/45"}`} aria-hidden="true">
                  {keepSelfCentered ? <Crosshair size={14} strokeWidth={2.4} /> : <ArrowUp size={14} strokeWidth={2.4} />}
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>
  </div>
</aside>
) : null}

            {/* CENTER */}
            <div
              className="lg:ml-[360px] lg:mr-[300px] lg:overflow-y-auto lb-scroll"
              style={{
                height: `calc(100dvh - ${NAVBAR_TOP}px - ${TOP_BAR_H}px)`,
                marginTop: TOP_BAR_H,
              }}
            >
              <main className="relative overflow-hidden bg-transparent">
                <style>{`
                  @keyframes countdownVerticalBarPulse {
                    0%, 100% { opacity: 0.82; }
                    50% { opacity: 1; }
                  }

                  @keyframes countdownDotPulse {
                    0%, 20% { opacity: 0.18; transform: translateY(0); }
                    35%, 65% { opacity: 1; transform: translateY(-1px); }
                    80%, 100% { opacity: 0.18; transform: translateY(0); }
                  }

                  .countdown-dot {
                    display: inline-block;
                    animation: countdownDotPulse 1.05s ease-in-out infinite;
                  }

                  @keyframes countdownPlayersEnter {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                  }

                  .countdown-players-page {
                    animation: countdownPlayersEnter 320ms ease-out;
                  }
                `}</style>

                <div className="relative px-5 py-4 md:px-10" style={{ minHeight: "100%" }}>
                  <div className="relative z-10 flex items-start justify-center">
                    <div className="w-full max-w-[1800px]">
                      {gameCountdown !== null ? (
                        <div className="flex min-h-[620px] items-start justify-center px-4 pb-6 pt-10">
                          <div className="flex w-full max-w-[880px] flex-col items-center text-center">
                            <div className="flex items-center justify-center text-[#8E63FF]">
                              <h1 className="font-brand text-[38px] italic leading-none tracking-[0.08em] text-white drop-shadow-[0_0_18px_rgba(126,92,255,0.32)] md:text-[46px]">
                                LA PARTIE COMMENCE BIENTÔT
                              </h1>
                            </div>
                            <div className="mt-7 flex h-[128px] items-center justify-center">
                              <div className="scale-[1.50]">
                                <OverwatchTimerBadge
                                  seconds={gameCountdownRemainingSeconds ?? gameCountdown ?? 0}
                                  progress={gameCountdownProgress}
                                  segmentColor="#8E63FF"
                                  textClassName="font-acumin text-[24px] font-bold leading-[0.9] text-white"
                                />
                              </div>
                            </div>

                            <div
                              key={countdownPlayerPage}
                              className="countdown-players-page mt-14 flex min-h-[180px] w-full max-w-[760px] flex-wrap items-start justify-center gap-5"
                            >
                                {visibleCountdownPlayers.map((player) => {
                                  const level = getLevelFromExperience(player.experience ?? 0);

                                  return (
                                    <article
                                      key={player.id}
                                      className="relative h-[176px] w-[130px] rounded-[7px] p-px text-center"
                                      style={{ background: "linear-gradient(180deg, #7C5CFF 0%, #191C2C 42%)" }}
                                    >
                                      <span
                                        className="pointer-events-none absolute inset-x-px bottom-[-4px] h-3 rounded-b-[7px] bg-[#7C5CFF]"
                                        aria-hidden="true"
                                      />
                                      <div className="relative flex h-full w-full flex-col items-center rounded-[6px] bg-[linear-gradient(180deg,#292D45_0%,#181B2B_100%)] px-3 pb-4 pt-7">
                                        <div className="h-[52px] w-[52px] overflow-hidden rounded-full border-2 border-[#8E63FF]">
                                          <img
                                            src={player.img ?? "/img/profiles/0.avif"}
                                            alt=""
                                            className="h-full w-full rounded-full object-cover"
                                            draggable={false}
                                            loading="lazy"
                                          />
                                        </div>
                                        <div className="mt-3 w-full truncate font-inter text-[14px] font-extrabold leading-none text-white">
                                          {player.name}
                                        </div>
                                        <div className="mt-auto" aria-label={`Niveau ${level}`}>
                                          <CountdownLevelShield level={level} />
                                        </div>
                                      </div>
                                    </article>
                                  );
                                })}
                            </div>
                            <div className="mt-16 flex h-3 items-center justify-center gap-2" aria-label={`Page ${countdownPlayerPage + 1} sur ${countdownPlayerPageCount}`}>
                              {Array.from({ length: countdownPlayerPageCount }, (_, page) => (
                                <span
                                  key={page}
                                  className={`h-2 w-2 rounded-[2px] transition-colors ${page === countdownPlayerPage ? "bg-[#7C5CFF]" : "bg-slate-500/70"}`}
                                  aria-hidden="true"
                                />
                              ))}
                            </div>
                            <div className="mt-12 inline-flex items-center gap-2 font-brandUpright text-[15px] font-semibold uppercase tracking-[0.06em] text-white/60">
                              <Users className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                              {countdownPlayers.length} joueur{countdownPlayers.length > 1 ? "s" : ""} dans cette partie
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {phase === "final" ? (
                        <div className="relative px-12 md:px-16">
                          {finalQuestionSnapshots.length > 0 ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setSelectedFinalIndex((current) => Math.max(0, current - 1))}
                                disabled={selectedFinalIndex === 0}
                                className="absolute left-0 z-30 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#131829] text-white transition hover:border-white/35 hover:bg-[#1B2136] disabled:cursor-not-allowed disabled:opacity-25 md:left-[8%] xl:left-[10%]"
                                style={{ top: `calc((100dvh - ${NAVBAR_TOP}px - ${TOP_BAR_H}px) / 2 - 40px)` }}
                                aria-label="Afficher l’élément précédent"
                              >
                                <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedFinalIndex((current) => Math.min(finalQuestionSnapshots.length, current + 1))
                                }
                                disabled={selectedFinalIndex >= finalQuestionSnapshots.length}
                                className="absolute right-0 z-30 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#131829] text-white transition hover:border-white/35 hover:bg-[#1B2136] disabled:cursor-not-allowed disabled:opacity-25 md:right-[8%] xl:right-[10%]"
                                style={{ top: `calc((100dvh - ${NAVBAR_TOP}px - ${TOP_BAR_H}px) / 2 - 40px)` }}
                                aria-label="Afficher l’élément suivant"
                              >
                                <ChevronRight className="h-6 w-6" strokeWidth={2.2} />
                              </button>
                            </>
                          ) : null}

                          {isFinalLeaderboardSelected || !selectedFinalQuestionPanel ? (
                            <div className="mx-auto w-full max-w-[1800px]">
                              <div className="relative pt-2 md:pt-4">
                                <FinalLeaderboard rows={finalRows} selfId={selfId} selfName={selfName} />
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center pb-8 pt-10 md:pt-12">
                              <h2 className="font-brand text-[28px] font-black uppercase italic leading-none tracking-[0.055em] text-white md:text-[34px]">
                                Question {selectedFinalIndex} / {finalQuestionSnapshots.length}
                              </h2>
                              {finalTrackerItems.length > 1 ? (
                                <div className="order-last mt-14 flex flex-wrap items-center justify-center gap-2">
                                  {finalTrackerItems.slice(1).map((status, idx) => {
                                    const questionIndex = idx + 1;
                                    const isCurrent = questionIndex === selectedFinalIndex;
                                    const colorClass =
                                      status === "correct"
                                        ? "bg-emerald-600 text-white"
                                        : status === "correct-mc"
                                        ? "bg-[#6F5BD4] text-white"
                                        : status === "wrong"
                                        ? "bg-[#AF2D33] text-white"
                                        : "bg-white/30 text-white/70";
                                    const trackerClasses = [
                                      "flex h-8 w-8 items-center justify-center rounded-[7px] text-[12px] font-semibold",
                                      "transition-all",
                                      colorClass,
                                      isCurrent ? "ring-2 ring-white/70" : "",
                                    ].join(" ");

                                    return (
                                      <button
                                        key={`final-top-q-${idx}`}
                                        type="button"
                                        onClick={() => setSelectedFinalIndex(questionIndex)}
                                        className={trackerClasses}
                                        aria-label={`Voir question ${questionIndex}`}
                                        title={`Voir question ${questionIndex}`}
                                      >
                                        {questionIndex}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                              <div className="mt-10 w-full">
                                <QuestionPanel
                                  question={selectedFinalQuestionPanel}
                                  index={selectedFinalIndex - 1}
                                  totalQuestions={finalQuestionSnapshots.length}
                                  lives={0}
                                  totalLives={TEXT_LIVES}
                                  remainingSeconds={null}
                                  timerProgress={0}
                                  isReveal={false}
                                  isPlaying={false}
                                  inputRef={inputRef}
                                  textAnswer=""
                                  wrongTextAnswer={null}
                                  textLocked
                                  onChangeText={() => {}}
                                  onSubmitText={() => {}}
                                  onShowChoices={() => {}}
                                  feedback={null}
                                  feedbackResponseMs={null}
                                  feedbackWasCorrect={null}
                                  feedbackCorrectLabel={selectedFinalQuestion?.correctLabel ?? null}
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

                              {selectedFinalQuestion ? (
                                <div className="mt-10 inline-flex items-center rounded-[6px] border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-[13px] font-semibold text-slate-50">
                                  {selectedFinalQuestion.correctLabel ?? "—"}
                                </div>
                              ) : null}


                              {selectedFinalStatsLayout ? (
                                <div className="mx-auto mt-10 w-[420px] max-w-full space-y-4">
                                  <div className="flex items-center gap-2">
                                    {selectedFinalStatsLayout.hasNoResponses ? (
                                      <div className="h-[10px] w-full rounded-[3px] bg-slate-500" />
                                    ) : null}
                                    {selectedFinalStatsLayout.stats.correct > 0 ? (
                                      <div
                                        className="h-[10px] min-w-[14px] rounded-[3px] bg-emerald-600"
                                        style={{ width: selectedFinalStatsLayout.correctWidth }}
                                      />
                                    ) : null}
                                    {selectedFinalStatsLayout.stats.correctQcm > 0 ? (
                                      <div
                                        className="h-[10px] min-w-[14px] rounded-[3px] bg-[#6F5BD4]"
                                        style={{ width: selectedFinalStatsLayout.qcmWidth }}
                                      />
                                    ) : null}
                                    {selectedFinalStatsLayout.stats.wrong > 0 ? (
                                      <div
                                        className="h-[10px] min-w-[14px] rounded-[3px] bg-[#AF2D33]"
                                        style={{ width: selectedFinalStatsLayout.wrongWidth }}
                                      />
                                    ) : null}
                                  </div>

                                  <div className="flex items-center gap-2 text-white">
                                    {selectedFinalStatsLayout.hasNoResponses ? (
                                      <div className="inline-flex w-full items-center justify-center gap-3" aria-label="Aucune réponse">
                                        <span className="inline-flex h-5 items-center tabular-nums text-[18px] font-brand italic leading-none">
                                          0
                                        </span>
                                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-slate-500 text-[12px] font-semibold leading-none text-white">
                                          -
                                        </span>
                                      </div>
                                    ) : null}
                                    {selectedFinalStatsLayout.stats.correct > 0 ? (
                                      <div
                                        className="inline-flex items-center justify-center gap-3"
                                        style={{ width: selectedFinalStatsLayout.correctWidth }}
                                        aria-label="Bonnes réponses"
                                      >
                                        <span className="inline-flex h-5 items-center tabular-nums text-[18px] font-brand italic leading-none">
                                          {selectedFinalStatsLayout.stats.correct}
                                        </span>
                                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-emerald-600 text-[12px] font-semibold leading-none text-white">
                                          ✓
                                        </span>
                                      </div>
                                    ) : null}

                                    {selectedFinalStatsLayout.stats.correctQcm > 0 ? (
                                      <div
                                        className="inline-flex items-center justify-center gap-3"
                                        style={{ width: selectedFinalStatsLayout.qcmWidth }}
                                        aria-label="Réponses QCM"
                                      >
                                        <span className="inline-flex h-5 items-center tabular-nums text-[18px] font-brand italic leading-none">
                                          {selectedFinalStatsLayout.stats.correctQcm}
                                        </span>
                                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-[#6F5BD4] text-[12px] font-semibold leading-none text-white">
                                          {"\u26A1\uFE0E"}
                                        </span>
                                      </div>
                                    ) : null}

                                    {selectedFinalStatsLayout.stats.wrong > 0 ? (
                                      <div
                                        className="inline-flex items-center justify-center gap-3"
                                        style={{ width: selectedFinalStatsLayout.wrongWidth }}
                                        aria-label="Mauvaises réponses"
                                      >
                                        <span className="inline-flex h-5 items-center tabular-nums text-[18px] font-brand italic leading-none">
                                          {selectedFinalStatsLayout.stats.wrong}
                                        </span>
                                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-[#AF2D33] text-[12px] font-semibold leading-none text-white">
                                          ✕
                                        </span>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mx-auto w-full max-w-[1800px]">
                          <div className="relative">
                            {normalizedQuestion ? (
                              <div>
                                <QuestionPanel
                                  question={normalizedQuestion}
                                  index={index}
                                  totalQuestions={total}
                                  lives={lives}
                                  totalLives={TEXT_LIVES}
                                  remainingSeconds={remaining}
                                  timerProgress={timerProgress}
                                  isReveal={phase === "reveal" && (remaining ?? 0) === 0}
                                  isPlaying={isPlaying}
                                  inputRef={inputRef}
                                  textAnswer={textAnswer}
                                  wrongTextAnswer={wrongTextAnswer}
                                  textLocked={textLocked}
                                  onChangeText={setTextAnswer}
                                  onSubmitText={sendText}
                                  onShowChoices={showMultipleChoice}
                                  feedback={feedbackText}
                                  feedbackResponseMs={feedbackResponseMs}
                                  feedbackWasCorrect={feedbackWasCorrect}
                                  feedbackCorrectLabel={feedbackCorrectLabel}
                                  feedbackPoints={feedbackPoints}
                                  reserveFeedbackSpace
                                  thumbButtonBackgroundClass="bg-[#191c2c]"
                                  qcmChoiceBackgroundClass="bg-[#272b40] hover:bg-[#30354a] active:bg-[#373c55]"
                                  answerMode={answerMode}
                                  choicesRevealed={choicesRevealed}
                                  showChoices={showChoices}
                                  choices={choicesForPanel}
                                  selectedChoice={selected}
                                  correctChoiceId={correctId}
                                  onSelectChoice={(choice) => answerByChoice(choice.id)}
                                  questionProgress={questionProgress}
                                  correctLabelPlacement="above"
                                  animateQuestionText={dynamicQuestionDisplay}
                                  questionRevealStartedAtMs={questionRevealStartedAtMs}
                                />
                              </div>
                            ) : phase === "countdown" || phase === "between" ? null : (
                              <div className="flex min-h-[240px] translate-y-10 flex-col items-center justify-center gap-5 text-white">
                                <div className="h-16 w-16 animate-spin rounded-full border-[7px] border-white/20 border-t-white" aria-hidden="true" />
                                <p className="font-inter text-[18px] font-extrabold text-white/90">Question en cours...</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </main>
            </div>

            {/* RIGHT */}
            <aside
              className="hidden lg:block fixed bottom-0 right-0 z-20"
              style={{ top: fixedTop, width: rightW }}
            >
              <div className="h-full overflow-visible bg-transparent pb-3 pl-3 pr-6 pt-3">
                <div className="flex flex-col gap-4 overflow-visible">
                  {!shouldHideRightQuestionImage ? (
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
                  ) : null}
                  {phase === "final" && finalRemaining !== null ? (
                    <div className="flex justify-center py-1">
                      <FinalCountdownRing seconds={finalRemaining} progress={finalProgress} />
                    </div>
                  ) : null}
                  {phase === "final" && selectedFinalQuestionPanel?.img ? (
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/[0.06] bg-[#131829]">
                      <img
                        src={selectedFinalQuestionPanel.img}
                        alt="Illustration de la question récapitulée"
                        className="h-full w-full object-cover"
                        loading="lazy"
                        draggable={false}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    {isRoomOwner && manualQuestionLaunch && manualNextAvailable ? (
                      <button
                        type="button"
                        onClick={launchNextQuestion}
                        disabled={manualNextPending}
                        className="mx-auto flex h-11 w-[86%] items-center justify-center gap-3 rounded-[6px] bg-[#6250C7] px-4 font-inter text-[13px] font-extrabold text-white transition hover:bg-[#6F5BD4] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-[#6250C7]"
                      >
                        <span className="leading-none">{manualNextPending ? "Lancement…" : "Question suivante"}</span>
                        <Play className="h-3.5 w-3.5 fill-white/95 text-white/95" strokeWidth={1.7} />
                      </button>
                    ) : null}
                    {isRoomOwner && gameCountdown === null ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!socket) {
                            nav(lobbyPath);
                            return;
                          }

                          socket.emit("return_to_lobby", {}, (res?: { ok?: boolean }) => {
                            if (!res?.ok) nav(lobbyPath);
                          });
                        }}
                        className="mx-auto flex h-11 w-[86%] items-center justify-center gap-3 rounded-[6px] bg-[#151A30] px-4 font-inter text-[13px] font-extrabold text-white transition hover:bg-[#1b2340]"
                      >
                        <span className="leading-none">Retour au lobby</span>
                        <LogOut className="h-4 w-4 text-white/95" strokeWidth={2.3} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================== FINAL RECAP (NO GRADIENT) ============================== */
function FinalQuestionRecapClean({ items }: { items: RecapItem[] }) {
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => setSelectedIdx(0), [items]);

  if (!items?.length) return <div className="text-white/55">Aucune question.</div>;

  type Attempt = { answer?: string | null; correct: boolean; ms: number; points: number };
  type Stats = { correct: number; correctQcm: number; wrong: number };
  type Agg = {
    questionId: string;
    index: number;
    text: string;
    correctLabel?: string | null;
    pointsBest: number;
    attempts: Attempt[];
    stats?: Stats;
  };

  const byId = new Map<string, Agg>();
  const ordered: Agg[] = [];

  for (const it of items) {
    let agg = byId.get(it.questionId);
    if (!agg) {
      const s = (it as any)?.stats as Partial<Stats> | undefined;
      const sAlt: Partial<Stats> = {
        correct: (it as any)?.statsCorrect,
        correctQcm: (it as any)?.statsCorrectQcm,
        wrong: (it as any)?.statsWrong,
      };

      const stats: Stats | undefined =
        s &&
        typeof s.correct === "number" &&
        typeof s.correctQcm === "number" &&
        typeof s.wrong === "number"
          ? { correct: s.correct, correctQcm: s.correctQcm, wrong: s.wrong }
          : typeof sAlt.correct === "number" &&
            typeof sAlt.correctQcm === "number" &&
            typeof sAlt.wrong === "number"
          ? { correct: sAlt.correct!, correctQcm: sAlt.correctQcm!, wrong: sAlt.wrong! }
          : undefined;

      agg = {
        questionId: it.questionId,
        index: it.index,
        text: it.text,
        correctLabel: it.correctLabel ?? null,
        pointsBest: Math.max(0, it.points ?? 0),
        attempts: [],
        stats,
      };

      byId.set(it.questionId, agg);
      ordered.push(agg);
    }

    const pts = Math.max(0, it.points ?? 0);
    agg.pointsBest = Math.max(agg.pointsBest, pts);
    if (it.correctLabel) agg.correctLabel = it.correctLabel;

    agg.attempts.push({
      answer: it.yourAnswer ?? null,
      correct: !!it.correct,
      ms: typeof it.responseMs === "number" ? it.responseMs : -1,
      points: pts,
    });
  }

  const selected = ordered[Math.min(selectedIdx, ordered.length - 1)];

  const questionState = (q: Agg): QuestionPanelProgress =>
    q.attempts.length === 0 ? "pending" : q.attempts.some((a) => a.correct) ? "correct" : "wrong";

  const toggleSave = (qId: string) =>
    setSaved((prev) => {
      const next = new Set(prev);
      next.has(qId) ? next.delete(qId) : next.add(qId);
      return next;
    });

  const report = async (q: Agg) => {
    if (reported.has(q.questionId)) return;
    try {
      await fetch(`${API_BASE}/questions/${encodeURIComponent(q.questionId)}/report`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "reported_from_summary" }),
      });
      setReported((prev) => new Set(prev).add(q.questionId));
      window?.alert?.("Merci, la question a été signalée.");
    } catch {
      window?.alert?.("Échec du signalement. Réessaie plus tard.");
    }
  };

  const BookmarkIcon = ({ filled }: { filled: boolean }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none">
      <path
        d="M6 3h12v18l-6-5-6 5V3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );

  const FlagIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none">
      <path
        d="M5 21V5a1 1 0 011.5-.86L14 7l4-2v10l-4 2-7.5-2.86A1 1 0 005 15v6Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );

  const SegmentedBar = ({ stats }: { stats: Stats }) => {
    const total = Math.max(0, stats.correct + stats.correctQcm + stats.wrong);
    if (!total) return null;

    return (
      <div className="mt-2 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className={`h-[10px] rounded-[3px] ${stats.correct > 0 ? "bg-emerald-600" : "bg-emerald-900/35"}`} />
          <div className={`h-[10px] rounded-[3px] ${stats.correctQcm > 0 ? "bg-[#6F5BD4]" : "bg-[#6F5BD4]/35"}`} />
          <div className={`h-[10px] rounded-[3px] ${stats.wrong > 0 ? "bg-[#AF2D33]" : "bg-[#AF2D33]/35"}`} />
        </div>

        <div className="grid grid-cols-3 gap-2 text-white">
          <div className="flex items-center justify-center gap-2">
            <span className="tabular-nums text-[18px] font-brand italic leading-none">{stats.correct}</span>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-[5px] bg-emerald-600 text-[12px] font-semibold leading-none text-white">
              ✓
            </span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="tabular-nums text-[18px] font-brand italic leading-none">{stats.correctQcm}</span>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-[5px] bg-[#6F5BD4] text-[12px] font-semibold leading-none text-white">
              {"\u26A1\uFE0E"}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="tabular-nums text-[18px] font-brand italic leading-none">{stats.wrong}</span>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-[5px] bg-[#AF2D33] text-[12px] font-semibold leading-none text-white">
              ✕
            </span>
          </div>
        </div>
      </div>
    );
  };

  const attempts = selected?.attempts ?? [];
  const hasAttempts = attempts.length > 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#11182A] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_16px_40px_rgba(0,0,0,.55)]">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
          Question {(selected?.index ?? 0) + 1}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">
          / {ordered.length}
        </span>
      </div>

      {selected ? (
        <p className="mt-3 text-[14px] font-semibold leading-snug text-white">{selected.text}</p>
      ) : null}

      {selected?.correctLabel ? (
        <div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-[12px] text-white/70">
            <span className="text-white/45">Bonne réponse :</span>{" "}
            <span className="font-semibold text-white">{selected.correctLabel}</span>
          </div>
          <div className="text-[12px] font-semibold tracking-[0.14em] text-white/60">
            +{selected.pointsBest} pts
          </div>
        </div>
      ) : null}

      {selected?.stats ? (
        <div className="mt-3">
          <SegmentedBar stats={selected.stats} />
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {!hasAttempts ? (
          <div className="text-[12px] text-white/55">Aucune réponse.</div>
        ) : (
          attempts.map((a, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
            >
              <span className={a.correct ? "text-emerald-400" : "text-[#AF2D33]"} aria-hidden>
                {a.correct ? "✅" : "❌"}
              </span>

              <span className="flex-1 truncate text-[12px] text-white">{a.answer ?? "—"}</span>

              <span className="tabular-nums text-[11px] text-white/55">
                {a.ms >= 0 ? `${a.ms} ms` : "—"}
              </span>
            </div>
          ))
        )}
      </div>

      {selected ? (
        <div className="mt-3 pt-3 border-t border-white/10 flex justify-end gap-2">
          <button
            onClick={() => toggleSave(selected.questionId)}
            className="p-1 text-white/60 hover:text-white"
            title="Enregistrer"
            type="button"
          >
            <BookmarkIcon filled={saved.has(selected.questionId)} />
          </button>
          <button
            onClick={() => report(selected)}
            disabled={reported.has(selected.questionId)}
            className={
              reported.has(selected.questionId)
                ? "p-1 text-white/25"
                : "p-1 text-white/60 hover:text-white"
            }
            title={reported.has(selected.questionId) ? "Signalée" : "Signaler"}
            type="button"
          >
            <FlagIcon />
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-start gap-2">
        {ordered.map((q, i) => {
          const state = questionState(q);
          const base =
            "flex h-7 w-7 items-center justify-center rounded-[6px] text-[11px] font-semibold cursor-pointer transition-all";
          let color = "bg-white/20 text-white/70";
          if (state === "correct") color = "bg-emerald-400 text-white";
          if (state === "wrong") color = "bg-[#AF2D33] text-white";

          return (
            <button
              key={q.questionId}
              onClick={() => setSelectedIdx(i)}
              className={`${base} ${color} ${
                i === selectedIdx
                  ? "ring-2 ring-white/40 ring-offset-2 ring-offset-black/20"
                  : ""
              }`}
              aria-label={`Voir la question ${i + 1}`}
              type="button"
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
