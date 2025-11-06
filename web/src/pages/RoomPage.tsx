// web/src/pages/RoomPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { initSfx, playCorrect } from "../sfx";
import { FinalLeaderboard } from "../components/FinalLeaderboard";

const API_BASE   = import.meta.env.VITE_API_BASE    ?? (typeof window !== "undefined" ? window.location.origin : "");
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL  ?? (typeof window !== "undefined" ? window.location.origin : "");
const TEXT_LIVES = Number(import.meta.env.VITE_TEXT_LIVES ?? 3);

type ChoiceLite   = { id: string; label: string };
type QuestionLite = { id: string; text: string; img?: string | null; theme?: string | null; difficulty?: number | null };
type Phase        = "idle" | "playing" | "reveal" | "between" | "final";
type LeaderRow    = { id: string; name: string; score: number; img?: string | null };
type Feedback     = { ok: boolean; correctLabel: string | null; responseMs?: number };
type RoomMeta     = { id: string; code: string | null; visibility: "PUBLIC" | "PRIVATE" };

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

/* ---------- UI helpers ---------- */
function Lives({ lives, total }: { lives: number; total: number }) {
  const full = Array.from({ length: lives }).map((_, i) => <span key={`f${i}`}>❤️</span>);
  const empty = Array.from({ length: Math.max(0, total - lives) }).map((_, i) => (
    <span key={`e${i}`} className="opacity-30">❤️</span>
  ));
  return <div className="flex justify-start gap-1 text-[20px]">{full}{empty}</div>;
}

function TimerBadge({ seconds }: { seconds: number | null }) {
  const s = seconds ?? 0;
  const display = String(Math.max(0, s)).padStart(2, "0");
  const urgent = s <= 5;
  return (
    <div
      aria-live="polite"
      title="Temps restant"
      className={[
        "relative inline-flex items-center justify-center h-[28px] min-w-[52px] px-2 rounded-full",
        "border border-white/15 bg-black/60 backdrop-blur-[2px]",
        "shadow-[0_8px_24px_rgba(0,0,0,.4),inset_0_1px_0_rgba(255,255,255,.06)]",
        urgent ? "animate-pulse" : ""
      ].join(" ")}
    >
      <span className="font-semibold tabular-nums tracking-wide">
        {display}<span className="text-[11px] opacity-85 ml-0.5">s</span>
      </span>
    </div>
  );
}

type ThemeMeta = { label: string; color: string };
const THEMES: Record<string, ThemeMeta> = {
  CINEMA_SERIES:       { label: "Cinéma & Séries",        color: "#14B8A6" },
  ARTS_CULTURE:        { label: "Arts & Culture",         color: "#F59E0B" },
  JEUX_BD:             { label: "Jeux & BD",              color: "#EAB308" },
  GEOGRAPHIE:          { label: "Géographie",             color: "#22D3EE" },
  LANGUES_LITTERATURE: { label: "Langues & Littérature",  color: "#D946EF" },
  ECONOMIE_POLITIQUE:  { label: "Économie & Politique",   color: "#3B82F6" },
  GASTRONOMIE:         { label: "Gastronomie",            color: "#F97316" },
  CROYANCES:           { label: "Croyances",              color: "#818CF8" },
  SPORT:               { label: "Sport",                  color: "#84CC16" },
  HISTOIRE:            { label: "Histoire",               color: "#FAFAFA" },
  SCIENCES_NATURELLES: { label: "Sciences naturelles",    color: "#22C55E" },
  SCIENCES_TECHNIQUES: { label: "Sciences & Techniques",  color: "#EF4444" },
  MUSIQUE:             { label: "Musique",                color: "#EC4899" },
  ACTUALITES_MEDIAS:   { label: "Actualités & Médias",    color: "#F43F5E" },
  DIVERS:              { label: "Divers",                 color: "#A3A3A3" },
};
const themeMeta = (t?: string | null): ThemeMeta => THEMES[(t ?? "DIVERS").toUpperCase()] ?? THEMES.DIVERS;

