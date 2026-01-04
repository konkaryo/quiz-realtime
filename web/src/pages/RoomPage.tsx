// web/src/pages/RoomPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { initSfx, playCorrect } from "../sfx";
import { FinalLeaderboard } from "../components/FinalLeaderboard";
import Background from "../components/Background";
import roomBackground from "../assets/background-8.jpg";
import trophy from "../assets/trophy.png";
import divider from "../assets/divider.png";
import playerIcon from "../assets/player.png";
import QuestionPanel, {
  Choice as QuestionPanelChoice,
  QuestionProgress as QuestionPanelProgress,
} from "../components/QuestionPanel";
import { getLevelFromExperience } from "../utils/experience";

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");
const TEXT_LIVES = Number(import.meta.env.VITE_TEXT_LIVES ?? 3);

const CENTER_BG_URL = roomBackground;

type ChoiceLite = { id: string; label: string };
type QuestionLite = {
  id: string;
  text: string;
  img?: string | null;
  theme?: string | null;
  difficulty?: number | null;
};
type Phase = "idle" | "countdown" | "playing" | "reveal" | "between" | "final";
type LeaderRow = {
  id: string;
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
};
type RoomInfoItem = { label: string; value: string | number };
type AnsweredStatus = "correct" | "correct-mc" | "wrong";
type QuestionStatus = "pending" | "correct" | "correct-mc" | "wrong";

