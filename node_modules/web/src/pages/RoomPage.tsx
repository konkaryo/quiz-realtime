// web/src/pages/RoomPage.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePersistentGameInputFocus } from "../hooks/usePersistentGameInputFocus";
import type React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { initSfx, playCorrect } from "../sfx";
import crownImage from "../assets/crown.png";
import { getLevelFromExperience } from "../utils/experience";
import { ArrowLeft, ArrowRight, ArrowUp, Clock3, Crosshair, Flag, ImageIcon, LogOut, Play, Settings, Trophy, Zap } from "lucide-react";
import ShapeGrid from "../components/ShapeGrid";
import LoadingScreen from "../components/LoadingScreen";
import RoomQuestionPanel from "../components/RoomQuestionPanel";
import { getThemeMeta } from "../lib/themeMeta";
import "./RoomPage.css";

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
type Phase = "idle" | "countdown" | "playing" | "reveal" | "speed" | "between" | "final";

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
  inactive?: boolean;
};
type SpeedLeader = {
  id: string;
  playerId?: string | null;
  name: string;
  img?: string | null;
  responseMs: number;
  points: number;
  mode: "mc" | "text";
};
type SpeedTiming = { endsAt: number; durationMs: number };

function SpeedCountdown({ timing, label }: { timing: SpeedTiming | null; label: string }) {
  const [, setRevision] = useState(0);
  useEffect(() => {
    const synchronize = () => setRevision((value) => value + 1);
    const interval = window.setInterval(synchronize, 250);
    window.addEventListener("focus", synchronize);
    document.addEventListener("visibilitychange", synchronize);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", synchronize);
      document.removeEventListener("visibilitychange", synchronize);
    };
  }, []);

  const remainingMs = Math.max(0, (timing?.endsAt ?? 0) - Date.now());
  return <div className="room-final-countdown room-speed-countdown">{label} <strong>{Math.ceil(remainingMs / 1000)}s</strong></div>;
}
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
type QuestionStatus = "pending" | "missed" | "correct" | "correct-mc" | "wrong";
type FinalQuestionStats = { correct: number; correctQcm: number; wrong: number };
type FinalQuestionSnapshot = {
  questionId: string;
  index: number;
  text: string;
  img?: string | null;
  theme?: string | null;
  correctLabel?: string | null;
};

