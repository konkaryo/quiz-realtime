import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { initSfx, playCorrect } from "../sfx";

const API_BASE   = import.meta.env.VITE_API_BASE    ?? (typeof window !== "undefined" ? window.location.origin : "");
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL  ?? (typeof window !== "undefined" ? window.location.origin : "");
const MC_COST    = Number(import.meta.env.VITE_MC_COST ?? 5);
const ENERGY_MAX = Number(import.meta.env.VITE_ENERGY_MAX ?? 100); // logique interne, non affiché
const TEXT_LIVES = Number(import.meta.env.VITE_TEXT_LIVES ?? 3);

type ChoiceLite   = { id: string; label: string };
type QuestionLite = { id: string; text: string; img?: string | null; theme?: string | null; difficulty?: number | null };
type Phase        = "idle" | "playing" | "reveal" | "between" | "final";
type LeaderRow    = { id: string; name: string; score: number };
type Feedback     = { ok: boolean; correctLabel: string | null; responseMs?: number };

/* ---------- Vies ---------- */
function Lives({ lives, total }: { lives: number; total: number }) {
  const full = Array.from({ length: lives }).map((_, i) => <span key={`f${i}`}>❤️</span>);
  const empty = Array.from({ length: Math.max(0, total - lives) }).map((_, i) => (
    <span key={`e${i}`} className="opacity-30">❤️</span>
  ));
  return <div className="flex justify-center gap-2 mt-3 text-[20px]">{full}{empty}</div>;
}

