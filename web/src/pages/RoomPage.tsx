// web/src/pages/RoomPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { initSfx, playCorrect } from "../sfx";
import { FinalLeaderboard } from "../components/FinalLeaderboard";
import Background from "../components/Background";
import QuestionPanel, {
  Choice as QuestionPanelChoice,
  QuestionProgress as QuestionPanelProgress,
} from "../components/QuestionPanel";

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");
const TEXT_LIVES = Number(import.meta.env.VITE_TEXT_LIVES ?? 3);

/**
 * ✅ Background central uniquement (zone centrale complète).
 * Mets ton image dans /public et adapte le chemin si besoin.
 * Exemple: /public/center-bg.png  ->  "/center-bg.png"
 */
const CENTER_BG_URL = "/center-bg.png";

type ChoiceLite = { id: string; label: string };
type QuestionLite = {
  id: string;
  text: string;
  img?: string | null;
  theme?: string | null;
  difficulty?: number | null;
};
type Phase = "idle" | "playing" | "reveal" | "between" | "final";
type LeaderRow = { id: string; name: string; score: number; img?: string | null };
type RoomMeta = { id: string; code: string | null; visibility: "PUBLIC" | "PRIVATE"; name?: string | null };
type RoomInfoItem = { label: string; value: string | number };

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

      {/* ✅ pas de dépassement : tronque proprement */}
      <div
        className="mt-0.5 text-[12px] font-semibold tabular-nums text-white overflow-hidden text-ellipsis whitespace-nowrap"
        title={valueStr}
      >
        {valueStr}
      </div>
    </div>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
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
  answered,
}: {
  row: LeaderRow;
  rank: number;
  isSelf: boolean;
  answered?: "correct" | "wrong";
}) {
  return (
    <div className="flex items-stretch gap-2 w-full max-w-full overflow-x-hidden">
      <span className="w-4 text-right text-[12px] opacity-70 tabular-nums leading-[42px] flex-shrink-0">
        {rank}
      </span>

<div
  className={[
    "w-full min-w-0 flex items-center justify-between gap-3",
    "rounded-xl",
    "px-3 py-2",
    "overflow-hidden", // ✅ évite les liserés aux bords
    isSelf
      ? "border-0 bg-gradient-to-r from-[#D30E72] to-[#770577] text-white"
      : "border border-white/10 bg-white/[0.03]",
  ].join(" ")}
>
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          {row.img ? (
            <img
              src={row.img}
              alt=""
              className="w-7 h-7 rounded-md object-cover flex-shrink-0 border border-white/10"
              draggable={false}
              loading="lazy"
            />
          ) : (
            <div className="w-7 h-7 rounded-md bg-white/10 border border-white/10 flex-shrink-0" />
          )}

          <div className="min-w-0 leading-tight overflow-hidden">
            <div className="truncate text-[13px] font-semibold text-white/90">{row.name}</div>
            <div className="text-[11px] text-white/45">Niveau 1</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="tabular-nums text-[13px] font-semibold text-white/85">{row.score}</span>

          {/* ✅ point EXACT comme l’ancienne version */}
          <span
            className={[
              "inline-block w-2.5 h-2.5 rounded-full transition-colors",
              answered === "correct" ? "bg-white" : answered === "wrong" ? "bg-red-500" : "bg-white/20",
            ].join(" ")}
            title={
              answered === "correct"
                ? "Bonne réponse"
                : answered === "wrong"
                ? "Mauvaise réponse"
                : "Pas encore répondu"
            }
          />
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

  const [answeredByPg, setAnsweredByPg] = useState<Record<string, "correct" | "wrong">>({});
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
  const [choicesRevealed, setChoicesRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [lives, setLives] = useState<number>(TEXT_LIVES);
  const livesRef = useRef<number>(TEXT_LIVES);

  const mcChoicesRef = useRef<ChoiceLite[] | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [selfName, setSelfName] = useState<string | null>(null);

  const [roomMeta, setRoomMeta] = useState<RoomMeta | null>(null);

  /* ---- recap des questions reçu en fin de partie ---- */
  const [finalRecap, setFinalRecap] = useState<RecapItem[] | null>(null);

  // ✅ Top 10 visibles (le reste accessible via scroll)
  const LB_VISIBLE = 10;

  const selfIndex = useMemo(() => {
    return leaderboard.findIndex(
      (r) =>
        (selfId && r.id === selfId) ||
        (!!selfName && typeof r.name === "string" && r.name.toLowerCase() === selfName.toLowerCase())
    );
  }, [leaderboard, selfId, selfName]);

  /* -------- timer bar (inversée) -------- */
  const [skew, setSkew] = useState(0);
  const nowServer = () => Date.now() + skew;

  // timing
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [roundDuration, setRoundDuration] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const remaining = useMemo(
    () => (endsAt ? Math.max(0, Math.ceil((endsAt - nowServer()) / 1000)) : null),
    [endsAt, nowTick, skew]
  );
  const timerProgress = useMemo(() => {
    if (!endsAt || !roundDuration) return 0;
    const remainingMs = Math.max(0, endsAt - nowServer());
    const progress = remainingMs / roundDuration;
    return Math.min(1, Math.max(0, progress));
  }, [endsAt, roundDuration, nowTick, skew]);

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  useEffect(() => {
    if (mcChoices) setChoicesRevealed(true);
  }, [mcChoices]);

  /* ----------------------------- effects ----------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
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
      "round_begin",
      (p: { index: number; total: number; endsAt: number; question: QuestionLite; serverNow?: number }) => {
        if (typeof p.serverNow === "number") setSkew(p.serverNow - Date.now());

        setPhase("playing");
        setIndex(p.index);
        setTotal(p.total);
        setEndsAt(p.endsAt);

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
        setAnswerMode(null);
        setChoicesRevealed(false);
        setLives(() => {
          livesRef.current = TEXT_LIVES;
          return TEXT_LIVES;
        });
        setFinalRecap(null);
        setPending(false);
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
      (p: { correct: boolean; correctChoiceId: string | null; correctLabel: string | null; responseMs?: number }) => {
        if (typeof p.responseMs === "number") setFeedbackResponseMs(p.responseMs);
        if (typeof p.correct === "boolean") setFeedbackWasCorrect(p.correct);
        if (typeof p.correctLabel === "string" && p.correctLabel) setFeedbackCorrectLabel(p.correctLabel);
        if (p.correctChoiceId) setCorrectId(p.correctChoiceId);

        let nextLives = livesRef.current;
        if (mcChoicesRef.current === null) {
          if (p.correct) {
            setLives(() => {
              livesRef.current = 0;
              return 0;
            });
            nextLives = 0;
          } else {
            let computedLives = livesRef.current;
            setLives((prev) => {
              const updated = Math.max(0, prev - 1);
              computedLives = updated;
              livesRef.current = updated;
              if (updated > 0) {
                setTextAnswer("");
                requestAnimationFrame(() => inputRef.current?.focus());
              }
              return updated;
            });
            nextLives = computedLives;
          }
        }

        if (p.correct) setFeedback("Bravo !");
        else if (mcChoicesRef.current === null && (nextLives ?? 0) > 0) setFeedback("Mauvaise réponse, essayez encore !");
        else setFeedback("Mauvaise réponse !");

        try {
          if (p.correct) playCorrect();
        } catch {}
      }
    );

    s.on("player_answered", (p: { pgId: string; correct?: boolean }) => {
      if (!p?.pgId) return;
      setAnsweredByPg((prev) => ({ ...prev, [p.pgId]: p.correct ? "correct" : "wrong" }));
    });

    s.on(
      "round_end",
      (p: { index: number; correctChoiceId: string | null; correctLabel?: string | null; leaderboard?: LeaderRow[] }) => {
        setPhase("reveal");
        setCorrectId(p.correctChoiceId);
        if (Array.isArray(p.leaderboard)) setLeaderboard(p.leaderboard);
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

    s.on("final_leaderboard", (p: { leaderboard: LeaderRow[] }) => {
      setPhase("final");
      setLeaderboard(p.leaderboard ?? []);
      setQuestion(null);
      setMcChoices(null);
      setSelected(null);
      setTextAnswer("");
      setCorrectId(null);
      setFeedback(null);
      setFeedbackResponseMs(null);
      setFeedbackWasCorrect(null);
      setFeedbackCorrectLabel(null);
      setAnswerMode(null);
      setChoicesRevealed(false);
      setEndsAt(null);
      setRoundDuration(null);
      setPending(false);
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
      setPending(false);
    });

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/rooms/${roomId}`, { credentials: "include" });
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
  }, [roomId, nav]);

  useEffect(() => {
    if (phase === "playing") inputRef.current?.focus();
  }, [phase, question]);

  useEffect(() => {
    livesRef.current = lives;
  }, [lives]);

  useEffect(() => {
    mcChoicesRef.current = mcChoices;
  }, [mcChoices]);

  /* --------------------------- actions --------------------------- */
  const sendText = () => {
    if (!socket || phase !== "playing" || !question || lives <= 0) return;
    if (choicesRevealed || mcChoicesRef.current) return;
    const t = (textAnswer || "").trim();
    if (!t) return;
    setPending(true);
    setAnswerMode("text");
    socket.emit("submit_answer_text", { text: t }, (res: { ok: boolean; reason?: string }) => {
      setPending(false);
      if (!res?.ok && res?.reason === "no-lives") setLives(0);
    });
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
      difficulty: question.difficulty !== null && question.difficulty !== undefined ? String(question.difficulty) : null,
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
    () => (mcChoices ? mcChoices.map<QuestionPanelChoice>((c) => ({ id: c.id, label: c.label })) : null),
    [mcChoices]
  );

  const questionProgress: QuestionPanelProgress[] = [];
  const isPlaying = phase === "playing" && lives > 0;
  const showChoices = !!mcChoices;
  const textLocked = choicesRevealed || showChoices;

  const visibilityLabel =
    roomMeta?.visibility === "PUBLIC" ? "Public" : roomMeta?.visibility === "PRIVATE" ? "Privé" : "—";

  const difficultyLabel = normalizedQuestion?.difficulty ?? "—";

  // ✅ Layout widths (LG+)
  const leftW = 280; // (déjà élargi légèrement)
  const rightW = 300;

  const hasScrollableLeaderboard = leaderboard.length > LB_VISIBLE;
  const selfRow = selfIndex >= 0 ? leaderboard[selfIndex] : null;

  // ✅ Nom du salon affiché en gros à droite
  const roomDisplayName = roomMeta?.name?.trim() || "-";

  const roomInfoItems: RoomInfoItem[] = [
    { label: "Public", value: visibilityLabel },
    { label: "Joueurs", value: Math.max(leaderboard.length, 1) },
    { label: "Difficulté", value: difficultyLabel },
    { label: "ID", value: roomMeta?.id ?? roomId ?? "—" },
    { label: "Code", value: roomMeta?.code ?? "—" },
  ];

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 bg-gradient-to-br from-[#050816] via-[#050014] to-[#1b0308]"
      />

      {/* ✅ Scrollbar style (ancienne vibe) pour le classement */}
      <style>{`
        .lb-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,.22) rgba(255,255,255,.06);
        }
        .lb-scroll::-webkit-scrollbar { width: 12px; }
        .lb-scroll::-webkit-scrollbar-track {
          background: rgba(255,255,255,.06);
          border-radius: 999px;
        }
        .lb-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,.22);
          border-radius: 999px;
          border: 3px solid rgba(0,0,0,0);
          background-clip: padding-box;
        }
        .lb-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,.32);
          border: 3px solid rgba(0,0,0,0);
          background-clip: padding-box;
        }
      `}</style>

      {/* Overlay global sombre (uniforme) */}
      <div className="fixed inset-0 bg-slate-950/70 pointer-events-none" />

      <div className="relative z-10 min-h-[calc(100dvh-64px)] text-white lg:overflow-hidden">
        {/* STRUCTURE GLOBALE — 3 zones + séparateurs continus */}
        <div className="relative">
          {/* séparateurs (continus, un peu plus épais) */}

          <div
            className="hidden lg:block fixed top-16 bottom-0 w-[2px] bg-white/15 z-30"
            style={{ left: leftW }}
            aria-hidden
          />
          <div
            className="hidden lg:block fixed top-16 bottom-0 w-[2px] bg-white/15 z-30"
            style={{ right: rightW }}
            aria-hidden
          />

          <div className="relative grid grid-cols-1 lg:block">
            {/* LEFT */}
            <aside className="hidden lg:block fixed top-16 bottom-0 left-0 w-[280px] z-20 overflow-x-hidden">
              <div className="h-full px-6 py-6 flex flex-col overflow-x-hidden">
                <SectionTitle right={`${Math.max(leaderboard.length, 1)} joueurs`}>Classement</SectionTitle>

                <div className="mt-4 flex-1 min-h-0 overflow-x-hidden">
                  {leaderboard.length === 0 ? (
                    <div className="text-white/45 text-sm">—</div>
                  ) : (
                    <>
                      <ol
                        className={[
                          "lb-scroll",
                          "m-0 space-y-2",
                          "overflow-y-auto overflow-x-hidden",
                          "pr-3",
                          "max-h-[560px]",
                          "min-h-[240px]",
                        ].join(" ")}
                      >
                        {leaderboard.map((r, i) => {
                          const isSelf =
                            (selfId && r.id === selfId) ||
                            (!!selfName &&
                              typeof r.name === "string" &&
                              r.name.toLowerCase() === selfName.toLowerCase());

                          return (
                            <li key={r.id} className="max-w-full overflow-x-hidden">
                              <PlayerCell row={r} rank={i + 1} isSelf={isSelf} answered={answeredByPg[r.id]} />
                            </li>
                          );
                        })}
                      </ol>

                      {hasScrollableLeaderboard && selfRow ? (
                        <div className="mt-4 pt-4 border-t border-white/10 overflow-x-hidden">
                          <PlayerCell
                            row={selfRow}
                            rank={selfIndex + 1}
                            isSelf={true}
                            answered={answeredByPg[selfRow.id]}
                          />
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                {leaderboard.length > 0 ? (
                  <div className="mt-4 text-[11px] text-white/45">
                    {hasScrollableLeaderboard ? "Scroll pour voir tout le classement" : "—"}
                  </div>
                ) : null}
              </div>
            </aside>

            {/* CENTER (zone complète) */}
            <div className="lg:ml-[280px] lg:mr-[300px] lg:h-[calc(100dvh-64px)] lg:overflow-y-auto lb-scroll">
              <main
                className="relative overflow-hidden bg-slate-900/40"
                style={{
                  backgroundImage: `url(${CENTER_BG_URL})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                }}
              >
                <Background position="absolute" />
                <div className="absolute inset-0 bg-slate-900/40" aria-hidden />

                <div className="relative min-h-[calc(100dvh-64px)] px-5 md:px-10 py-10">
                <div className="flex min-h-[calc(100dvh-64px-80px)] items-start justify-center pt-10">
                  <div className="w-full max-w-[900px]">
                    {phase === "final" ? (
                      <FinalLeaderboard rows={leaderboard} selfId={selfId} selfName={selfName} />
                    ) : normalizedQuestion ? (
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
                        answerMode={answerMode}
                        choicesRevealed={choicesRevealed}
                        showChoices={showChoices}
                        choices={choicesForPanel}
                        selectedChoice={selected}
                        correctChoiceId={correctId}
                        onSelectChoice={(choice) => answerByChoice(choice.id)}
                        questionProgress={questionProgress}
                      />
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-10 text-center text-sm text-white/70">
                        {phase === "between"
                          ? ""
                          : phase === "idle"
                          ? "En attente des joueurs…"
                          : "Préparation du prochain round…"}
                      </div>
                    )}

                    {phase === "final" && finalRecap ? (
                      <div className="mt-6">
                        <FinalQuestionRecapClean items={finalRecap} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              </main>
            </div>

            {/* RIGHT */}
            <aside className="hidden lg:block fixed top-16 bottom-0 right-0 w-[300px] z-20">
              <div className="h-full px-6 py-6">
                <SectionTitle>Salon</SectionTitle>

                {/* ✅ nom du salon en gros, sous "SALON" */}
                <div className="mt-3 mb-5 min-w-0">
                  <div
                    className="text-[22px] leading-tight font-semibold text-white/95 overflow-hidden text-ellipsis whitespace-nowrap"
                    title={roomDisplayName}
                  >
                    {roomDisplayName}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {roomInfoItems.map((it) => (
                      <SmallPill key={it.label} label={it.label} value={it.value} />
                    ))}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      className={[
                        "inline-flex items-center gap-2",
                        "rounded-xl px-4 py-2",
                        "text-[11px] font-semibold uppercase tracking-[0.18em]",
                        "border border-white/10 bg-white/[0.04] text-white",
                        "transition hover:bg-white/[0.08] hover:border-white/20",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/15 text-[14px] leading-none"
                      >
                        +
                      </span>
                      Inviter
                    </button>
                  </div>

                  {pending ? <div className="text-right text-[11px] text-white/45">Envoi en cours…</div> : null}
                </div>
              </div>
            </aside>
          </div>

          {/* MOBILE */}
          <div className="lg:hidden px-5 md:px-8 pb-10">
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 overflow-x-hidden">
                <SectionTitle right={`${Math.max(leaderboard.length, 1)} joueurs`}>Classement</SectionTitle>

                <div className="mt-3 max-h-[360px] overflow-y-auto overflow-x-hidden pr-2 lb-scroll">
                  {(leaderboard ?? []).map((r, i) => (
                    <div
                      key={r.id}
                      className={[
                        "flex items-center justify-between rounded-xl border px-3 py-2 overflow-x-hidden",
                        (selfId && r.id === selfId) ||
                        (!!selfName && typeof r.name === "string" && r.name.toLowerCase() === selfName.toLowerCase())
                          ? "bg-gradient-to-r from-[#D30E72] to-[#770577] text-white border-transparent"
                          : "border-white/10 bg-white/[0.02]",
                      ].join(" ")}
                    >
                      <div className="min-w-0 flex items-center gap-2 overflow-hidden">
                        <span className="w-5 text-right text-white/50 tabular-nums flex-shrink-0">{i + 1}.</span>
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
                    <div className="flex items-center justify-between rounded-xl border border-transparent bg-gradient-to-r from-[#D30E72] to-[#770577] px-3 py-2 overflow-x-hidden text-white">
                      <div className="min-w-0 flex items-center gap-2 overflow-hidden">
                        <span className="w-6 text-right text-white/90 tabular-nums flex-shrink-0">{selfIndex + 1}.</span>
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
              </div>
            </div>
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
        s && typeof s.correct === "number" && typeof s.correctQcm === "number" && typeof s.wrong === "number"
          ? { correct: s.correct, correctQcm: s.correctQcm, wrong: s.wrong }
          : typeof sAlt.correct === "number" && typeof sAlt.correctQcm === "number" && typeof sAlt.wrong === "number"
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
      <path d="M6 3h12v18l-6-5-6 5V3Z" stroke="currentColor" strokeWidth="1.6" fill={filled ? "currentColor" : "none"} />
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

  // ✅ SegmentedBar corrigé (flex -> plus de soucis de float / widths)
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
          <div className="h-full bg-amber-300" style={{ width: `${wQcm}%` }} />
          <div className="h-full bg-rose-400" style={{ width: `${wWrong}%` }} />
        </div>
      </div>
    );
  };

  const attempts = selected?.attempts ?? [];
  const hasAttempts = attempts.length > 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
          Question {(selected?.index ?? 0) + 1}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">/ {ordered.length}</span>
      </div>

      {selected ? <p className="mt-3 text-[14px] font-semibold leading-snug text-white">{selected.text}</p> : null}

      {selected?.correctLabel ? (
        <div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-[12px] text-white/70">
            <span className="text-white/45">Bonne réponse :</span>{" "}
            <span className="font-semibold text-white">{selected.correctLabel}</span>
          </div>
          <div className="text-[12px] font-semibold tracking-[0.14em] text-white/60">+{selected.pointsBest} pts</div>
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
            <div key={idx} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <span className={a.correct ? "text-emerald-400" : "text-rose-400"} aria-hidden>
                {a.correct ? "✅" : "❌"}
              </span>

              <span className="flex-1 truncate text-[12px] text-white">{a.answer ?? "—"}</span>

              <span className="tabular-nums text-[11px] text-white/55">{a.ms >= 0 ? `${a.ms} ms` : "—"}</span>
            </div>
          ))
        )}
      </div>

      {selected ? (
        <div className="mt-3 pt-3 border-t border-white/10 flex justify-end gap-2">
          <button onClick={() => toggleSave(selected.questionId)} className="p-1 text-white/60 hover:text-white" title="Enregistrer" type="button">
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
          const base = "w-8 h-8 flex items-center justify-center rounded-lg text-[12px] font-semibold cursor-pointer transition border";
          let color = "border-white/10 bg-white/[0.04] text-white/80";
          if (state === "correct") color = "border-emerald-400/40 bg-emerald-400/15 text-white";
          if (state === "wrong") color = "border-rose-400/40 bg-rose-400/15 text-white";

          return (
            <button
              key={q.questionId}
              onClick={() => setSelectedIdx(i)}
              className={`${base} ${color} ${i === selectedIdx ? "ring-2 ring-white/40 ring-offset-2 ring-offset-black/20" : ""}`}
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
