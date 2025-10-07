// web/src/pages/RoomPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { initSfx, playCorrect } from "../sfx";

const API_BASE   = import.meta.env.VITE_API_BASE    ?? (typeof window !== "undefined" ? window.location.origin : "");
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL  ?? (typeof window !== "undefined" ? window.location.origin : "");
const MC_COST    = Number(import.meta.env.VITE_MC_COST ?? 5);
const ENERGY_MAX = Number(import.meta.env.VITE_ENERGY_MAX ?? 100); // gardé pour la logique, non affiché
const TEXT_LIVES = Number(import.meta.env.VITE_TEXT_LIVES ?? 3);

type ChoiceLite   = { id: string; label: string };
type QuestionLite = { id: string; text: string; img?: string | null; theme?: string | null; difficulty?: number | null };
type Phase        = "idle" | "playing" | "reveal" | "between" | "final";
type LeaderRow    = { id: string; name: string; score: number };
type Feedback     = { ok: boolean; correctLabel: string | null; responseMs?: number };

// ❤ Vies (on conserve)
function Lives({ lives, total }: { lives: number; total: number }) {
  const full = Array.from({ length: lives }).map((_, i) => <span key={`f${i}`}>❤️</span>);
  const empty = Array.from({ length: Math.max(0, total - lives) }).map((_, i) => (
    <span key={`e${i}`} style={{ opacity: 0.25 }}>❤️</span>
  ));
  return (
    <div style={{ display:"flex", justifyContent:"center", gap: 8, margin: "10px 0 6px", fontSize: 20 }}>
      {full}{empty}
    </div>
  );
}