export default function RoomPage() {
  const nav = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const [socket, setSocket] = useState<Socket | null>(null);

  // état jeu
  const [phase, setPhase] = useState<Phase>("idle");
  const [question, setQuestion] = useState<QuestionLite | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [msg, setMsg] = useState("");

  // réponses
  const [mcChoices, setMcChoices] = useState<ChoiceLite[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasFeedbackRef = useRef(false);

  // énergie (non affichée)
  const [energy, setEnergy] = useState(10);
  const [mult, setMult]     = useState(1);
  const [energyErr, setEnergyErr] = useState<string | null>(null);

  // vies
  const [lives, setLives] = useState<number>(TEXT_LIVES);
  const [revealAnswer, setRevealAnswer] = useState<boolean>(false);

  // leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);

  // timing
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [roundStart, setRoundStart] = useState<number | null>(null);
  const [roundDurMs, setRoundDurMs] = useState<number | null>(null);

  // secondes restantes (affichage)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  const remaining = useMemo(
    () => (endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null),
    [endsAt, now]
  );

  // Barre de temps inversée (scaleX: 1 → 0)
  const barRef = useRef<HTMLDivElement | null>(null);
  const resetTimerBar = (dur: number) => {
    const el = barRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transformOrigin = "left";
    el.style.transform = "scaleX(1)"; // pleine au départ
    requestAnimationFrame(() => {
      el.style.transition = `transform ${dur}ms linear`;
      el.style.transform = "scaleX(0)"; // se vide
    });
  };
  const stopTimerBar = () => {
    const el = barRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = "scaleX(0)";
  };

  // focus
  useEffect(() => {
    if (phase === "playing" && inputRef.current) inputRef.current.focus();
  }, [phase, question]);
  useEffect(() => {
    const onDocClick = () => { if (phase === "playing") inputRef.current?.focus(); };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [phase]);

  // sfx
  useEffect(() => {
    const once = () => { initSfx(); };
    window.addEventListener("pointerdown", once, { once: true });
    window.addEventListener("keydown", once,    { once: true });
    return () => {
      window.removeEventListener("pointerdown", once);
      window.removeEventListener("keydown", once);
    };
  }, []);

  // énergie (écoutes)
  useEffect(() => {
    if (!socket) return;
    const onEnergy = (p: { energy: number; multiplier: number }) => {
      setEnergy(p.energy);
      setMult(Number(p.multiplier.toFixed(1)));
      setEnergyErr(null);
    };
    const onNotEnough = (p: { need: number; have: number }) => {
      setEnergyErr(`Pas assez d’énergie (${p.have}/${p.need})`);
      setTimeout(() => setEnergyErr(null), 2000);
    };
    socket.on("energy_update", onEnergy);
    socket.on("not_enough_energy", onNotEnough);
    return () => {
      socket.off("energy_update", onEnergy);
      socket.off("not_enough_energy", onNotEnough);
    };
  }, [socket]);

  // socket + room
  useEffect(() => {
    if (!roomId) return;

    const s = io(SOCKET_URL, { path: "/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    setSocket(s);

    s.on("error_msg", (m: string) => setMsg(m));
    s.on("info_msg",  (m: string) => setMsg(m));

    const onClosed = ({ roomId: closedId }: { roomId: string }) => {
      if (closedId !== roomId) return;
      alert("La room a été fermée.");
      setMsg("Room fermée.");
      s.close();
      nav("/");
    };
    s.on("room_closed", onClosed);
    s.on("room_deleted", onClosed);

    s.on("round_begin", (p: { index:number; total:number; endsAt:number; question: QuestionLite }) => {
      const nowMs = Date.now();
      const dur = Math.max(1000, p.endsAt - nowMs);

      setRoundStart(nowMs);
      setRoundDurMs(dur);
      setEndsAt(p.endsAt);

      setPhase("playing");
      setIndex(p.index); setTotal(p.total);
      setQuestion(p.question);
      setSelected(null); setCorrectId(null);
      setMcChoices(null); setTextAnswer("");
      setFeedback(null);
      setEnergyErr(null);
      hasFeedbackRef.current = false;
      setLives(TEXT_LIVES);
      setRevealAnswer(false);

      resetTimerBar(dur);
    });

    s.on("multiple_choice", (p: { choices: ChoiceLite[] }) => {
      setMcChoices(p.choices);
      setTextAnswer("");
    });

    s.on("answer_feedback", (p: { correct: boolean; correctChoiceId: string | null; correctLabel: string | null; responseMs?: number }) => {
      hasFeedbackRef.current = true;
      setFeedback({
        ok: p.correct,
        correctLabel: p.correctLabel ?? null,
        responseMs: typeof p.responseMs === "number" ? p.responseMs : undefined,
      });
      if (p.correctChoiceId) setCorrectId(p.correctChoiceId);
      setPending(false);

      try { if (p.correct) playCorrect(); } catch {}

      if (mcChoices === null) {
        if (p.correct) {
          setLives(0);
          setRevealAnswer(true);
        } else {
          setLives((prev) => {
            const next = Math.max(0, prev - 1);
            if (next > 0) {
              setTextAnswer("");
              requestAnimationFrame(() => inputRef.current?.focus());
            } else {
              setRevealAnswer(true);
            }
            return next;
          });
        }
      }
    });

    s.on("leaderboard_update", (p: { leaderboard: LeaderRow[] }) => {
      setLeaderboard(p.leaderboard ?? []);
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

    s.on("final_leaderboard", (p: { leaderboard: LeaderRow[]; displayMs?: number }) => {
      setPhase("final");
      setQuestion(null);
      setSelected(null);
      setCorrectId(null);
      setEndsAt(null);
      setMcChoices(null);
      setTextAnswer("");
      setFeedback(null);
      setRevealAnswer(false);
      setLeaderboard(Array.isArray(p.leaderboard) ? p.leaderboard : []);
      setMsg("Fin de partie — nouveau départ imminent…");
      stopTimerBar();
    });

    s.on("game_over", () => {
      setPhase("between");
      setQuestion(null); setSelected(null); setCorrectId(null); setEndsAt(null);
      setMcChoices(null); setTextAnswer(""); setFeedback(null);
      setMsg("Next game starting…");
      setRevealAnswer(false);
      stopTimerBar();
    });

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/rooms/${roomId}`, { credentials: "include" });
        if (res.status === 410) {
          setMsg("Cette room est fermée.");
          s.close();
          nav("/");
          return;
        }
        if (res.ok) {
          const { room } = (await res.json()) as { room: { id: string; code: string | null; visibility: "PUBLIC" | "PRIVATE" } };
          if (room.visibility === "PUBLIC" || !room.code) { s.emit("join_game", { roomId: room.id }); }
          else { s.emit("join_game", { code: room.code }); }
        } else if (res.status === 404) {
          setMsg("Room introuvable.");
          s.close();
        } else {
          setMsg(`Erreur: ${res.status}`);
          s.close();
        }
      } catch {
        setMsg("Impossible de charger la room.");
        s.close();
      }
    })();

  return () => {
      s.off("room_closed", onClosed);
      s.off("room_deleted", onClosed);
      s.close();
    };
  }, [roomId, nav]); // eslint-disable-line react-hooks/exhaustive-deps

  // actions
  const sendText = () => {
    if (!socket || phase !== "playing" || !question) return;
    if (lives <= 0) return;
    const t = (textAnswer || "").trim();
    if (!t) return;
    setPending(true);
    socket.emit("submit_answer_text", { text: t }, (res: { ok: boolean; reason?: string }) => {
      setPending(false);
      if (!res?.ok && res?.reason === "no-lives") {
        setLives(0);
        setRevealAnswer(true);
      }
    });
  };

  const showMultipleChoice = () => {
    if (!socket || phase !== "playing") return;
    if (lives <= 0 || feedback?.ok) return;
    if (energy < MC_COST) {
      setEnergyErr(`Pas assez d’énergie (${energy}/${MC_COST})`);
      setTimeout(() => setEnergyErr(null), 2000);
    }
    socket.emit("request_choices");
  };

  const answerByChoice = (choiceId: string) => {
    if (!socket || phase !== "playing" || !question) return;
    if (selected) return;
    setSelected(choiceId);
    socket.emit("submit_answer", { code: "N/A", choiceId });
  };

  /* --------- BACKGROUND --------- */
  const backgroundLayer =
    "fixed inset-0 z-0 bg-[radial-gradient(1200px_800px_at_20%_10%,#1e1a43_0%,transparent_60%),radial-gradient(900px_600px_at_80%_30%,#45106a_0%,transparent_55%),linear-gradient(180deg,#070611_0%,#140e25_45%,#0a0817_100%)]";
  const grainLayer =
    "fixed inset-0 z-0 pointer-events-none opacity-[0.28] mix-blend-soft-light bg-[radial-gradient(circle,rgba(255,255,255,0.18)_0.5px,transparent_0.5px)] bg-[length:4px_4px] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,.95),rgba(0,0,0,.6)_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,.95),rgba(0,0,0,.6)_60%,transparent_100%)]";

  return (
    <>
      {/* BG */}
      <div aria-hidden className={backgroundLayer} />
      <div aria-hidden className={grainLayer} />

      {/* CONTENU */}
      <div className="relative z-10 text-white mx-auto w-full max-w-[1200px] px-4 min-h-[calc(100dvh-64px)] pt-6 font-[system-ui]">
        {/* Bandeau: room + timer inversé + secondes */}
        <div className="grid items-end gap-4 grid-cols-1 md:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center px-3 py-1 rounded-full border border-white/30 bg-white/10 backdrop-blur-[2px] font-extrabold tracking-wide">
                Room {roomId}
              </span>
              {msg && <span className="opacity-85">{msg}</span>}
            </div>
          </div>

          <div className="min-w-0">
            <div className="h-[10px] rounded-full bg-white/15 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,.35)]">
              <div
                ref={barRef}
                className="h-full bg-[linear-gradient(90deg,#fff_0%,#ffe8fb_60%,#ffd6f9_100%)]"
                style={{ transform: "scaleX(1)", transformOrigin: "left", willChange: "transform" }}
                aria-label="Temps restant"
              />
            </div>
            <div className="mt-2 text-xs opacity-80">Question {index + 1}/{total}</div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center justify-end gap-3">
              <div className="px-2 py-1 rounded-md bg-white/10 border border-white/20 text-xs tabular-nums">
                {remaining !== null ? `${remaining}s` : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Corps : 1 → 3 colonnes */}
        <div className="mt-5 grid gap-6 items-start grid-cols-1 md:grid-cols-[minmax(0,1.05fr)_minmax(0,2fr)_minmax(0,1fr)]">
          {/* Col gauche : statut rapide */}
          <aside className="min-w-0">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 shadow-[0_8px_24px_rgba(0,0,0,.25)]">
              <div className="text-sm opacity-80">Statut</div>
              <div className="mt-1 text-base">
                {phase === "between" ? "Next game starting…" :
                 phase === "idle"    ? "En attente des joueurs…" :
                 phase === "final"   ? "Fin de partie" :
                                        "En cours…"}
              </div>
              {energyErr && <div className="mt-2 text-xs text-red-300">{energyErr}</div>}
            </div>
          </aside>

          {/* Col centre : Question/Jeu */}
          <section className="min-w-0">
            {phase === "final" ? (
              <div className="rounded-2xl border border-white/10 bg-white text-slate-900 p-6 shadow-[0_12px_30px_rgba(0,0,0,.35)]">
                <h3 className="m-0 font-bold text-lg">🏁 Classement final</h3>
                {leaderboard.length === 0 ? (
                  <div className="opacity-70 mt-2">Aucun score.</div>
                ) : (
                  <ol className="mt-3 pl-5 max-w-[460px]">
                    {leaderboard.map((r, i) => (
                      <li key={r.id} className="my-1.5 flex gap-2">
                        <span className="w-[22px] text-right opacity-60">{i + 1}.</span>
                        <span className="font-semibold flex-1">{r.name}</span>
                        <span className="tabular-nums">{r.score}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="mt-2 opacity-70 text-sm">Nouvelle partie dans un instant…</div>
              </div>
            ) : (
              <div>
                {question && (
                  <>
                    {/* --------- ENCART QUESTION (statique, sans rotation) --------- */}
                    <div
                      className={[
                        "relative rounded-2xl p-[2px]",
                        "bg-[conic-gradient(from_0deg,rgba(255,255,255,.6),rgba(255,255,255,.15),rgba(255,255,255,.6))]",
                        "shadow-[0_12px_32px_rgba(0,0,0,.45)]"
                      ].join(" ")}
                    >
                      <div className="rounded-2xl bg-[rgba(10,8,20,.85)] backdrop-blur-md px-5 py-4 border border-white/10">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-fuchsia-300 shadow-[0_0_12px_rgba(240,171,252,.8)]" />
                          <span className="text-[12px] tracking-wider uppercase opacity-70">Question</span>
                        </div>
                        <div className="font-medium leading-snug tracking-[0.2px] text-[18px]">
                          {question.text}
                        </div>
                      </div>
                    </div>

                    {/* Image cadrée (zéro déformation) */}
                    {question.img && (() => {
                      const imgSrc = question.img.startsWith("http") || question.img.startsWith("/")
                        ? question.img
                        : "/" + question.img.replace(/^\.?\//, "");
                      return (
                        <div className="mt-4 rounded-[22px] overflow-hidden border-[6px] border-white/95 shadow-[0_16px_40px_rgba(0,0,0,.45)] flex justify-center bg-black/20">
                          <img
                            src={imgSrc}
                            alt=""
                            className="block w-auto h-auto max-w-full max-h-[48vh] md:max-h-[420px] object-contain mx-auto"
                          />
                        </div>
                      );
                    })()}

                    {/* Vies */}
                    <Lives lives={lives} total={TEXT_LIVES} />

                    {/* Entrée / Boutons */}
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
                                  "px-4 py-3 rounded-xl border text-left transition",
                                  "border-white/35 hover:border-white/70",
                                  isOk ? "bg-emerald-500/18" : isSel ? "bg-blue-500/18" : "bg-white/6",
                                  disabled ? "cursor-default opacity-70" : "cursor-pointer",
                                  "backdrop-blur-[2px]"
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
                          disabled={phase !== "playing" || energy < MC_COST || lives <= 0 || !!feedback?.ok}
                          title={`Coût : ${MC_COST} énergie`}
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
                  <div className="opacity-90 p-2 mt-4">
                    {phase === "between" ? "Next game starting…" :
                     phase === "idle"    ? "En attente des joueurs…" :
                                            "Préparation du prochain round…"}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Col droite : leaderboard (glass) */}
          <aside className="min-w-0">
            <div className="rounded-2xl border border-white/10 bg-white/6 backdrop-blur-md p-4 shadow-[0_12px_30px_rgba(0,0,0,.35)]">
              <div className="font-bold mb-2">Leaderboard</div>
              {leaderboard.length === 0 ? (
                <div className="opacity-60">—</div>
              ) : (
                <ol className="m-0 pl-5">
                  {leaderboard.map((r) => (
                    <li key={r.id} className="my-1.5">
                      <span className="font-semibold">{r.name}</span>
                      <span className="float-right tabular-nums">{r.score}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
