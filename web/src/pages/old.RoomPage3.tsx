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
type RoomMeta = { id: string; code: string | null; visibility: "PUBLIC" | "PRIVATE" };
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
  const [roomInfoOpen, setRoomInfoOpen] = useState(true);

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
    const s = io(SOCKET_URL, { path: "/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
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

    s.on("round_begin", (p: { index: number; total: number; endsAt: number; question: QuestionLite; serverNow?: number }) => {
      if (typeof p.serverNow === "number") {
        setSkew(p.serverNow - Date.now());
      }
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
      initSfx();
    });

    s.on("multiple_choice", (p: { choices: ChoiceLite[] }) => {
      setMcChoices(() => {
        mcChoicesRef.current = p.choices;
        return p.choices;
      });
      setTextAnswer("");
    });

    s.on("answer_feedback", (p: { correct: boolean; correctChoiceId: string | null; correctLabel: string | null; responseMs?: number }) => {
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
    });

    s.on("player_answered", (p: { pgId: string; correct?: boolean }) => {
      if (!p?.pgId) return;
      setAnsweredByPg((prev) => ({ ...prev, [p.pgId]: p.correct ? "correct" : "wrong" }));
    });

    s.on("round_end", (p: { index: number; correctChoiceId: string | null; correctLabel?: string | null; leaderboard?: LeaderRow[] }) => {
      setPhase("reveal");
      setCorrectId(p.correctChoiceId);
      if (Array.isArray(p.leaderboard)) setLeaderboard(p.leaderboard);
      setFeedback((prev) => prev ?? "Temps écoulé !");
      if (p.correctLabel) setFeedbackCorrectLabel(p.correctLabel);
      setEndsAt(null);
      setRoundDuration(null);
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
      setFeedbackResponseMs(null);
      setFeedbackWasCorrect(null);
      setFeedbackCorrectLabel(null);
      setAnswerMode(null);
      setChoicesRevealed(false);
      setEndsAt(null);
      setRoundDuration(null);
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
      if (!res?.ok && res?.reason === "no-lives") {
        setLives(0);
      }
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
  const roomInfoItems: RoomInfoItem[] = [
    { label: "ID du salon", value: roomMeta?.id ?? roomId ?? "—" },
    { label: "Public / Privé", value: visibilityLabel },
    { label: "Code du salon", value: roomMeta?.code ?? "—" },
    { label: "Nombre de joueurs", value: Math.max(leaderboard.length, 1) },
  ];

  return (
    <>
      <Background />

      <div className="relative z-10 text-white mx-auto w-full px-4 min-h-[calc(100dvh-64px)] pt-2">
        {/* Grille principale : leaderboard / centre / room */}
        <div className="grid gap-6 items-start grid-cols-1 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)_minmax(0,0.85fr)]">
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
                /* ——— CLASSEMENT ——— */
                <>
                  {leaderboard.length === 0 ? (
                    <div className="opacity-60">—</div>
                  ) : (
                    <>
                      <ol className={["m-0 space-y-2 pr-2", "max-h-[560px] overflow-y-auto lb-scroll"].join(" ")}>
                        {leaderboard.map((r, i) => {
                          const isSelf =
                            (selfId && r.id === selfId) ||
                            (!!selfName && typeof r.name === "string" && r.name.toLowerCase() === selfName.toLowerCase());

                          const pillBase =
                            "flex items-center justify-between rounded-xl px-3.5 py-1.5 text-[14px] shadow-[0_6px_14px_rgba(0,0,0,.25)] border";
                          const pillDark =
                            "bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),rgba(15,23,42,0.99)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.9),#020617)] text-white border-white/10";
                          const pillActive = "bg-gradient-to-r from-[#D30E72] to-[#770577] text-white border-transparent";

                          const answered = answeredByPg[r.id];

                          return (
                            <li key={r.id} className="flex items-stretch gap-2">
                              {/* position */}
                              <span className="w-4 text-right text-[12px] opacity-80 tabular-nums leading-[38px]">{i + 1}</span>

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
                                        answered === "correct" ? "bg-white" : answered === "wrong" ? "bg-red-500" : "bg-white/20",
                                      ].join(" ")}
                                      title={
                                        answered === "correct" ? "Bonne réponse" : answered === "wrong" ? "Mauvaise réponse" : "Pas encore répondu"
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
                      {leaderboard.length > 14 &&
                        (() => {
                          const activeIdx =
                            selfIndex >= 0
                              ? selfIndex
                              : leaderboard.findIndex(
                                  (row) =>
                                    row.id === selfId ||
                                    (!!selfName && typeof row.name === "string" && row.name.toLowerCase() === selfName!.toLowerCase())
                                );
                          if (activeIdx < 0) return null;

                          const active = leaderboard[activeIdx];
                          const answered = answeredByPg[active.id];

                          const pillBase =
                            "flex items-center justify-between rounded-xl px-3.5 py-1.5 text-[14px] shadow-[0_6px_14px_rgba(0,0,0,.25)] border";
                          const pillActive = "bg-gradient-to-r from-[#D30E72] to-[#770577] text-white border-transparent";

                          return (
                            <div className="sticky bottom-0 z-10 pt-3">
                              <div className="h-px w-full bg-white/10 mb-2" />
                              <div className="flex items-center gap-2">
                                <span className="w-4 text-right text-[12px] opacity-80 tabular-nums">{activeIdx + 1}</span>
                                <div className={`${pillBase} ${pillActive} w-full`}>
                                  <span className="truncate">{active.name}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="tabular-nums">{active.score}</span>
                                    <span
                                      className={[
                                        "inline-block w-2.5 h-2.5 rounded-full transition-colors",
                                        answered === "correct" ? "bg-white" : answered === "wrong" ? "bg-red-500" : "bg-white/20",
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

          {/* CENTRE — QuestionPanel */}
          <section className="mt-14 min-w-0 md:order-2 md:mx-8 xl:mx-12">
            <div className="flex flex-col gap-6">
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
                <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-6 text-center text-sm text-white/80 backdrop-blur-md">
                  {phase === "between" ? "" : phase === "idle" ? "En attente des joueurs…" : "Préparation du prochain round…"}
                </div>
              )}
            </div>
          </section>

{/* RIGHT — Infos Room (table + entête toggle) */}
<aside className="min-w-0 md:order-3">
  <div className="relative mt-12 mr-8 lg:mr-12">
    <div className="ml-auto w-full md:w-[84%] lg:w-[76%]">
      {/* Titre aligné sur la bordure droite */}
      <div className="mb-6 text-right pr-5">
        <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Salon
        </p>
        <h3 className="m-0 text-[16px] font-semibold leading-tight text-slate-50">
          Albert EINSTEIN
        </h3>
      </div>

      {/* ✅ Le conteneur porte le background du QuestionPanel */}
      <div
        className={[
          "overflow-hidden rounded-[8px]",
          "border border-slate-500/45", // bordure un peu plus visible
          "shadow-[0_12px_36px_rgba(0,0,0,.55)]",
          "bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),rgba(15,23,42,0.99)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.9),#020617)]",
        ].join(" ")}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th colSpan={2} className="p-0">
                <button
                  type="button"
                  onClick={() => setRoomInfoOpen((v) => !v)}
                  className={[
                    "w-full flex items-center justify-between",
                    "px-5 py-3",
                    // entête distincte, mais cohérente (plus sombre, pas “plate”)
                    "bg-black/55",
                    "border-b border-white/10",
                    "focus:outline-none",
                  ].join(" ")}
                  aria-expanded={roomInfoOpen}
                >
                  {/* ✅ autre police entête */}
                  <span className="font-mono text-[12px] tracking-[0.18em] text-slate-100">
                    INFORMATIONS
                  </span>

                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    aria-hidden
                    className={[
                      "transition-transform duration-200",
                      roomInfoOpen ? "rotate-180" : "rotate-0",
                      "text-slate-200/80",
                    ].join(" ")}
                    fill="none"
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </th>
            </tr>
          </thead>

          {roomInfoOpen && (
            <tbody>
              {roomInfoItems.map((item, idx) => (
                <tr
                  key={item.label}
                  className={[
                    // ✅ fond plein (pas transparent) + alternance
                    idx % 2 === 0 ? "bg-black/25" : "bg-black/10",
                    // séparateurs plus doux que des bordures “dures”
                    "border-t border-white/10",
                  ].join(" ")}
                >
                  <td className="py-3 pl-5 pr-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300/80">
                      {item.label}
                    </div>
                  </td>

                  <td className="py-3 pr-5 pl-3 text-right">
                    <div className="text-[13px] font-medium tabular-nums text-slate-50 truncate">
                      {item.value}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
{/* Action — Inviter */}
<div className="mt-4 flex justify-end pr-1">
  <button
    type="button"
     // à brancher
    className={[
      "inline-flex items-center gap-2",
      "rounded-[10px] px-4 py-2",
      "text-[11px] font-semibold uppercase tracking-[0.18em]",
      "border border-slate-600/60",
      "bg-black/40 text-slate-100",
      "transition hover:border-white/60 hover:text-white hover:brightness-110",
      "shadow-[0_0_6px_rgba(255,255,255,0.08)]",
    ].join(" ")}
  >
    {/* Icône + */}
    <span
      aria-hidden
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-500/60 text-[14px] leading-none"
    >
      +
    </span>
    Inviter
  </button>
</div>



    </div>
  </div>
</aside>








        </div>
      </div>
    </>
  );
}

function FinalQuestionRecap({ items }: { items: RecapItem[] }) {
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => setSelectedIdx(0), [items]);

  if (!items?.length) return <div className="opacity-60">Aucune question.</div>;

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
    const pct = (n: number) => `${(100 * n) / total}%`;

    return (
      <div className="relative mt-2 pt-5">
        <div className="pointer-events-none absolute top-0 left-0 right-0 flex text-[11px] leading-none">
          {stats.correct > 0 && (
            <div style={{ width: pct(stats.correct) }} className="text-center text-emerald-300">
              {stats.correct}
            </div>
          )}
          {stats.correctQcm > 0 && (
            <div style={{ width: pct(stats.correctQcm) }} className="text-center text-amber-300">
              {stats.correctQcm}
            </div>
          )}
          {stats.wrong > 0 && (
            <div style={{ width: pct(stats.wrong) }} className="text-center text-rose-300">
              {stats.wrong}
            </div>
          )}
        </div>

        <div className="h-[8px] rounded-full overflow-hidden border border-white/10 bg-white/5">
          <div className="h-full float-left bg-emerald-600" style={{ width: pct(stats.correct) }} />
          <div className="h-full float-left bg-amber-400" style={{ width: pct(stats.correctQcm) }} />
          <div className="h-full float-left bg-rose-700" style={{ width: pct(stats.wrong) }} />
        </div>
      </div>
    );
  };

  const attempts = selected?.attempts ?? [];
  const hasAttempts = attempts.length > 0;

  return (
    <div className="w-full md:w-[94%] mx-auto">
      <div className="relative">
        <div className="pointer-events-none absolute -inset-[2px] rounded-[8px] opacity-70 blur-xl" />
        <div
          className={[
            "relative w-full rounded-[12px] border border-slate-800/80",
            "bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),rgba(15,23,42,0.99)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.9),#020617)]",
            "shadow-[0_0_5px_rgba(248,248,248,0.8)]",
            "p-5 sm:p-6",
          ].join(" ")}
        >
          <div className="flex flex-col gap-4">
            {/* Numéro de question */}
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300/80">
                Question {(selected?.index ?? 0) + 1}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                / {ordered.length}
              </span>
            </div>

            {/* Énoncé */}
            {selected && (
              <p className="text-[16px] font-semibold leading-snug text-slate-50">
                {selected.text}
              </p>
            )}

            {/* Bonne réponse + score */}
            {selected?.correctLabel && (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="text-[13px] text-slate-200">
                  <span className="opacity-70">Bonne réponse :</span>{" "}
                  <span className="font-medium text-slate-50">{selected.correctLabel}</span>
                </div>

                {/* ✅ police score changée : sans + tracking propre */}
                <div className="font-semibold text-[13px] tracking-[0.18em] text-slate-300/90">
                  (+{selected.pointsBest} pts)
                </div>
              </div>
            )}

            {/* espace avant segments */}
            {selected?.stats && (
              <div className="mt-3">
                <SegmentedBar stats={selected.stats} />
              </div>
            )}

            {/* Réponses du joueur */}
            {selected && (
              <div className="space-y-2">
                {!hasAttempts ? (
                  <div className="text-[13px] text-slate-300/80">Aucune réponse.</div>
                ) : (
                  attempts.map((a, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 rounded-[12px] border border-slate-700/80 bg-black/30 px-3 py-2"
                    >
                      <span className={a.correct ? "text-emerald-400" : "text-rose-400"} aria-hidden>
                        {a.correct ? "✅" : "❌"}
                      </span>

                      <span className="flex-1 truncate text-[13px] text-slate-50">
                        {a.answer ?? "—"}
                      </span>

                      <span className="tabular-nums text-[12px] text-slate-300/80">
                        {a.ms >= 0 ? `${a.ms} ms` : "—"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Actions */}
            {selected && (
              <div className="pt-2 border-t border-slate-700/70 flex justify-end gap-2">
                <button
                  onClick={() => toggleSave(selected.questionId)}
                  className="p-1 text-slate-200/80 hover:text-white"
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
                      ? "p-1 text-slate-200/40"
                      : "p-1 text-slate-200/80 hover:text-white"
                  }
                  title={reported.has(selected.questionId) ? "Signalée" : "Signaler"}
                  type="button"
                >
                  <FlagIcon />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation (plus petite) */}
      <div className="mt-5 flex flex-wrap justify-start gap-2">
        {ordered.map((q, i) => {
          const state = questionState(q);
          const base =
            "w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md text-[12px] font-semibold cursor-pointer transition";
          let color = "border border-slate-700/90 bg-slate-700/60 text-slate-200";

          if (state === "correct") color = "border-emerald-600 bg-emerald-600 text-slate-50";
          if (state === "wrong") color = "border-rose-700 bg-rose-700 text-slate-50";

          return (
            <button
              key={q.questionId}
              onClick={() => setSelectedIdx(i)}
              className={`${base} ${color} ${
                i === selectedIdx ? "ring-2 ring-offset-2 ring-offset-[#020617] ring-white/70" : ""
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