/* Récapitulatif final (affiché à gauche uniquement en phase 'final') */
type RecapItem = {
  index: number;
  questionId: string;
  text: string;
  img?: string | null;
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
  rank,
  isSelf,
}: {
  row: LeaderRow;
  rank: number;
  isSelf: boolean;
}) {
  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <div
        className={[
          "w-full min-w-0 flex items-center justify-between gap-3",
          "rounded-[6px]",
          "py-1 pl-3 pr-4",
          "overflow-hidden",
          isSelf
            ? "text-white"
            : "bg-white/[0.03] text-white",
        ].join(" ")}
        style={
          isSelf
            ? {
                background: "linear-gradient(to bottom, #D30E72 0%, #770577 100%)",
              }
            : undefined
        }
      >
        {/* Bloc gauche : rang + avatar + nom */}
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">

          {/* Avatar */}
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

          {/* Nom + niveau */}
          <div className="min-w-0 leading-tight overflow-hidden">
            <div className="truncate text-[13px] font-semibold">
              {row.name}
            </div>

            <div className="text-[11px] text-white/75">
              Niveau {getLevelFromExperience(row.experience ?? 0)}
            </div>
          </div>
        </div>

        {/* Bloc droite : score */}
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

  const [socket, setSocket] = useState<Socket | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  const [answeredByPg, setAnsweredByPg] = useState<Record<string, AnsweredStatus>>({});
  const [question, setQuestion] = useState<QuestionLite | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);

  const [mcChoices, setMcChoices] = useState<ChoiceLite[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackResponseMs, setFeedbackResponseMs] = useState<number | null>(null);
  const [feedbackWasCorrect, setFeedbackWasCorrect] = useState<boolean | null>(null);
  const [feedbackCorrectLabel, setFeedbackCorrectLabel] = useState<string | null>(null);
  const [answerMode, setAnswerMode] = useState<"text" | "choice" | null>(null);
  const [feedbackPoints, setFeedbackPoints] = useState<number | null>(null);
  const [choicesRevealed, setChoicesRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
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
  const [selfName, setSelfName] = useState<string | null>(null);
  const [questionStatuses, setQuestionStatuses] = useState<QuestionStatus[]>([]);
  const [rankPulseKey, setRankPulseKey] = useState(0);
  const rankRef = useRef<number | null>(null);
  const [displayScore, setDisplayScore] = useState(0);
  const displayScoreRef = useRef(0);
  const scoreAnimationRef = useRef<number | null>(null);

  const [roomMeta, setRoomMeta] = useState<RoomMeta | null>(null);

  /* ---- recap des questions reçu en fin de partie ---- */
  const [finalRecap, setFinalRecap] = useState<RecapItem[] | null>(null);

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
  const [roundDuration, setRoundDuration] = useState<number | null>(null);
  const [finalEndsAt, setFinalEndsAt] = useState<number | null>(null);
  const [finalDuration, setFinalDuration] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [gameCountdown, setGameCountdown] = useState<number | null>(null);

  const remaining = useMemo(
    () => (endsAt ? Math.max(0, Math.ceil((endsAt - nowServer()) / 1000)) : null),
    [endsAt, nowTick, skew]
  );

  const finalRemaining = useMemo(
    () =>
      finalEndsAt ? Math.max(0, Math.ceil((finalEndsAt - nowServer()) / 1000)) : null,
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

  useEffect(() => {
    if (!endsAt && !finalEndsAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt, finalEndsAt]);

  useEffect(() => {
    if (gameCountdown === null) return;
    const id = setTimeout(() => {
      setGameCountdown((prev) => (prev && prev > 1 ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(id);
  }, [gameCountdown]);

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
        if (typeof u.displayName === "string") setSelfName(u.displayName);
      } catch {}
    })();
  }, []);

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

    s.on(
      "game_countdown",
      (p: { seconds?: number; endsAt?: number; serverNow?: number }) => {
        const nextSkew = typeof p.serverNow === "number" ? p.serverNow - Date.now() : skew;
        if (typeof p.serverNow === "number") setSkew(nextSkew);

        const seconds =
          typeof p.endsAt === "number"
            ? Math.max(1, Math.ceil((p.endsAt - (Date.now() + nextSkew)) / 1000))
            : Math.max(1, Math.floor(p.seconds ?? 3));

        setPhase("countdown");
        setGameCountdown(seconds);
        setQuestion(null);
        setMcChoices(null);
        setSelected(null);
        setTextAnswer("");
        setCorrectId(null);
        setFeedback(null);
        setFeedbackResponseMs(null);
        setFeedbackWasCorrect(null);
        setFeedbackCorrectLabel(null);
        setFeedbackPoints(null);
        setAnswerMode(null);
        setChoicesRevealed(false);
        setFinalRecap(null);
        setPending(false);
        setQuestionStatuses([]);
      }
    );

    s.on(
      "round_begin",
      (p: {
        index: number;
        total: number;
        endsAt: number;
        question: QuestionLite;
        serverNow?: number;
      }) => {
        if (typeof p.serverNow === "number") setSkew(p.serverNow - Date.now());

        setGameCountdown(null);
        setPhase("playing");
        setIndex(p.index);
        setTotal(p.total);
        indexRef.current = p.index;
        totalRef.current = p.total;
        setEndsAt(p.endsAt);
        setFinalEndsAt(null);
        setFinalDuration(null);

        const serverNow = nowServer();
        setRoundDuration(Math.max(0, p.endsAt - serverNow));

        setQuestion(p.question);
        setAnsweredByPg({});
        setSelected(null);
        setCorrectId(null);
        setMcChoices(() => {
          mcChoicesRef.current = null;
          return null;
        });
        setTextAnswer("");
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
        if (typeof p.responseMs === "number") setFeedbackResponseMs(p.responseMs);
        if (typeof p.correct === "boolean") setFeedbackWasCorrect(p.correct);
        if (typeof p.correctLabel === "string" && p.correctLabel)
          setFeedbackCorrectLabel(p.correctLabel);
        if (p.correctChoiceId) setCorrectId(p.correctChoiceId);
        if (typeof p.points === "number") setFeedbackPoints(p.points);

        let nextLives = livesRef.current;

        if (mcChoicesRef.current === null) {
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
          p.correct || (mcChoicesRef.current !== null ? true : (nextLives ?? 0) <= 0);

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

          const resolvedIndex = typeof p.index === "number" ? p.index : indexRef.current;

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

        if (Array.isArray(p.leaderboard)) setLeaderboard(p.leaderboard);

        setAnsweredByPg((prev) => {
          const rows = Array.isArray(p.leaderboard) ? p.leaderboard : leaderboard;
          if (!rows.length) return prev;
          const next = { ...prev };
          rows.forEach((row) => {
            if (!next[row.id]) next[row.id] = "wrong";
          });
          return next;
        });

        setFeedback((prev) => prev ?? "Temps écoulé !");
        if (p.correctLabel) setFeedbackCorrectLabel(p.correctLabel);
        setEndsAt(null);
        setRoundDuration(null);
        setPending(false);
      }
    );

    s.on("leaderboard_update", (p: { leaderboard: LeaderRow[] }) => {
      setLeaderboard(p.leaderboard ?? []);
    });

    s.on("final_leaderboard", (p: { leaderboard: LeaderRow[]; displayMs?: number }) => {
      setPhase("final");
      setLeaderboard(p.leaderboard ?? []);
      setBitsByPgId({});
      setXpByPgId({});
      setQuestion(null);
      setMcChoices(null);
      setSelected(null);
      setTextAnswer("");
      setCorrectId(null);
      setFeedback(null);
      setFeedbackResponseMs(null);
      setFeedbackWasCorrect(null);
      setFeedbackCorrectLabel(null);
      setFeedbackPoints(null);
      setAnswerMode(null);
      setChoicesRevealed(false);
      setEndsAt(null);
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
              window.dispatchEvent(new CustomEvent("bits-updated", { detail: { total: totalBits } }));
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
            window.dispatchEvent(new CustomEvent("experience-updated", { detail: { total: totalXp } }));
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

          if (room.visibility === "PUBLIC" || !room.code) s.emit("join_game", { roomId: room.id });
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

    setPending(true);
    setAnswerMode("text");
    socket.emit(
      "submit_answer_text",
      { text: t },
      (res: { ok: boolean; reason?: string }) => {
        setPending(false);
        if (!res?.ok && res?.reason === "no-lives") setLives(0);
      }
    );
  };

  const showMultipleChoice = () => {
    if (!socket || phase !== "playing" || lives <= 0 || feedbackWasCorrect === true) return;
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

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const questionProgress: QuestionPanelProgress[] = [];
  const isPlaying = phase === "playing" && lives > 0;
  const showChoices = !!mcChoices;
  const textLocked = choicesRevealed || showChoices;

  const visibilityLabel =
    roomMeta?.visibility === "PUBLIC"
      ? "Public"
      : roomMeta?.visibility === "PRIVATE"
      ? "Privé"
      : "—";

  const difficultyLabel = normalizedQuestion?.difficulty ?? "—";

  // ✅ Layout widths (LG+)
  const leftW = 320;
  const rightW = 300;

  // ✅ panneau haut
  const TOP_BAR_H = 48; // px
  const NAVBAR_TOP = 52; // px (ton offset actuel)
  const fixedTop = NAVBAR_TOP + TOP_BAR_H;

  const hasScrollableLeaderboard = leaderboard.length > LB_VISIBLE;

  const questionTrackerItems = useMemo(
    () => Array.from({ length: total }, (_, idx) => questionStatuses[idx] ?? "pending"),
    [questionStatuses, total]
  );

  // ✅ Nom du salon affiché en gros à droite
  const roomDisplayName = roomMeta?.name?.trim() || "-";

  const roomInfoItems: RoomInfoItem[] = [
    { label: "Public", value: visibilityLabel },
    { label: "Joueurs", value: Math.max(leaderboard.length, 1) },
    { label: "Difficulté", value: difficultyLabel },
    { label: "ID", value: roomMeta?.id ?? roomId ?? "—" },
    { label: "Code", value: roomMeta?.code ?? "—" },
  ];

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

  // ✅ rendu unique d'une ligne leaderboard (cellule + badge) => garantit la réplique exacte
  const renderLeaderboardLine = (r: LeaderRow, rank: number, isSelf: boolean) => {
    const status = answeredByPg[r.id];

    const badgeClass =
      status === "correct"
        ? "bg-emerald-400 text-white"
        : status === "correct-mc"
        ? "bg-amber-400 text-white"
        : status === "wrong"
        ? "bg-red-500 text-white"
        : "bg-white/20 text-white/0";

    const badgeTitle =
      status === "correct"
        ? "Bonne réponse"
        : status === "correct-mc"
        ? "Bonne réponse (QCM)"
        : status === "wrong"
        ? "Mauvaise réponse"
        : "Pas encore répondu";

    const badgeIcon =
      status === "correct" ? "✓" : status === "correct-mc" ? "~" : status === "wrong" ? "✕" : "";

    return (
      <div className="flex items-center gap-2">

    {/* Rang à gauche de la cellule */}
    <span className="w-8 flex-shrink-0 tabular-nums text-[12px] text-right opacity-80">
      #{rank}
    </span>
        
        <div className="flex-1 min-w-0">
          <PlayerCell row={r} rank={rank} isSelf={isSelf} />
        </div>

        <span
          className={[
            "inline-flex h-4 w-4 items-center justify-center rounded-[3px] text-[10px] font-bold leading-none flex-shrink-0",
            badgeClass,
          ].join(" ")}
          title={badgeTitle}
          aria-label={badgeTitle}
        >
          {badgeIcon}
        </span>
      </div>
    );
  };

  return (
    <>
      {/* ✅ fond uni demandé */}
      <div aria-hidden className="fixed inset-0 bg-[#15171E]" />

      {/* ✅ Scrollbar style global */}
      <style>{`
        .lb-scroll {
          scrollbar-width: thin;
          scrollbar-color: #57585A #24252B;
        }
        .lb-scroll::-webkit-scrollbar { width: 12px; }
        .lb-scroll::-webkit-scrollbar-track {
          background: #24252B;
          border-radius: 999px;
        }
        .lb-scroll::-webkit-scrollbar-button {
          background-color: #57585A;
          height: 12px;
        }
        .lb-scroll::-webkit-scrollbar-thumb {
          background: #57585A;
          border-radius: 999px;
          border: 3px solid rgba(0,0,0,0);
          background-clip: padding-box;
        }
        .lb-scroll::-webkit-scrollbar-thumb:hover {
          background: #57585A;
          border: 3px solid rgba(0,0,0,0);
          background-clip: padding-box;
        }

        @keyframes countdownPop {
          0% { transform: scale(0.6); opacity: 0; }
          35% { transform: scale(1.1); opacity: 1; }
          70% { transform: scale(1); opacity: 0.9; }
          100% { transform: scale(0.85); opacity: 0; }
        }
        .countdown-pop {
          animation: countdownPop 1s ease-in-out infinite;
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
            <aside
              className="hidden lg:block fixed bottom-0 left-0 z-20 overflow-x-hidden"
              style={{ top: fixedTop, width: leftW }}
            >
              <div className="h-full overflow-x-hidden bg-[#15171E] pb-3 pr-3 pt-3 pl-6">
                <div className="rounded-[6px] bg-[#1F2128] px-4 pt-6 pb-10 flex flex-col overflow-x-hidden">
                  {/* ✅ Position + Score */}
                  {rankLabel || selfRow ? (
                    <div className="rounded-[6px] border border-white/10 bg-[#15171E] px-3 py-2">
                      <div className="flex items-center justify-between">
                        {/* Position (rang) + trophy */}
                        <div className="flex items-center gap-2 min-w-0">
                          <img src={trophy} alt="" className="h-4 w-4 opacity-90" draggable={false} />
                          <div
                            key={rankPulseKey}
                            className="rank-pop font-extrabold tabular-nums text-white"
                            style={rankLabel ? (rankAnimationVars ?? undefined) : undefined}
                          >
                            {rankLabel ? `${rankLabel.value}${rankLabel.suffix}` : "—"}
                          </div>
                        </div>

                        <span className="mx-3 text-white/35">—</span>

                        {/* Score */}
                        <div className="font-extrabold tabular-nums text-white/90">
                          {displayScore}
                          <span className="ml-1 text-[12px] font-semibold text-white/55">pts</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-white/45 text-sm">—</div>
                  )}

                  <div className="mt-6 flex items-center justify-center gap-3">
                    <img
                      src={divider}
                      alt=""
                      className="h-3 w-auto opacity-70"
                      draggable={false}
                    />

                    <div className="flex items-center justify-center gap-2 text-white">
                      <img
                        src={playerIcon}
                        alt=""
                        className="h-4 w-4 object-contain"
                        draggable={false}
                      />

                      <span className="text-[12px] font-semibold uppercase tracking-[0.22em] tabular-nums">
                        {Math.max(leaderboard.length, 1)}
                      </span>
                    </div>

                    <img
                      src={divider}
                      alt=""
                      className="h-3 w-auto opacity-70"
                      draggable={false}
                    />
                  </div>

                  <div className="mt-4 flex-1 min-h-0 overflow-x-hidden">
                    {leaderboard.length === 0 ? (
                      <div className="text-white/45 text-sm">—</div>
                    ) : (
                      <>
                        <ol
                          className={["lb-scroll", "m-0 space-y-2", "overflow-y-auto overflow-x-hidden", "pr-3"].join(
                            " "
                          )}
                          style={{ maxHeight: "55vh" }}
                        >
                          {leaderboard.map((r, i) => {
                            const isSelf =
                              (selfId && r.id === selfId) ||
                              (!!selfName &&
                                typeof r.name === "string" &&
                                r.name.toLowerCase() === selfName.toLowerCase());

                            return (
                              <li key={r.id} className="max-w-full overflow-x-hidden">
                                {renderLeaderboardLine(r, i + 1, isSelf)}
                              </li>
                            );
                          })}
                        </ol>

                        {/* ✅ réplique EXACTE de la ligne dans la liste */}
                        {hasScrollableLeaderboard && selfRow ? (
                          <div className="mt-4 pt-4 border-t border-white/10 overflow-x-hidden">
                            {renderLeaderboardLine(selfRow, selfIndex + 1, true)}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </aside>

            {/* CENTER */}
            <div
              className="lg:ml-[320px] lg:mr-[300px] lg:overflow-y-auto lb-scroll"
              style={{
                height: `calc(100dvh - ${NAVBAR_TOP}px - ${TOP_BAR_H}px)`,
                marginTop: TOP_BAR_H,
              }}
            >
              <main className="relative overflow-hidden bg-[#15171E]">
                {<Background position="absolute" />}
                <div className="absolute inset-0 bg-[#15171E]" aria-hidden />

                <div className="relative px-5 md:px-10 py-10" style={{ minHeight: "100%" }}>
                  <div className="flex items-start justify-center">
                    <div className="w-full max-w-[760px]">
                      {gameCountdown !== null ? (
                        <div className="flex min-h-[360px] items-center justify-center">
                          <div className="countdown-pop text-[96px] font-extrabold text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.35)]">
                            {gameCountdown}
                          </div>
                        </div>
                      ) : phase === "final" && finalRemaining !== null ? (
                        <div className="mb-10 -mt-6 px-1 py-2">
                          <div className="h-1 w-full overflow-hidden rounded-[1px] bg-white/10">
                            <div
    className="h-full transition-[width] duration-300"
    style={{
      width: `${finalProgress * 100}%`,
      backgroundColor: "#FFFFFF",
    }}
                            />
                          </div>
                          <div className="mt-2 text-center">
                            <div className="text-sm font-semibold text-white/90">
                              Une nouvelle partie va bientôt commencer...
                            </div>
                            <div className="text-[12px] text-white/60">
                              {formatCountdown(finalRemaining)}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {phase === "final" ? (
                        <FinalLeaderboard rows={finalRows} selfId={selfId} selfName={selfName} />
                      ) : normalizedQuestion ? (
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
                            textLocked={textLocked}
                            onChangeText={setTextAnswer}
                            onSubmitText={sendText}
                            onShowChoices={showMultipleChoice}
                            feedback={feedbackText}
                            feedbackResponseMs={feedbackResponseMs}
                            feedbackWasCorrect={feedbackWasCorrect}
                            feedbackCorrectLabel={feedbackCorrectLabel}
                            feedbackPoints={feedbackPoints}
                            answerMode={answerMode}
                            choicesRevealed={choicesRevealed}
                            showChoices={showChoices}
                            choices={choicesForPanel}
                            selectedChoice={selected}
                            correctChoiceId={correctId}
                            onSelectChoice={(choice) => answerByChoice(choice.id)}
                            questionProgress={questionProgress}
                          />
                        </div>
                      ) : phase === "countdown" ? null : (
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-10 text-center text-sm text-white/70">
                          {phase === "between"
                            ? ""
                            : phase === "idle"
                            ? "En attente des joueurs…"
                            : "Préparation du prochain round…"}
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
              <div className="h-full overflow-x-hidden bg-[#15171E] pb-3 pl-3 pr-6 pt-3">
                <div className="rounded-[6px] bg-[#1F2128] px-6 py-6 flex flex-col overflow-x-hidden">
                  <div className="mt-6">
                    <SectionTitle>Progression</SectionTitle>
                    <div className="mt-3 grid grid-cols-6 gap-2">
                      {questionTrackerItems.length ? (
                        questionTrackerItems.map((status, idx) => {
                          const isCurrent =
                            idx === index && phase !== "final" && phase !== "between";

                          const colorClass =
                            status === "correct"
                              ? "bg-emerald-400 text-white"
                              : status === "correct-mc"
                              ? "bg-amber-400 text-white"
                              : status === "wrong"
                              ? "bg-red-500 text-white"
                              : "bg-white/20 text-white/70";

                          return (
                            <div
                              key={`q-${idx + 1}`}
                              className={[
                                "flex h-7 w-7 items-center justify-center rounded-[6px] text-[11px] font-semibold",
                                "transition-all",
                                colorClass,
                                isCurrent
                                  ? "ring-2 ring-white/70 ring-offset-2 ring-offset-black/20"
                                  : "",
                              ].join(" ")}
                              aria-label={`Question ${idx + 1}`}
                              title={`Question ${idx + 1}`}
                            >
                              {idx + 1}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-white/45 text-sm">—</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* MOBILE */}
          <div className="lg:hidden px-5 md:px-8 pb-10" style={{ marginTop: TOP_BAR_H }}>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 overflow-x-hidden">
                <SectionTitle right={`${Math.max(leaderboard.length, 1)} joueurs`}>
                  Classement
                </SectionTitle>

                <div className="mt-3 max-h-[360px] overflow-y-auto overflow-x-hidden pr-2 lb-scroll">
                  {(leaderboard ?? []).map((r, i) => (
                    <div
                      key={r.id}
                      className={[
                        "flex items-center justify-between rounded-xl border px-3 py-2 overflow-x-hidden",
                        (selfId && r.id === selfId) ||
                        (!!selfName &&
                          typeof r.name === "string" &&
                          r.name.toLowerCase() === selfName.toLowerCase())
                          ? "bg-gradient-to-b from-[#D30E72] to-[#770577] text-white border-transparent"
                          : "border-white/10 bg-white/[0.02]",
                      ].join(" ")}
                    >
                      <div className="min-w-0 flex items-center gap-2 overflow-hidden">
                        <span className="w-5 text-right text-white/50 tabular-nums flex-shrink-0">
                          {i + 1}.
                        </span>
                        <span className="truncate text-[13px] font-semibold">{r.name}</span>
                      </div>
                      <span className="tabular-nums text-[13px] font-semibold text-white/85 flex-shrink-0">
                        {r.score}
                      </span>
                    </div>
                  ))}
                </div>

                {hasScrollableLeaderboard && selfRow ? (
                  <div className="mt-4 pt-4 border-t border-white/10 overflow-x-hidden">
                    <div className="flex items-center justify-between rounded-xl border border-transparent bg-gradient-to-b from-[#D30E72] to-[#770577] px-3 py-2 overflow-x-hidden text-white">
                      <div className="min-w-0 flex items-center gap-2 overflow-hidden">
                        <span className="w-6 text-right text-white/90 tabular-nums flex-shrink-0">
                          {selfIndex + 1}.
                        </span>
                        <span className="truncate text-[13px] font-semibold">{selfRow.name}</span>
                      </div>
                      <span className="tabular-nums text-[13px] font-semibold text-white/90 flex-shrink-0">
                        {selfRow.score}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 min-w-0 overflow-hidden">
                <SectionTitle>Salon</SectionTitle>

                <div className="mt-3 mb-5 min-w-0">
                  <div
                    className="text-[18px] leading-tight font-semibold text-white/95 overflow-hidden text-ellipsis whitespace-nowrap"
                    title={roomDisplayName}
                  >
                    {roomDisplayName}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  {roomInfoItems.map((it) => (
                    <SmallPill key={it.label} label={it.label} value={it.value} />
                  ))}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    className="rounded-xl px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                  >
                    Inviter
                  </button>
                </div>

                <div className="mt-5">
                  <SectionTitle>Progression</SectionTitle>
                  <div className="mt-3 grid grid-cols-6 gap-2">
                    {questionTrackerItems.length ? (
                      questionTrackerItems.map((status, idx) => {
                        const isCurrent =
                          idx === index && phase !== "final" && phase !== "between";

                        const colorClass =
                          status === "correct"
                            ? "bg-emerald-400 text-white"
                            : status === "correct-mc"
                            ? "bg-amber-400 text-white"
                            : status === "wrong"
                            ? "bg-red-500 text-white"
                            : "bg-white/20 text-white/70";

                        return (
                          <div
                            key={`mq-${idx + 1}`}
                            className={[
                              "flex h-7 w-7 items-center justify-center rounded-[6px] text-[11px] font-semibold",
                              "transition-all",
                              colorClass,
                              isCurrent
                                ? "ring-2 ring-white/70 ring-offset-2 ring-offset-black/20"
                                : "",
                            ].join(" ")}
                            aria-label={`Question ${idx + 1}`}
                            title={`Question ${idx + 1}`}
                          >
                            {idx + 1}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-white/45 text-sm">—</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* (Le reste du fichier continue : FinalQuestionRecapClean, etc.) */}
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

    const wCorrect = (100 * stats.correct) / total;
    const wQcm = (100 * stats.correctQcm) / total;
    const wWrong = (100 * stats.wrong) / total;

    return (
      <div className="mt-2">
        <div className="h-[8px] rounded-full overflow-hidden border border-white/10 bg-white/5 flex">
          <div className="h-full bg-emerald-400" style={{ width: `${wCorrect}%` }} />
          <div className="h-full bg-amber-400" style={{ width: `${wQcm}%` }} />
          <div className="h-full bg-red-500" style={{ width: `${wWrong}%` }} />
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
              <span className={a.correct ? "text-emerald-400" : "text-red-500"} aria-hidden>
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
            className={reported.has(selected.questionId) ? "p-1 text-white/25" : "p-1 text-white/60 hover:text-white"}
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
          if (state === "wrong") color = "bg-red-500 text-white";

          return (
            <button
              key={q.questionId}
              onClick={() => setSelectedIdx(i)}
              className={`${base} ${color} ${
                i === selectedIdx ? "ring-2 ring-white/40 ring-offset-2 ring-offset-black/20" : ""
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