export default function RoomPage() {
  const barRef = useRef<HTMLDivElement | null>(null);
  const nav = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [question, setQuestion] = useState<QuestionLite | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [roundStart, setRoundStart] = useState<number | null>(null);
  const [roundDurMs, setRoundDurMs] = useState<number | null>(null);

  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [msg, setMsg] = useState("");

  const [mcChoices, setMcChoices] = useState<ChoiceLite[] | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const hasFeedbackRef = useRef(false);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Énergie conservée pour la logique (MC_COST), mais non affichée
  const [energy, setEnergy] = useState(10);
  const [mult, setMult]     = useState(1); // non affiché
  const [energyErr, setEnergyErr] = useState<string | null>(null); // non affiché

  const [lives, setLives] = useState<number>(TEXT_LIVES);
  const [revealAnswer, setRevealAnswer] = useState<boolean>(false);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = useMemo(
    () => (endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null),
    [endsAt, now]
  );

  // % pour la barre de progression fine
  const progressPct = useMemo(() => {
    if (!roundStart || !roundDurMs) return 0;
    const elapsed = Math.max(0, Math.min(roundDurMs, now - roundStart));
    return Math.round((elapsed / roundDurMs) * 100);
  }, [now, roundStart, roundDurMs]);

  useEffect(() => {
    if (phase === "playing" && inputRef.current) inputRef.current.focus();
  }, [phase, question]);

  useEffect(() => {
    const handleClick = () => {
      if (phase === "playing" && inputRef.current) inputRef.current.focus();
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [phase]);

  // init SFX
  useEffect(() => {
    const once = () => { initSfx(); };
    window.addEventListener("pointerdown", once, { once: true });
    window.addEventListener("keydown", once, { once: true });
    return () => {
      window.removeEventListener("pointerdown", once);
      window.removeEventListener("keydown", once);
    };
  }, []);

  // Énergie: on garde la logique mais on n'affiche rien
  useEffect(() => {
    if (!socket) return;
    const onEnergy = (p: { energy: number; multiplier: number }) => {
      setEnergy(p.energy);
      setMult(Number(p.multiplier.toFixed(1)));
      setEnergyErr(null);
    };
    const onNotEnough = (p: { need: number; have: number }) => {
      setEnergyErr(`Pas assez d’énergie (${p.have}/${p.need})`);
      setTimeout(() => setEnergyErr(null), 2500);
    };
    socket.on("energy_update", onEnergy);
    socket.on("not_enough_energy", onNotEnough);
    return () => {
      socket.off("energy_update", onEnergy);
      socket.off("not_enough_energy", onNotEnough);
    };
  }, [socket]);

  // Connexion + gestion room
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

      setPhase("playing");
      setIndex(p.index); setTotal(p.total); setEndsAt(p.endsAt);
      setQuestion(p.question);
      setSelected(null); setCorrectId(null);
      setMcChoices(null); setTextAnswer("");
      setFeedback(null);
      setEnergyErr(null);
      hasFeedbackRef.current = false;
      setLives(TEXT_LIVES);
      setRevealAnswer(false);

      requestAnimationFrame(() => {
        const el = barRef.current;
        if (!el) return;
        el.style.transition = "none";
        el.style.transformOrigin = "left";
        el.style.transform = "scaleX(1)";
        requestAnimationFrame(() => {
          el.style.transition = `transform ${dur}ms linear`;
          el.style.transform = "scaleX(0)";
        });
      });
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

      if (p.correct) { try { playCorrect(); } catch {} }

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

      const el = barRef.current;
        if (el) {
          el.style.transition = "none";
          el.style.transform = "scaleX(0)";
        }
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

      const el = barRef.current;
        if (el) {
          el.style.transition = "none";
          el.style.transform = "scaleX(0)";
        }
    });

    s.on("game_over", () => {
      setPhase("between");
      setQuestion(null); setSelected(null); setCorrectId(null); setEndsAt(null);
      setMcChoices(null); setTextAnswer(""); setFeedback(null);
      setMsg("Next game starting…");
      setRevealAnswer(false);
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

  return (
    <>
      {/* RP-01: Dégradé global */}
      <div
        aria-hidden
        className="
          fixed inset-0 z-0
          bg-[linear-gradient(to_bottom,_#4A1557_0%,_#2E0F40_33%,_#1A0A2B_66%,_#0A0616_100%)]
        "
      />
      {/* RP-02: Grain anti-banding */}
      <div
        aria-hidden
        className="
          fixed inset-0 z-0 pointer-events-none
          mix-blend-soft-light opacity-[0.35]
          bg-[radial-gradient(circle,_rgba(255,255,255,0.16)_0.5px,_transparent_0.5px)]
          bg-[length:4px_4px]
          [mask-image:linear-gradient(to_bottom,rgba(0,0,0,.8),rgba(0,0,0,.5)_60%,transparent_100%)]
          [-webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,.8),rgba(0,0,0,.5)_60%,transparent_100%)]
        "
      />

      {/* RP-03: Contenu (plein écran sous header) */}
      <div
        className="relative z-10 text-white mx-auto w-full px-4 min-h-[calc(100dvh-64px)] pt-6"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        {/* RP-03.01: Grille 1→2→3 colonnes */}
        <div 
          className="
            grid gap-4 items-start
            grid-cols-1
            md:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_minmax(0,1fr)]
          "
        >
          {/* RP-03.01.01: Colonne gauche */}
          <aside className="min-w-0">
            <div className="flex items-baseline gap-3 mb-2">

              <span
                title={`Room ${roomId}`}
                className="inline-block px-3 py-1 tracking-[.3px]"
              >
                Room {roomId}
              </span>

              {msg && <span style={{ opacity: 0.9 }}>{msg}</span>}
            </div>
          </aside>

          {/* RP-03.01.02: Colonne centrale (jeu) */}
          <section className="min-w-0">
            {phase === "final" ? (
              <div
                style={{
                  border: "1px solid #eee",
                  padding: 16,
                  borderRadius: 12,
                  marginTop: 16,
                  textAlign: "center",
                  background:"#fff",
                  color:"#111827"
                }}
              >
                <h3 style={{ marginTop: 0 }}>🏁 Classement final</h3>
                {leaderboard.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>Aucun score.</div>
                ) : (
                  <ol style={{ margin: "12px auto 0", paddingLeft: 18, maxWidth: 460, textAlign: "left" }}>
                    {leaderboard.map((r, i) => (
                      <li key={r.id} style={{ margin: "6px 0", display: "flex", gap: 8 }}>
                        <span style={{ width: 22, textAlign: "right", opacity: 0.6 }}>{i + 1}.</span>
                        <span style={{ fontWeight: 600, flex: 1 }}>{r.name}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.score}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <div style={{ marginTop: 12, opacity: 0.7, fontSize: 14 }}>
                  Nouvelle partie dans un instant…
                </div>
              </div>
            ) : (
              <div>
                {question ? (
                  <div className="mt-4">

                    {/* Barre de progression fluide */}
                    <div className="h-[6px] mt-2.5 rounded-full bg-white/25 overflow-hidden">
                      <div
                        ref={barRef}
                        className="h-full bg-white"
                        style={{ transform: "scaleX(0)", willChange: "transform" }}
                      />
                    </div>

                    {/* En-tête: index + timer */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop: 8, opacity:.9 }}>
                      <div>Question {index + 1}/{total}</div>
                      <div>{remaining !== null ? `${remaining}s` : ""}</div>
                    </div>                    

                    {/* Bloc question (nouveau style) */}
                    <div className="mt-10 w-[70%] mx-auto rounded-[12px] border border-white/90 bg-black px-4 py-3">
                      <div className="font-semibold leading-snug tracking-[0.2px] text-[18px] text-center">
                        {question.text}
                      </div>
                    </div>

                    {/* Image cadrée */}
                    {question.img && (() => {
                      const imgSrc = question.img.startsWith("http") || question.img.startsWith("/")
                        ? question.img
                        : "/" + question.img.replace(/^\.?\//, "");
                      return (
                        <div className="mt-3 flex w-fit mx-auto overflow-hidden rounded-[22px] border-[2px] max-w-full ">
                          <img src={imgSrc} alt="" className="block w-auto h-auto max-h-[24vh] max-w-full"/>
                        </div>
                      );
                    })()}

                    {/* Vies */}
                    <Lives lives={lives} total={TEXT_LIVES} />

                    {/* Saisie / Choix */}
                    {mcChoices ? (
                      <>
                        <div style={{ display:"grid", gap: 12, gridTemplateColumns:"1fr 1fr", marginTop: 12 }}>
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
                                style={{
                                  padding:"14px 16px",
                                  borderRadius:12,
                                  border:"2px solid rgba(255,255,255,.6)",
                                  background: isOk ? "rgba(22,163,74,.18)" : isSel ? "rgba(59,130,246,.18)" : "transparent",
                                  color:"#fff",
                                  cursor: disabled ? "default" : "pointer",
                                  fontWeight:700
                                }}
                              >
                                {c.label}
                              </button>
                            );
                          })}
                        </div>
                        {typeof feedback?.responseMs === "number" && (
                          <div style={{ marginTop: 6, textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>
                            {feedback.responseMs} ms
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: "grid", gridTemplateColumns:"1fr auto auto", gap: 10, alignItems:"center" }}>
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
                            style={{
                              padding: "12px 14px",
                              borderRadius: 12,
                              border: "2px solid rgba(255,255,255,.35)",
                              background: "rgba(0,0,0,.35)",
                              color: "#fff"
                            }}
                          />
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={sendText}
                            disabled={phase !== "playing" || lives <= 0}
                            style={{
                              padding: "12px 16px",
                              borderRadius: 12,
                              border: "2px solid #ffffff",
                              background: "#ffffff",
                              color: "#35104b",
                              fontWeight: 800,
                              cursor: phase !== "playing" || lives <= 0 ? "default" : "pointer"
                            }}
                          >
                            Envoyer
                          </button>
                          <button
                            onClick={showMultipleChoice}
                            disabled={phase !== "playing" || energy < MC_COST || lives <= 0 || !!feedback?.ok}
                            title={`Coût : ${MC_COST} énergie`}
                            style={{
                              padding: "12px 16px",
                              borderRadius: 12,
                              border: "2px dashed rgba(255,255,255,.75)",
                              background: "transparent",
                              color: "#fff",
                              fontWeight: 800,
                              opacity: energy < MC_COST || lives <= 0 || !!feedback?.ok ? 0.6 : 1
                            }}
                          >
                            Choix multiple
                          </button>
                        </div>

                        {pending && !feedback && (
                          <div style={{ marginTop: 8, opacity: 0.85 }}>Réponse envoyée…</div>
                        )}
                        {feedback && (
                          <div style={{ marginTop: 8, fontWeight: 700, position: "relative" }}>
                            <span>{feedback.ok ? "✔" : "✘"}</span>
                            {revealAnswer && typeof feedback.correctLabel === "string" && (
                              <> — <span style={{ opacity: 0.9 }}>Réponse : {feedback.correctLabel}</span></>
                            )}
                            {typeof feedback.responseMs === "number" && (
                              <span
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  top: 0,
                                  fontVariantNumeric: "tabular-nums",
                                  opacity: 0.85
                                }}
                                title="Temps de réponse"
                              >
                                {feedback.responseMs} ms
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ opacity: 0.9, padding: 8, marginTop: 16 }}>
                    {phase === "between" ? "Next game starting…" :
                     phase === "idle"    ? "En attente des joueurs…" :
                                            "Préparation du prochain round…"}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* RP-03.01.03: Colonne droite : leaderboard (inchangé) */}
          <aside className="min-w-0">
            <div style={{
              marginTop: 16,
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 12,
              background:"#fff",
              color:"#111827"
            }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Leaderboard</div>
              {leaderboard.length === 0 ? (
                <div style={{ opacity: 0.6 }}>—</div>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {leaderboard.map((r) => (
                    <li key={r.id} style={{ margin: "6px 0" }}>
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      <span style={{ float: "right" }}>{r.score}</span>
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