/* ============================== PAGE ============================== */
export default function RoomPage() {
  const nav = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [phase, setPhase]   = useState<Phase>("idle");

  const [answeredByPg, setAnsweredByPg] = useState<Record<string, "correct" | "wrong">>({});
  const [question, setQuestion] = useState<QuestionLite | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);

  const [mcChoices, setMcChoices] = useState<ChoiceLite[] | null>(null);
  const [selected, setSelected]   = useState<string | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending]   = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [lives, setLives] = useState<number>(TEXT_LIVES);
  const [revealAnswer, setRevealAnswer] = useState<boolean>(false);

  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [selfName, setSelfName] = useState<string | null>(null);

  const [roomMeta, setRoomMeta] = useState<RoomMeta | null>(null);

  /* ---- recap des questions reçu en fin de partie ---- */
  const [finalRecap, setFinalRecap] = useState<RecapItem[] | null>(null);

  const LB_MAX_VISIBLE = 12;

  const selfIndex = useMemo(() => {
    return leaderboard.findIndex(
      (r) =>
        (selfId && r.id === selfId) ||
        (!!selfName && typeof r.name === "string" && r.name.toLowerCase() === selfName.toLowerCase())
    );
  }, [leaderboard, selfId, selfName]);

  const lbOverflow = leaderboard.length > LB_MAX_VISIBLE;

  /* -------- timer bar (inversée) -------- */
  const [skew, setSkew] = useState(0);
  const nowServer = () => Date.now() + skew;
  const barRef = useRef<HTMLDivElement | null>(null);
  const resetTimerBarToEndsAt = (endsAtMs: number) => {
    const el = barRef.current; if (!el) return;
    const remaining = Math.max(0, endsAtMs - nowServer());

    el.style.transition = "none";
    el.style.transformOrigin = "left";
    el.style.transform = "scaleX(1)";

    requestAnimationFrame(() => {
      el.style.transition = `transform ${remaining}ms linear`;
      el.style.transform = "scaleX(0)";
    });
  };
  const stopTimerBar = () => {
    const el = barRef.current; if (!el) return;
    el.style.transition = "none";
    el.style.transform = "scaleX(0)";
  };

  // timing
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const remaining = useMemo(
    () => (endsAt ? Math.max(0, Math.ceil((endsAt - nowServer()) / 1000)) : null),
    [endsAt, nowTick, skew]
  );
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [endsAt]);

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
    const onVis = () => {
      if (document.visibilityState === "visible" && endsAt) { resetTimerBarToEndsAt(endsAt); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [endsAt, skew]);

  useEffect(() => {
    if (!roomId) return;
    const s = io(SOCKET_URL, { path: "/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    setSocket(s);

    s.on("room_closed", ({ roomId: rid }: { roomId: string }) => { if (rid === roomId) { alert("La room a été fermée."); s.close(); nav("/"); }});
    s.on("room_deleted", ({ roomId: rid }: { roomId: string }) => { if (rid === roomId) { alert("La room a été supprimée."); s.close(); nav("/"); }});

    s.on("round_begin", (p: { index:number; total:number; endsAt:number; question: QuestionLite; serverNow?: number }) => {
      if (typeof p.serverNow === "number") { setSkew(p.serverNow - Date.now()); }
      setPhase("playing");
      setIndex(p.index); setTotal(p.total); setEndsAt(p.endsAt);
      setQuestion(p.question);
      setAnsweredByPg({});
      setSelected(null); setCorrectId(null);
      setMcChoices(null); setTextAnswer("");
      setFeedback(null);
      setLives(TEXT_LIVES);
      setRevealAnswer(false);
      setFinalRecap(null);
      if (p.endsAt - nowServer() >= 50) { resetTimerBarToEndsAt(p.endsAt); }
      else { stopTimerBar(); }
      initSfx();
    });

    s.on("multiple_choice", (p: { choices: ChoiceLite[] }) => { setMcChoices(p.choices); setTextAnswer(""); });

    s.on("answer_feedback", (p: { correct: boolean; correctChoiceId: string | null; correctLabel: string | null; responseMs?: number }) => {
      setFeedback({ ok: p.correct, correctLabel: p.correctLabel ?? null, responseMs: p.responseMs });
      if (p.correctChoiceId) setCorrectId(p.correctChoiceId);
      if (mcChoices === null) {
        if (p.correct) { setLives(0); setRevealAnswer(true); }
        else {
          setLives((prev) => {
            const next = Math.max(0, prev - 1);
            if (next > 0) { setTextAnswer(""); requestAnimationFrame(() => inputRef.current?.focus()); }
            else { setRevealAnswer(true); }
            return next;
          });
        }
      }
      try { if (p.correct) playCorrect(); } catch {}
    });

    s.on("player_answered", (p: { pgId: string; correct?: boolean }) => {
      if (!p?.pgId) return;
      setAnsweredByPg(prev => ({ ...prev, [p.pgId]: p.correct ? "correct" : "wrong" }));
    });

    s.on("round_end", (p: { index:number; correctChoiceId:string|null; correctLabel?: string | null; leaderboard?: LeaderRow[] }) => {
      setPhase("reveal");
      setCorrectId(p.correctChoiceId);
      if (Array.isArray(p.leaderboard)) setLeaderboard(p.leaderboard);
      setFeedback(prev => ({
        ok: prev?.ok ?? false,
        correctLabel: p.correctLabel ?? prev?.correctLabel ?? null,
        responseMs: prev?.responseMs,
      }));
      setRevealAnswer(true);
      setEndsAt(null);
      stopTimerBar();
    });

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
      setRevealAnswer(false);
      setEndsAt(null);
      stopTimerBar();
    });

    /* récapitulatif individuel de la partie (unicast) */
    s.on("final_summary", (p: { summary: RecapItem[] }) => {
      setFinalRecap(Array.isArray(p.summary) ? p.summary : []);
    });

    s.on("game_over", () => { setPhase("between"); setQuestion(null); setEndsAt(null); stopTimerBar(); });

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/rooms/${roomId}`, { credentials: "include" });
        if (res.status === 410) { s.close(); nav("/"); return; }
        if (res.ok) {
          const { room } = (await res.json()) as { room: RoomMeta };
          setRoomMeta(room);
          if (room.visibility === "PUBLIC" || !room.code) s.emit("join_game", { roomId: room.id });
          else s.emit("join_game", { code: room.code });
        } else { s.close(); }
      } catch { s.close(); }
    })();

    return () => { s.close(); };
  }, [roomId, nav]);

  useEffect(() => { if (phase === "playing") inputRef.current?.focus(); }, [phase, question]);

  /* --------------------------- actions --------------------------- */
  const sendText = () => {
    if (!socket || phase !== "playing" || !question || lives <= 0) return;
    const t = (textAnswer || "").trim();
    if (!t) return;
    setPending(true);
    socket.emit("submit_answer_text", { text: t }, (res: { ok: boolean; reason?: string }) => {
      setPending(false);
      if (!res?.ok && res?.reason === "no-lives") { setLives(0); setRevealAnswer(true); }
    });
  };
  const showMultipleChoice = () => {
    if (!socket || phase !== "playing" || lives <= 0 || !!feedback?.ok) return;
    socket.emit("request_choices");
  };
  const answerByChoice = (choiceId: string) => {
    if (!socket || phase !== "playing" || !question || selected) return;
    setSelected(choiceId);
    socket.emit("submit_answer", { code: "N/A", choiceId });
  };

  /* ----------------------------- UI ----------------------------- */
  const bg =
    "fixed inset-0 z-0 bg-[radial-gradient(1200px_800px_at_20%_10%,#191736_0%,transparent_60%),radial-gradient(900px_600px_at_80%_30%,#3e0f64_0%,transparent_55%),linear-gradient(180deg,#070611_0%,#120d21_45%,#0a0815_100%)]";
  const grain =
    "fixed inset-0 z-0 pointer-events-none opacity-[0.28] mix-blend-soft-light bg-[radial-gradient(circle,rgba(255,255,255,0.18)_0.5px,transparent_0.5px)] bg-[length:4px_4px] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,.95),rgba(0,0,0,.6)_60%,transparent_100%)]";

  const statusText =
    phase === "between" ? "Transition…" :
    phase === "idle"    ? "En attente des joueurs…" :
    phase === "final"   ? "Fin de partie" :
                          "En cours…";

  return (
    <>
      <div aria-hidden className={bg} />
      <div aria-hidden className={grain} />

      <div className="relative z-10 text-white mx-auto w-full px-4 min-h-[calc(100dvh-64px)] pt-2">
        {/* Grille principale : leaderboard / centre / room */}
        <div className="grid gap-6 items-start grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
          
{/* LEFT — Leaderboard (inchangé visuellement ; récap en phase finale) */}
<aside className="min-w-0 md:order-1 relative md:pt-[98px]">
  {/* Titre */}
  <div className="hidden mt-7 text-4xl font-brand md:block absolute top-0 left-1/2 -translate-x-1/2 font-bold">
    {phase === "final" ? "RÉCAPITULATIF" : "CLASSEMENT"}
  </div>

  <div className="w-full md:w-[88%] mx-auto">
    {/* ——— RÉCAP ——— */}
    {phase === "final" && finalRecap ? (
      <FinalQuestionRecap items={finalRecap} />
    ) : (
      /* ——— CLASSEMENT (identique à ta version) ——— */
      <>
        {leaderboard.length === 0 ? (
          <div className="opacity-60">—</div>
        ) : (
          <>
            <ol
              className={[
                "m-0 space-y-2 pr-2",
                "max-h-[560px] overflow-y-auto lb-scroll",
              ].join(" ")}
            >
              {leaderboard.map((r, i) => {
                const isSelf =
                  (selfId && r.id === selfId) ||
                  (!!selfName &&
                    typeof r.name === "string" &&
                    r.name.toLowerCase() === selfName.toLowerCase());

                const pillBase =
                  "flex items-center justify-between rounded-xl px-3.5 py-1.5 text-[14px] shadow-[0_6px_14px_rgba(0,0,0,.25)] border";
                const pillDark = "bg-[#0f1420]/90 text-white border-white/10";
                const pillActive =
                  "bg-gradient-to-r from-[#D30E72] to-[#770577] text-white border-transparent";

                const answered = answeredByPg[r.id];

                return (
<li key={r.id} className="flex items-stretch gap-2">
  {/* position */}
  <span className="w-4 text-right text-[12px] opacity-80 tabular-nums leading-[38px]">
    {i + 1}
  </span>

  {/* carte */}
  <div className={`${pillBase} ${isSelf ? pillActive : pillDark} w-full`}>
    <div className="flex items-center gap-3 w-full">
      {/* avatar carré */}
      {r.img ? (
        <img
          src={r.img}
          alt=""
          className="w-8 h-8 rounded-md object-cover flex-shrink-0 border border-white/15"
          draggable={false}
          loading="lazy"
        />
      ) : (
        <div className="w-8 h-8 rounded-md bg-white/10 border border-white/10 flex-shrink-0" />
      )}

      {/* nom + sous-ligne */}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate font-medium">{r.name}</div>
        <div className="text-[12px] opacity-70">Niveau 1</div>
      </div>

      {/* score + point */}
      <div className="flex items-center gap-2">
        <span className="tabular-nums">{r.score}</span>
        <span
          className={[
            "inline-block w-2.5 h-2.5 rounded-full transition-colors",
            answered === "correct" ? "bg-white" :
            answered === "wrong"   ? "bg-red-500" :
                                     "bg-white/20",
          ].join(" ")}
          title={
            answered === "correct" ? "Bonne réponse" :
            answered === "wrong"   ? "Mauvaise réponse" :
                                     "Pas encore répondu"
          }
        />
      </div>
    </div>
  </div>
</li>
                );
              })}
            </ol>

            {/* Joueur actif répété en bas si la liste dépasse */}
            {leaderboard.length > 14 && (() => {
              const activeIdx =
                selfIndex >= 0
                  ? selfIndex
                  : leaderboard.findIndex(
                      (row) =>
                        row.id === selfId ||
                        (!!selfName &&
                          typeof row.name === "string" &&
                          row.name.toLowerCase() === selfName!.toLowerCase())
                    );
              if (activeIdx < 0) return null;

              const active = leaderboard[activeIdx];
              const answered = answeredByPg[active.id];

              const pillBase =
                "flex items-center justify-between rounded-xl px-3.5 py-1.5 text-[14px] shadow-[0_6px_14px_rgba(0,0,0,.25)] border";
              const pillActive =
                "bg-gradient-to-r from-[#D30E72] to-[#770577] text-white border-transparent";

              return (
<div className="sticky bottom-0 z-10 pt-3">
  <div className="h-px w-full bg-white/10 mb-2" />
  <div className="flex items-center gap-2">
    <span className="w-4 text-right text-[12px] opacity-80 tabular-nums">
      {activeIdx + 1}
    </span>
    <div className={`${pillBase} ${pillActive} w-full`}>
      <span className="truncate">{active.name}</span>
      <div className="flex items-center gap-2">
        <span className="tabular-nums">{active.score}</span>
        <span
          className={[
            "inline-block w-2.5 h-2.5 rounded-full transition-colors",
            answered === "correct" ? "bg-white"
            : answered === "wrong" ? "bg-red-500"
            : "bg-white/20",
          ].join(" ")}
        />
      </div>
    </div>
  </div>
</div>
              );
            })()}
          </>
        )}
      </>
    )}
  </div>
</aside>

          {/* CENTER — 4 conteneurs invisibles à tailles fixes */}
          <section className="mt-5 min-w-0 md:order-2 md:mx-8 xl:mx-12">
            {/* 1) TIMER */}
            <div className="h-[70px] flex flex-col justify-start items-center">
              <div className="h-[8px] w-full max-w-[720px] rounded-full bg-white/15 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,.35)]">
                <div
                  ref={barRef}
                  className="h-full bg-[linear-gradient(90deg,#fff_0%,#ffe8fb_60%,#ffd6f9_100%)]"
                  style={{ transform: "scaleX(1)", transformOrigin: "left", willChange: "transform" }}
                  aria-label="Temps restant"
                />
              </div>
              <div className="mt-2">
                <TimerBadge seconds={remaining} />
              </div>
            </div>

            {phase === "final" ? (
              <FinalLeaderboard rows={leaderboard} selfId={selfId} selfName={selfName} />
            ) : (
              <>
                {/* 2) QUESTION */}
                <div className="mt-2 h-[100px] sm:h-[175px] md:h-[170px] overflow-hidden">
                  {question && (() => {
                    const meta = themeMeta(question.theme);
                    return (
                      <div className="rounded-2xl border border-white/15 bg-black/70 px-5 py-3 backdrop-blur-md shadow-[0_12px_24px_rgba(0,0,0,.35)] max-h-full">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                            <span className="text-[12px] tracking-wider uppercase opacity-80">{meta.label}</span>
                          </div>
                          <span className="text-[12px] opacity-80 tabular-nums">
                            {Math.max(1, index + 1)}/{Math.max(total, index + 1)}
                          </span>
                        </div>
                        <div className="mt-2 max-h-[calc(100%-22px)] overflow-auto pr-1 font-medium leading-snug tracking-[0.2px] text-[18px]">
                          {question.text}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 3) IMAGE */}
                <div className="mt-1 h-[300px] overflow-hidden">
                  <div className="w-full h-full flex items-center justify-center">
                    {question?.img ? (() => {
                      const imgSrc = question.img!.startsWith("http") || question.img!.startsWith("/")
                        ? question.img! : "/" + question.img!.replace(/^\.?\//, "");
                      return (
                        <figure className="inline-block rounded-[22px] p-[2px] bg-[linear-gradient(135deg,rgba(255,255,255,.75),rgba(255,255,255,.20))] shadow-[0_18px_48px_rgba(0,0,0,.55)] max-w-full max-h-full">
                          <div className="rounded-[20px] bg-black/85 border border-white/10 overflow-hidden max-w-full max-h-full">
                            <img
                              src={imgSrc}
                              alt=""
                              className="block w-full h-auto max-h-[240px] object-contain select-none"
                              draggable={false}
                            />
                          </div>
                        </figure>
                      );
                    })() : null}
                  </div>
                </div>

                {/* 4) INPUTS */}
                <div className="mt-2">
                  {question && (
                    <>
                      <Lives lives={lives} total={TEXT_LIVES} />

                      {mcChoices ? (
                        <>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {mcChoices.map((c) => {
                              const isSel = selected === c.id;
                              const isOk = !!correctId && c.id === correctId;
                              const disabled = phase !== "playing";
                              return (
<button
  key={c.id}
  onMouseDown={(e) => e.preventDefault()}
  onClick={() => answerByChoice(c.id)}
  disabled={disabled}
  className={[
    "px-4 py-3 rounded-xl border text-left transition-all duration-200 ease-out",
    "backdrop-blur-[2px]",
    disabled ? "cursor-default opacity-60" : "cursor-pointer",
    !disabled && !isSel && !isOk ? "hover:border-white/70 hover:bg-white/10" : "",
    isOk
      ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300 ring-2 ring-emerald-500/40"
      : isSel && !correctId
      ? "border-blue-500/60 bg-blue-500/15 text-blue-300"
      : selected && selected === c.id && !isOk
      ? "border-rose-500/60 bg-rose-500/15 text-rose-300 ring-2 ring-rose-500/40"
      : "border-white/35 bg-white/6 text-white"
  ].join(" ")}
>
  {c.label}
</button>
                              );
                            })}
                          </div>
                          {typeof feedback?.responseMs === "number" && (
                            <div className="mt-1.5 text-right opacity-85 tabular-nums">{feedback.responseMs} ms</div>
                          )}
                        </>
                      ) : (
                        <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-3">
                          <input
                            ref={inputRef}
                            placeholder="Tape ta réponse…"
                            value={textAnswer}
                            onChange={(e) => setTextAnswer(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); sendText(); }
                              if (e.key === "Tab")   { e.preventDefault(); showMultipleChoice(); }
                            }}
                            disabled={phase !== "playing" || !!selected || lives <= 0}
                            className="px-3.5 py-3 rounded-xl border border-white/25 bg-white/10 text-white placeholder-white/60 backdrop-blur-[2px] focus:outline-none focus:border-white/70"
                          />
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={sendText}
                            disabled={phase !== "playing" || lives <= 0}
                            className="px-4 py-3 rounded-xl border border-white bg-white text-[#2a0f3a] font-extrabold disabled:cursor-default"
                          >
                            Envoyer
                          </button>
                          <button
                            onClick={showMultipleChoice}
                            disabled={phase !== "playing" || lives <= 0 || !!feedback?.ok}
                            className="px-4 py-3 rounded-xl border border-dashed border-white/75 text-white font-extrabold disabled:opacity-60"
                          >
                            Choix multiple
                          </button>

                          {pending && !feedback && (
                            <div className="col-span-3 mt-1 opacity-85">Réponse envoyée…</div>
                          )}
                          {feedback && (
                            <div className="col-span-3 mt-2 font-semibold relative">
                              <span>{feedback.ok ? "✔" : "✘"}</span>
                              {revealAnswer && typeof feedback.correctLabel === "string" && (
                                <> — <span className="opacity-90">Réponse : {feedback.correctLabel}</span></>
                              )}
                              {typeof feedback.responseMs === "number" && (
                                <span className="absolute right-0 top-0 opacity-85 tabular-nums" title="Temps de réponse">
                                  {feedback.responseMs} ms
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {!question && (
                    <div className="opacity-90 p-2">
                      {phase === "between" ? "" :
                       phase === "idle"    ? "En attente des joueurs…" :
                                              "Préparation du prochain round…"}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          {/* RIGHT — Panneau Room (inchangé) */}
          <aside className="min-w-0 md:order-3">
            <div
              className={[
                "relative rounded-[18px] overflow-hidden",
                "bg-black/45 backdrop-blur-md border border-white/10",
                "shadow-[0_10px_28px_rgba(0,0,0,.38)]"
              ].join(" ")}
            >
              <div className="pointer-events-none absolute inset-0 rounded-[18px] [mask:linear-gradient(#000,transparent_70%)]">
                <div className="absolute inset-0 rounded-[18px] border border-transparent [border-image:linear-gradient(90deg,rgba(255,255,255,.35),rgba(255,255,255,.06))_1]" />
              </div>

              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/70 shadow-[0_0_8px_rgba(255,255,255,.6)]" aria-hidden />
                  <h3 className="m-0 text-[15px] font-semibold tracking-wide">Room</h3>
                </div>
                <span className="inline-flex items-center px-2 py-[2px] rounded-full text-[11px] uppercase tracking-wide border border-white/20 bg-white/10">
                  {roomMeta?.visibility ?? "—"}
                </span>
              </div>

              <div className="px-4 pb-4 relative">
                <div className="pointer-events-none absolute inset-0 opacity-[0.12] bg-[radial-gradient(circle,rgba(255,255,255,.6)_1px,transparent_1px)] bg-[length:14px_14px]" />
                <dl className="relative grid grid-cols-2 gap-x-3 gap-y-3 text-[13px]">
                  <div className="col-span-2 h-[1px] bg-white/10" />

                  <div className="opacity-70">ID</div>
                  <div className="tabular-nums truncate text-right">{roomMeta?.id ?? roomId ?? "—"}</div>

                  {roomMeta?.code ? (
                    <>
                      <div className="opacity-70">Code</div>
                      <div className="text-right font-semibold">{roomMeta.code}</div>
                    </>
                  ) : null}

                  <div className="opacity-70">Statut</div>
                  <div className="text-right">
                    {statusText}
                  </div>

                  <div className="opacity-70">Question</div>
                  <div className="text-right tabular-nums">{Math.max(1, index + 1)}/{Math.max(total, index + 1)}</div>

                  <div className="opacity-70">Temps restant</div>
                  <div className="text-right"><TimerBadge seconds={remaining} /></div>

                  <div className="opacity-70">Joueurs</div>
                  <div className="text-right tabular-nums">{Math.max(leaderboard.length, 1)}</div>
                </dl>
              </div>
            </div>
          </aside>

        </div>
      </div>
    </>
  );
}

function FinalQuestionRecap({ items }: { items: RecapItem[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());

  if (!items?.length) return <div className="opacity-60">Aucune question.</div>;

  type Attempt = { answer?: string | null; correct: boolean; ms: number; points: number };
  type Stats   = { correct: number; correctQcm: number; wrong: number };
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
        (s && typeof s.correct === "number" && typeof s.correctQcm === "number" && typeof s.wrong === "number")
          ? { correct: s.correct, correctQcm: s.correctQcm, wrong: s.wrong }
          : (typeof sAlt.correct === "number" && typeof sAlt.correctQcm === "number" && typeof sAlt.wrong === "number")
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

  const toggle = (id: string) =>
    setOpenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSave = (qId: string) =>
    setSaved(prev => {
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
      setReported(prev => new Set(prev).add(q.questionId));
      window?.alert?.("Merci, la question a été signalée.");
    } catch {
      window?.alert?.("Échec du signalement. Réessaie plus tard.");
    }
  };

  const BadgeQ = ({ n, ok }: { n: number; ok: boolean }) => (
    <span
      className={[
        "inline-flex items-center justify-center font-semibold tabular-nums",
        "h-[24px] min-w-[48px] px-2 rounded-md text-[12px] leading-none",
        ok ? "bg-emerald-500 text-white" : "bg-rose-500 text-white",
      ].join(" ")}
      aria-hidden
      title={ok ? "Question correcte" : "Question incorrecte"}
    >
      Q{n}
    </span>
  );

  const BookmarkIcon = ({ filled }: { filled: boolean }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none">
      <path d="M6 3h12v18l-6-5-6 5V3Z" stroke="currentColor" strokeWidth="1.6" fill={filled ? "currentColor" : "none"} />
    </svg>
  );
  const FlagIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none">
      <path d="M5 21V5a1 1 0 011.5-.86L14 7l4-2v10l-4 2-7.5-2.86A1 1 0 005 15v6Z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );

  const SegmentedBar = ({ stats }: { stats: Stats }) => {
    const total = Math.max(0, (stats.correct ?? 0) + (stats.correctQcm ?? 0) + (stats.wrong ?? 0));
    if (!total) return null;
    const pct = (n: number) => `${(100 * n) / total}%`;
    return (
      <div className="relative mt-2 pt-5">
        <div className="pointer-events-none absolute top-0 left-0 right-0 flex text-[11px] leading-none">
          {stats.correct    > 0 && <div style={{ width: pct(stats.correct)    }} className="text-center text-emerald-300">{stats.correct}</div>}
          {stats.correctQcm > 0 && <div style={{ width: pct(stats.correctQcm) }} className="text-center text-amber-300">{stats.correctQcm}</div>}
          {stats.wrong      > 0 && <div style={{ width: pct(stats.wrong)      }} className="text-center text-rose-300">{stats.wrong}</div>}
        </div>
        <div className="h-[8px] rounded-full overflow-hidden border border-white/10 bg-white/5">
          <div className="h-full float-left bg-emerald-500/90" style={{ width: pct(stats.correct) }} />
          <div className="h-full float-left bg-amber-400/90"  style={{ width: pct(stats.correctQcm) }} />
          <div className="h-full float-left bg-rose-500/90"    style={{ width: pct(stats.wrong) }} />
        </div>
      </div>
    );
  };

  const LEFT_COL_W_PX = 64;
  const LEFT_TOP_OFFSET_PX = 10;

  return (
    <div className="w-full md:w-[94%] mx-auto">
      <ol className="space-y-4 max-h-[560px] overflow-y-auto lb-scroll pr-1">
        {ordered.map((q) => {
          const isOpen = openIds.has(q.questionId);
          const anyCorrect = q.attempts.some(a => a.correct);

          return (
            <li key={q.questionId} className="relative" style={{ paddingLeft: LEFT_COL_W_PX }}>
              {/* Colonne gauche */}
              <div
                className="absolute left-0 flex flex-col items-center"
                style={{ width: LEFT_COL_W_PX, top: LEFT_TOP_OFFSET_PX }}
              >
                <BadgeQ n={q.index + 1} ok={anyCorrect} />

                {/* ↙️ plus d’espace entre Qx et le score */}
                <span className="font-brand text-white text-[22px] leading-none mt-2">
                  +{q.pointsBest}
                </span>

                <div className="flex items-center gap-1 whitespace-nowrap">
                  <button
                    aria-label={saved.has(q.questionId) ? "Retirer des favoris" : "Enregistrer"}
                    onClick={() => toggleSave(q.questionId)}
                    className="p-0.5 text-white/85 hover:text-white focus:outline-none"
                    title="Enregistrer"
                  >
                    <BookmarkIcon filled={saved.has(q.questionId)} />
                  </button>
                  <button
                    aria-label="Signaler"
                    onClick={() => report(q)}
                    disabled={reported.has(q.questionId)}
                    className={["p-0.5 focus:outline-none",
                      reported.has(q.questionId) ? "text-white/40" : "text-white/85 hover:text-white"].join(" ")}
                    title={reported.has(q.questionId) ? "Signalée" : "Signaler"}
                  >
                    <FlagIcon />
                  </button>
                </div>
              </div>

              {/* Carte question */}
              <div
                className={[
                  "rounded-xl border border-white/10 text-white",
                  "bg-[#1D192C] shadow-[0_6px_14px_rgba(0,0,0,.25)]",
                  "transition-colors hover:bg-[#231D3A]"
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => toggle(q.questionId)}
                  className="w-full text-left px-4 py-3 focus:outline-none"
                  aria-expanded={isOpen}
                >
                  <div className="grid grid-cols-[1fr_auto] gap-x-3 items-start">
                    <div className="min-w-0 leading-snug text-[13.5px]">
                      <div className={isOpen ? "" : "truncate"}>{q.text}</div>
                      <div className="mt-1 text-[13px] opacity-85">
                        Bonne réponse : <span className="font-medium">{q.correctLabel ?? "—"}</span>
                      </div>
                    </div>
                    <span
                      className={[
                        "inline-grid place-items-center w-[24px] h-[24px] rounded-full",
                        "border border-white/15 bg-white/5 text-white/80",
                        "transition-transform duration-200",
                        isOpen ? "rotate-90" : ""
                      ].join(" ")}
                      aria-hidden
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </div>

                  {q.stats ? <SegmentedBar stats={q.stats} /> : null}
                </button>

                {isOpen && (
                  <div className="px-4 pb-3 pt-1 text-[13px]">
                    <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
                      <div className="opacity-75">Tes réponses</div>
                      <div className="opacity-95 space-y-1">
                        {q.attempts.map((a, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span
                              className={[
                                "inline-grid place-items-center w-4 h-4 rounded-full text-[10px] border",
                                a.correct
                                  ? "border-emerald-400/50 text-emerald-300 bg-emerald-400/10"
                                  : "border-rose-400/50 text-rose-300 bg-rose-400/10",
                              ].join(" ")}
                              title={a.correct ? "Correct" : "Faux"}
                            >
                              {a.correct ? "✓" : "✕"}
                            </span>
                            <span className="flex-1">{a.answer ?? "—"}</span>
                            <span className="tabular-nums opacity-75">{a.ms >= 0 ? `${a.ms} ms` : "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