/* Récapitulatif final (affiché à gauche uniquement en phase 'final') */
type RecapItem = {
  index: number;
  questionId: string;
  text: string;
  img?: string | null;
  theme?: string | null;
  correctLabel?: string | null;
  yourAnswer?: string | null;
  mode?: "text" | "mc";
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
  const [joiningGame, setJoiningGame] = useState(true);
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
  const [wrongTextAnswers, setWrongTextAnswers] = useState<Array<{ answer: string; result: "close" | "wrong" }>>([]);
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
  const [qcmUsesLeft, setQcmUsesLeft] = useState(0);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastSubmittedTextRef = useRef<string>("");
  const answerModeRef = useRef<"text" | "choice" | null>(null);
  const feedbackWasCorrectRef = useRef<boolean | null>(null);
  const indexRef = useRef(0);
  const totalRef = useRef(0);

  const [lives, setLives] = useState<number>(TEXT_LIVES);
  const livesRef = useRef<number>(TEXT_LIVES);
  const [totalLives, setTotalLives] = useState<number>(TEXT_LIVES);
  const totalLivesRef = useRef<number>(TEXT_LIVES);

  const mcChoicesRef = useRef<ChoiceLite[] | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [speedLeaders, setSpeedLeaders] = useState<SpeedLeader[]>([]);
  const [speedTiming, setSpeedTiming] = useState<SpeedTiming | null>(null);
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
  const [isLeaderboardTargetingPaused, setIsLeaderboardTargetingPaused] = useState(false);
  const leaderboardTargetingTimerRef = useRef<number | null>(null);
  const leaderboardTargetScrollTopRef = useRef<number | null>(null);

  const [roomMeta, setRoomMeta] = useState<RoomMeta | null>(null);
  /* ---- recap des questions reçu en fin de partie ---- */
  const [finalRecap, setFinalRecap] = useState<RecapItem[] | null>(null);
  const [finalQuestionSnapshots, setFinalQuestionSnapshots] = useState<FinalQuestionSnapshot[]>([]);
  const [selectedFinalIndex, setSelectedFinalIndex] = useState(0);
  const [hoveredTrackerIndex, setHoveredTrackerIndex] = useState<number | null>(null);
  const [reportedFinalQuestionIds, setReportedFinalQuestionIds] = useState<Set<string>>(new Set());

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

    setJoiningGame(true);
    const loadingStartedAt = Date.now();
    let loadingTimer: number | undefined;
    let loadingFinished = false;
    const finishLoading = () => {
      if (loadingFinished) return;
      loadingFinished = true;
      loadingTimer = window.setTimeout(
        () => setJoiningGame(false),
        Math.max(0, 700 - (Date.now() - loadingStartedAt)),
      );
    };

    const s = io(SOCKET_URL, {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    setSocket(s);
    s.once("joined", (payload: { qcmUsesLeft?: number; answerAttempts?: number }) => {
      if (typeof payload.qcmUsesLeft === "number") setQcmUsesLeft(Math.max(0, payload.qcmUsesLeft));
      if (typeof payload.answerAttempts === "number") {
        const nextLives = Math.max(1, payload.answerAttempts);
        setTotalLives(nextLives);
        totalLivesRef.current = nextLives;
        setLives(nextLives);
        livesRef.current = nextLives;
      }
      finishLoading();
    });
    s.once("connect_error", finishLoading);
    s.once("error_msg", finishLoading);

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
      (p: { seconds?: number; endsAt?: number; serverNow?: number; leaderboard?: LeaderRow[]; qcmUsesLeft?: number; answerAttempts?: number }) => {
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
        setWrongTextAnswers([]);
        lastSubmittedTextRef.current = "";
        setCorrectId(null);
        setFeedback(null);
        setFeedbackResponseMs(null);
        setFeedbackWasCorrect(null);
        setFeedbackCorrectLabel(null);
        setFeedbackPoints(null);
        setAnswerMode(null);
        setChoicesRevealed(false);
        if (typeof p.qcmUsesLeft === "number") setQcmUsesLeft(Math.max(0, p.qcmUsesLeft));
        if (typeof p.answerAttempts === "number") {
          totalLivesRef.current = Math.max(1, p.answerAttempts);
          setTotalLives(totalLivesRef.current);
        }
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
        textLives?: number;
        serverNow?: number;
      }) => {
        const nextSkew = typeof p.serverNow === "number" ? p.serverNow - Date.now() : skew;
        if (typeof p.serverNow === "number") setSkew(nextSkew);

        setGameCountdown(null);
        setGameCountdownTotal(null);
        setGameCountdownEndsAt(null);
        setGameCountdownDuration(null);
        setPhase("playing");
        setSpeedLeaders([]);
        setSpeedTiming(null);
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
        setWrongTextAnswers([]);
        lastSubmittedTextRef.current = "";
        setFeedback(null);
        setFeedbackResponseMs(null);
        setFeedbackWasCorrect(null);
        setFeedbackCorrectLabel(null);
        setFeedbackPoints(null);
        setAnswerMode(null);
        setChoicesRevealed(false);
        const nextRoundLives = typeof p.textLives === "number" ? Math.max(1, p.textLives) : totalLivesRef.current;
        totalLivesRef.current = nextRoundLives;
        livesRef.current = nextRoundLives;
        setTotalLives(nextRoundLives);
        setLives(nextRoundLives);
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
          Array.from({ length: p.total }, (_, idx) => {
            const existing = prev[idx];
            if (existing && existing !== "pending") return existing;
            if (idx < p.index) return "missed";
            return existing ?? "pending";
          })
        );
        initSfx();
      }
    );

    s.on("multiple_choice", (p: { choices: ChoiceLite[]; qcmUsesLeft?: number }) => {
      if (typeof p.qcmUsesLeft === "number") setQcmUsesLeft(Math.max(0, p.qcmUsesLeft));
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
        result?: "correct" | "close" | "wrong";
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
            if (attempt) setWrongTextAnswers((answers) => [...answers, { answer: attempt, result: p.result === "close" ? "close" : "wrong" }]);
          } else {
            setWrongTextAnswers([]);
            lastSubmittedTextRef.current = "";
          }
          if (p.correct) {
            nextLives = livesRef.current;
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

        if (p.correct) setFeedback("correct");
        else if (mcChoicesRef.current === null && (nextLives ?? 0) > 0)
          setFeedback(null);
        else setFeedback("wrong");

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

    s.on("round_speed", (p: { index?: number; speedLeaders?: SpeedLeader[]; endsAt?: number; durationMs?: number; serverNow?: number }) => {
      if (typeof p.index === "number" && p.index !== indexRef.current) return;
      setSpeedLeaders(
        Array.isArray(p.speedLeaders)
          ? p.speedLeaders.map((player) => {
              const override = player.playerId ? avatarOverridesRef.current[player.playerId] : null;
              return override ? { ...player, img: override } : player;
            })
          : []
      );
      const remainingMs = typeof p.endsAt === "number" && typeof p.serverNow === "number"
        ? Math.max(0, p.endsAt - p.serverNow)
        : Math.max(0, p.durationMs ?? 0);
      setSpeedTiming({
        endsAt: Date.now() + remainingMs,
        durationMs: Math.max(0, p.durationMs ?? remainingMs),
      });
      setPhase("speed");
    });

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
      setWrongTextAnswers([]);
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
          finishLoading();
        }
      } catch {
        s.close();
        finishLoading();
      }
    })();

    return () => {
      if (loadingTimer !== undefined) window.clearTimeout(loadingTimer);
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
      feedbackWasCorrect === true ||
      choicesRevealed ||
      qcmUsesLeft <= 0
    )
      return;
    setChoicesRevealed(true);
    setQcmUsesLeft((uses) => Math.max(0, uses - 1));
    socket.emit("request_choices", {}, (res: { ok: boolean; qcmUsesLeft?: number }) => {
      if (typeof res?.qcmUsesLeft === "number") setQcmUsesLeft(Math.max(0, res.qcmUsesLeft));
      if (!res?.ok) setChoicesRevealed(false);
    });
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

  const choicesForPanel = mcChoices;

  const isPlaying = phase === "playing" && lives > 0 && feedbackWasCorrect !== true;
  const isTimerRunning = phase === "playing";
  const showChoices = !!mcChoices;
  const textLocked = choicesRevealed || showChoices;

  const isRoomOwner = !!selfId && !!roomMeta?.ownerId && roomMeta.ownerId === selfId;
  const lobbyRoomId = roomMeta?.id ?? roomId;
  const lobbyPath = lobbyRoomId ? `/rooms/${lobbyRoomId}/lobby` : "/";

  // ✅ panneau haut
  const TOP_BAR_H = 12; // px
  const NAVBAR_TOP = 52; // px (ton offset actuel)

  const hasScrollableLeaderboard = leaderboard.length > LB_VISIBLE;

  const questionTrackerItems = useMemo(
    () =>
      Array.from({ length: total }, (_, idx) => questionStatuses[idx] ?? "pending"),
    [questionStatuses, total]
  );
  const questionProgress: QuestionStatus[] = useMemo(
    () =>
      questionTrackerItems.map((status) =>
        status === "wrong"
          ? "wrong"
          : status === "missed"
            ? "missed"
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
      attempts: { answer?: string | null; correct: boolean; mode?: "text" | "mc"; responseMs: number; points: number }[];
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
      agg.attempts.push({ answer: item.yourAnswer, correct: !!item.correct, mode: item.mode, responseMs: item.responseMs, points: item.points });
    }

    return ordered.map((agg) => {
      const correctAttempt = agg.attempts.find((attempt) => attempt.correct);
      return {
        ...agg,
        status:
          (agg.attempts.length === 0 ? "pending" : correctAttempt ? correctAttempt.mode === "mc" ? "correct-mc" : "correct" : "wrong") as QuestionStatus,
      };
    });
  }, [finalRecap]);

  const finalDetailsByQuestionId = useMemo(() => {
    const map = new Map<string, { answer?: string | null; stats?: FinalQuestionStats; status: QuestionStatus; correctLabel?: string | null; responseMs?: number; points?: number }>();
    finalQuestions.forEach((q) => {
      const playerAttempt = q.attempts.find((attempt) => attempt.correct) ?? q.attempts.at(-1);
      map.set(q.questionId, { answer: playerAttempt?.answer, stats: q.stats, status: q.status, correctLabel: q.correctLabel, responseMs: playerAttempt?.responseMs, points: playerAttempt?.points });
    });
    return map;
  }, [finalQuestions]);

  const selectedFinalQuestionSnapshot =
    selectedFinalIndex > 0 ? finalQuestionSnapshots[selectedFinalIndex - 1] ?? null : null;

  const selectedFinalQuestion = useMemo(() => {
    if (!selectedFinalQuestionSnapshot) return null;
    const details = finalDetailsByQuestionId.get(selectedFinalQuestionSnapshot.questionId);
    return {
      ...selectedFinalQuestionSnapshot,
      stats: details?.stats,
      status: details?.status ?? "pending",
      correctLabel: details?.correctLabel ?? selectedFinalQuestionSnapshot.correctLabel,
      responseMs: details?.responseMs,
      points: details?.points,
      answer: details?.answer,
    };
  }, [selectedFinalQuestionSnapshot, finalDetailsByQuestionId]);
  const isFinalLeaderboardSelected = selectedFinalIndex === 0;

  useEffect(() => {
    if (phase !== "final" || finalQuestionSnapshots.length === 0) return;

    const handleFinalNavigationKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setHoveredTrackerIndex(null);
        setSelectedFinalIndex((current) => current === 0 ? finalQuestionSnapshots.length : Math.max(1, current - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setHoveredTrackerIndex(null);
        setSelectedFinalIndex((current) => current === 0 ? 1 : Math.min(finalQuestionSnapshots.length, current + 1));
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
    const correctPercent = 100 * stats.correct / total;
    const correctAndQcmPercent = 100 * (stats.correct + stats.correctQcm) / total;
    return {
      stats,
      pieBackground: responseCount === 0
        ? "#30313a"
        : `conic-gradient(#16a34a 0 ${correctPercent}%, #6f5bd4 ${correctPercent}% ${correctAndQcmPercent}%, #af2d33 ${correctAndQcmPercent}% 100%)`,
    };
  }, [selectedFinalQuestion]);

  const reportFinalQuestion = async () => {
    const questionId = selectedFinalQuestion?.questionId;
    if (!questionId || reportedFinalQuestionIds.has(questionId)) return;
    try {
      const response = await fetch(`${API_BASE}/questions/${encodeURIComponent(questionId)}/reports`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "OTHER" }),
      });
      if (!response.ok) return;
      setReportedFinalQuestionIds((current) => new Set(current).add(questionId));
    } catch {
      // Le bouton reste disponible afin que le joueur puisse réessayer.
    }
  };

  const correctAnswerByIndex = useMemo(() => {
    const answers = new Map<number, string>();
    finalQuestionSnapshots.forEach((snapshot, snapshotIndex) => {
      const correctAnswer = (
        finalDetailsByQuestionId.get(snapshot.questionId)?.correctLabel ?? snapshot.correctLabel
      )?.trim();
      answers.set(snapshotIndex, correctAnswer || "Réponse non renseignée");
    });
    return answers;
  }, [finalDetailsByQuestionId, finalQuestionSnapshots]);

  const displayedQuestion = phase === "final" && selectedFinalQuestionPanel
    ? selectedFinalQuestionPanel
    : normalizedQuestion;


  const roomDisplayName = roomMeta?.name?.trim() || "Salon";
  const isCurrentSpeedPlayer = (player: SpeedLeader) =>
    (!!selfPlayerId && player.playerId === selfPlayerId) ||
    (!!selfName && player.name.toLowerCase() === selfName.toLowerCase());
  const currentSpeedIndex = speedLeaders.findIndex(isCurrentSpeedPlayer);
  const currentSpeedPlayer = currentSpeedIndex >= 0 ? speedLeaders[currentSpeedIndex] : null;

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

  const centerLeaderboardOnSelf = () => {
    const list = leaderboardRef.current;
    const selfCell = list?.querySelector<HTMLElement>('[data-self="true"]');
    if (!list || !selfCell || isLeaderboardTargetingPaused) return;
    const listRect = list.getBoundingClientRect();
    const selfRect = selfCell.getBoundingClientRect();
    const centeredTop = list.scrollTop + selfRect.top + selfRect.height / 2 - listRect.top - listRect.height / 2;
    const nextScrollTop = Math.min(Math.max(0, centeredTop), Math.max(0, list.scrollHeight - list.clientHeight));
    if (Math.abs(list.scrollTop - nextScrollTop) <= 1) return;
    leaderboardTargetScrollTopRef.current = nextScrollTop;
    list.scrollTop = nextScrollTop;
  };

  useLayoutEffect(centerLeaderboardOnSelf, [isLeaderboardTargetingPaused, leaderboard, selfIndex]);

  useEffect(() => () => {
    if (leaderboardTargetingTimerRef.current !== null) window.clearTimeout(leaderboardTargetingTimerRef.current);
  }, []);

  const pauseLeaderboardTargeting = () => {
    const list = leaderboardRef.current;
    const targetScrollTop = leaderboardTargetScrollTopRef.current;
    if (list && targetScrollTop !== null && Math.abs(list.scrollTop - targetScrollTop) <= 1) return;
    leaderboardTargetScrollTopRef.current = null;
    setIsLeaderboardTargetingPaused(true);
    if (leaderboardTargetingTimerRef.current !== null) window.clearTimeout(leaderboardTargetingTimerRef.current);
    leaderboardTargetingTimerRef.current = window.setTimeout(() => {
      setIsLeaderboardTargetingPaused(false);
      leaderboardTargetingTimerRef.current = null;
    }, 5000);
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
    <div className="room-game-shell">
      {joiningGame && <LoadingScreen />}
      <div className="room-game-grid" aria-hidden="true">
        <ShapeGrid borderColor="#2f293a" hoverFillColor="#222222" shape="hexagon" direction="diagonal" squareSize={28} speed={0.1} hoverTrailAmount={0} />
      </div>
      <header className="room-game-header">
        <div className="room-game-header-main">
          <button className="room-game-brand" type="button" onClick={() => nav("/")} aria-label="Retour à l’accueil"><img src="/landing/logo-dark.png" alt="" /><span>SYNAPZ</span></button>
          <span className="room-game-header-divider" aria-hidden="true">/</span>
          <div className="room-game-room"><i /><strong>{roomDisplayName}</strong></div>
          <button className="room-game-settings" type="button" onClick={() => nav("/me/account")} aria-label="Accéder aux paramètres"><Settings size={16} /></button>
        </div>
        <div className="room-game-actions">
          {isRoomOwner && (
            <button className="room-game-lobby-return" type="button" onClick={() => socket?.emit("return_to_lobby", {}, () => undefined)}>
              <ArrowLeft size={15} /> Retour au lobby
            </button>
          )}
          <button className="room-game-quit" type="button" onClick={() => nav("/")}>Quitter <LogOut size={15} /></button>
        </div>
      </header>

      <div className="room-game-layout">
          <aside className="room-game-left">
            <div className="room-question-image">
              {displayedQuestion?.img ? <img key={displayedQuestion.img} src={displayedQuestion.img} alt="Illustration de la question" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling?.removeAttribute("hidden"); }} /> : null}
              <div className="room-image-placeholder" hidden={Boolean(displayedQuestion?.img)}><ImageIcon size={25} /><span>Question sans image</span></div>
            </div>
            <section className="room-live-board" aria-label="Classement en direct">
              <ol ref={leaderboardRef} onScroll={pauseLeaderboardTargeting} className="room-live-list lb-scroll">
                {leaderboard.map((row, playerIndex) => {
                  const isSelf = (selfId && row.id === selfId) || (!!selfName && row.name.toLowerCase() === selfName.toLowerCase());
                  const status = phase === "final" ? null : answeredByPg[row.id];
                  return <li className={[isSelf ? "is-self" : "", row.inactive ? "is-inactive" : ""].filter(Boolean).join(" ")} key={row.id} data-self={isSelf ? "true" : undefined}>
                    <span className="room-player-rank">{String(playerIndex + 1).padStart(2, "0")}</span>
                    <span className="room-player-avatar-wrap">
                      <button className="room-player-avatar" type="button" onClick={() => handlePlayerProfile(row)} disabled={!row.playerId}>{row.img ? <img src={row.img} alt="" /> : row.name.slice(0, 1)}</button>
                      {row.inactive && <span className="room-player-inactive" aria-label="Joueur inactif"><i>Z</i><i>Z</i><i>Z</i></span>}
                    </span>
                    <span className="room-player-name">{row.name}</span><strong className="room-player-score">{row.score.toLocaleString("fr-FR")}</strong>
                    <span className={`room-player-status ${status ?? "pending"}`} aria-label={status === "correct" ? "Bonne réponse" : status === "correct-mc" ? "Bonne réponse QCM" : status === "wrong" ? "Mauvaise réponse" : "Pas encore répondu"}>{status === "correct" ? "✓" : status === "correct-mc" ? "⚡︎" : status === "wrong" ? "✕" : ""}</span>
                  </li>;
                })}
              </ol>
            </section>
            <nav className="room-left-progress" aria-label="Suivi des questions">
              {questionProgress.map((status, questionIndex) => phase === "final" ? (
                <button type="button" className={`${status} ${selectedFinalIndex === questionIndex + 1 ? "current" : ""} ${hoveredTrackerIndex === questionIndex ? "is-hovered" : ""}`} data-answer={correctAnswerByIndex.get(questionIndex) ?? "Réponse non renseignée"} onMouseEnter={() => setHoveredTrackerIndex(questionIndex)} onMouseLeave={() => setHoveredTrackerIndex(null)} onClick={() => setSelectedFinalIndex(questionIndex + 1)} aria-pressed={selectedFinalIndex === questionIndex + 1} aria-label={`Afficher la question ${questionIndex + 1}`} key={questionIndex}>{questionIndex + 1}</button>
              ) : questionIndex < index ? (
                <button type="button" tabIndex={-1} className={`${status} ${hoveredTrackerIndex === questionIndex ? "is-hovered" : ""}`} data-answer={correctAnswerByIndex.get(questionIndex) ?? "Réponse non renseignée"} onMouseEnter={() => setHoveredTrackerIndex(questionIndex)} onMouseLeave={() => setHoveredTrackerIndex(null)} aria-label={`Question ${questionIndex + 1} : ${correctAnswerByIndex.get(questionIndex) ?? "réponse non renseignée"}`} key={questionIndex}>{questionIndex + 1}</button>
              ) : <span className={`${status} ${questionIndex === index ? "current" : ""}`} key={questionIndex}>{questionIndex + 1}</span>)}
            </nav>
          </aside>

          <main className="room-play-area" aria-live="polite">
            {gameCountdown !== null ? (
              <div className="room-countdown">
                <div className="room-countdown-heading">
                  <p>DÉBUT DE LA PARTIE</p>
                  <div className="room-timer" style={{ "--timer-progress": gameCountdownProgress } as React.CSSProperties}><strong>{gameCountdownRemainingSeconds ?? gameCountdown}</strong></div>
                </div>
                <div className="room-countdown-players">
                  {visibleCountdownPlayers.map((player) => <div key={player.id}><img src={player.img ?? "/img/profiles/0.avif"} alt="" /><strong>{player.name}</strong><small>Niveau {getLevelFromExperience(player.experience ?? 0)}</small></div>)}
                </div>
              </div>
            ) : phase === "final" && isFinalLeaderboardSelected ? (
              <div className="room-final-view">
                <div className="room-final-rank"><strong>{selfIndex >= 0 ? <>{selfIndex + 1}<sup>{selfIndex === 0 ? "er" : "ème"}</sup></> : "—"}</strong><small>/ {finalRows.length} joueurs</small></div>
                <ol className="room-final-list">{finalRows.slice(0, 3).map((row, rowIndex) => {
                  const isSelf = (selfId && row.id === selfId) || (!!selfName && row.name.toLowerCase() === selfName.toLowerCase());
                  return <li className={`room-speed-row room-final-row${isSelf ? " is-self" : ""}`} key={row.id}>
                    <span className={`room-final-trophy trophy-${rowIndex + 1}`} aria-label={`${rowIndex + 1}${rowIndex === 0 ? "er" : "ème"}`}><Trophy size={23} fill="currentColor" /></span>
                    <span className="room-speed-avatar">{row.img ? <img src={row.img} alt="" /> : row.name.slice(0, 1)}</span>
                    <strong>{row.name}</strong>
                    <strong className="room-final-score">{row.score.toLocaleString("fr-FR")} pts</strong>
                  </li>;
                })}</ol>
                {finalRemaining !== null && <div className="room-final-countdown room-speed-countdown">Prochaine partie dans <strong>{finalRemaining}s</strong></div>}
              </div>
            ) : phase === "final" && selectedFinalQuestionPanel ? (
              <section className="room-final-question" aria-labelledby="room-final-question-title">
                <div className="room-final-question-overview">
                  <p>QUESTION {String(selectedFinalIndex).padStart(2, "0")} <span>/ {String(finalQuestionSnapshots.length).padStart(2, "0")}</span></p>
                  {selectedFinalStatsLayout ? <div className="room-final-pie-summary" aria-label="Statistiques des réponses">
                    <div className="room-final-pie" style={{ background: selectedFinalStatsLayout.pieBackground }} />
                    <div className="room-final-pie-legend">
                      <span className="correct"><i />{selectedFinalStatsLayout.stats.correct} <b>✓</b></span>
                      <span className="correct-mc"><i />{selectedFinalStatsLayout.stats.correctQcm} <b>⚡︎</b></span>
                      <span className="wrong"><i />{selectedFinalStatsLayout.stats.wrong} <b>✕</b></span>
                    </div>
                  </div> : <p className="room-final-no-stats">Aucune statistique disponible.</p>}
                  <div className="room-final-question-nav" aria-label="Navigation entre les questions">
                    <button type="button" onClick={() => setSelectedFinalIndex((current) => Math.max(1, current - 1))} disabled={selectedFinalIndex <= 1} aria-label="Question précédente"><ArrowLeft size={17} /></button>
                    <button type="button" onClick={() => setSelectedFinalIndex((current) => Math.min(finalQuestionSnapshots.length, current + 1))} disabled={selectedFinalIndex >= finalQuestionSnapshots.length} aria-label="Question suivante"><ArrowRight size={17} /></button>
                  </div>
                </div>
                <article className="annex-question-card room-final-question-card">
                  <p>{selectedFinalQuestionPanel.theme ? getThemeMeta(selectedFinalQuestionPanel.theme).label : "QUESTION"}</p>
                  <h1 id="room-final-question-title">{selectedFinalQuestionPanel.text}</h1>
                </article>
                <div className={`annex-feedback room-final-answer-feedback ${selectedFinalQuestion?.status === "correct" || selectedFinalQuestion?.status === "correct-mc" ? "correct" : "wrong"}`}>
                  <span className="annex-feedback-icon" aria-hidden="true">{selectedFinalQuestion?.status === "correct" || selectedFinalQuestion?.status === "correct-mc" ? "✓" : "✕"}</span>
                  <strong>{selectedFinalQuestion?.correctLabel || "Réponse non renseignée"}</strong>
                </div>
                <div className="room-final-question-footer">
                  <button className="room-final-report" type="button" onClick={reportFinalQuestion} disabled={reportedFinalQuestionIds.has(selectedFinalQuestionPanel.id)}><Flag size={15} />{reportedFinalQuestionIds.has(selectedFinalQuestionPanel.id) ? "Question signalée" : "Signaler la question"}</button>
                  <div className="annex-answer-meta room-final-answer-meta">
                    {typeof selectedFinalQuestion?.responseMs === "number" && <span><Clock3 size={17} /><small>TEMPS</small><strong>{(Math.max(0, selectedFinalQuestion.responseMs) / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s</strong></span>}
                    {typeof selectedFinalQuestion?.points === "number" && <span><Zap size={17} /><small>SCORE</small><strong>+{Math.max(0, selectedFinalQuestion.points)} pts</strong></span>}
                  </div>
                </div>
                {finalRemaining !== null && <div className="room-final-countdown room-final-question-countdown">Prochaine partie dans <strong>{finalRemaining}s</strong></div>}
              </section>
            ) : phase === "speed" ? (
              <section className="room-speed-interlude" aria-labelledby="room-speed-title">
                <h1 className="sr-only" id="room-speed-title">Classement de vitesse</h1>
                <div className="room-speed-list" aria-label="Classement de vitesse">
                  {speedLeaders.slice(0, 3).map((player, playerIndex) => (
                    <div className={`room-speed-row ${isCurrentSpeedPlayer(player) ? "is-self" : ""}`} key={player.id}>
                      <span className="room-speed-medal" role="img" aria-label={`${playerIndex + 1}${playerIndex === 0 ? "er" : "e"}`}>{["🥇", "🥈", "🥉"][playerIndex]}</span>
                      <span className="room-speed-avatar">{player.img ? <img src={player.img} alt="" /> : player.name.slice(0, 1)}</span>
                      <strong>{player.name}</strong>
                      <strong className="room-speed-time">{(player.responseMs / 1000).toFixed(2)} s</strong>
                      <strong className="room-speed-score">+{player.points} pts</strong>
                    </div>
                  ))}
                  {currentSpeedPlayer && currentSpeedIndex >= 3 && (
                    <div className="room-speed-row is-self separated">
                      <span className="room-speed-outside-rank">{String(currentSpeedIndex + 1).padStart(2, "0")}</span>
                      <span className="room-speed-avatar">{currentSpeedPlayer.img ? <img src={currentSpeedPlayer.img} alt="" /> : currentSpeedPlayer.name.slice(0, 1)}</span>
                      <strong>{currentSpeedPlayer.name}</strong>
                      <strong className="room-speed-time">{(currentSpeedPlayer.responseMs / 1000).toFixed(2)} s</strong>
                      <strong className="room-speed-score">+{currentSpeedPlayer.points} pts</strong>
                    </div>
                  )}
                  {!speedLeaders.length && <p className="room-speed-empty">Aucune bonne réponse sur cette question.</p>}
                </div>
                {manualQuestionLaunch && index + 1 < total
                  ? <div className="room-final-countdown room-speed-countdown">En attente de l’hôte</div>
                  : <SpeedCountdown timing={speedTiming} label={index + 1 >= total ? "Résultats de la partie dans" : "Prochaine question dans"} />}
              </section>
            ) : normalizedQuestion ? (
              <RoomQuestionPanel questionIndex={index} questionTotal={total} remainingSeconds={remaining ?? 0} timerDurationMs={roundDuration ?? 0} theme={normalizedQuestion.theme} questionText={normalizedQuestion.text} lives={lives} totalLives={totalLives} choices={showChoices ? choicesForPanel : null} selectedChoiceId={selected} correctChoiceId={correctId} isPlaying={isPlaying} isTimerRunning={isTimerRunning} inputRef={inputRef} textAnswer={textAnswer} textLocked={textLocked} animateQuestionText={dynamicQuestionDisplay} questionRevealStartedAtMs={questionRevealStartedAtMs} qcmUsesLeft={qcmUsesLeft} onTextChange={setTextAnswer} onSubmitText={sendText} onShowChoices={showMultipleChoice} onSelectChoice={answerByChoice} feedback={feedbackText} feedbackWasCorrect={feedbackWasCorrect} feedbackCorrectLabel={feedbackCorrectLabel} feedbackPoints={feedbackPoints} feedbackResponseMs={feedbackResponseMs} wrongTextAnswers={wrongTextAnswers} />
            ) : <div className="room-question-loading">Question en cours…</div>}
            {isRoomOwner && manualQuestionLaunch && manualNextAvailable && <button className="room-owner-action" type="button" onClick={launchNextQuestion} disabled={manualNextPending}>{manualNextPending ? "Lancement…" : "Question suivante"}<Play size={15} /></button>}
          </main>
        </div>
    </div>
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

  const questionState = (q: Agg): QuestionStatus =>
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