// web/src/pages/RoomPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";

const API_BASE   = import.meta.env.VITE_API_BASE    ?? (typeof window !== "undefined" ? window.location.origin : "");
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL  ?? (typeof window !== "undefined" ? window.location.origin : "");
const MC_COST    = Number(import.meta.env.VITE_MC_COST ?? 5);
const ENERGY_MAX = Number(import.meta.env.VITE_ENERGY_MAX ?? 100);
const TEXT_LIVES = Number(import.meta.env.VITE_TEXT_LIVES ?? 3);

type ChoiceLite   = { id: string; label: string };
type QuestionLite = { id: string; text: string; img?: string | null };
type Phase        = "idle" | "playing" | "reveal" | "between" | "final";
type LeaderRow    = { id: string; name: string; score: number };

// — Petite jauge d’énergie ---------------------------------------------------
function EnergyBar({ energy, max, mult }: { energy: number; max: number; mult: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((energy / max) * 100)));
  return (
    <div style={{ display:"flex", alignItems:"center", gap: 10, margin: "8px 0 12px" }}>
      <div style={{ minWidth: 90, fontWeight: 600 }}>Énergie</div>
      <div style={{ position:"relative", flex: 1, height: 10, background:"#eee", borderRadius: 999 }}>
        <div style={{
          position:"absolute", inset:0, width: `${pct}%`,
          background: "linear-gradient(90deg,#6dd,#5b8cff)", borderRadius: 999,
          transition: "width .25s ease"
        }}/>
      </div>
      <div style={{ minWidth: 80, textAlign:"right", fontVariantNumeric:"tabular-nums" }}>
        {energy}/{max}
      </div>
      <div style={{ minWidth: 70, textAlign:"right", fontWeight: 700 }}>
        ×{mult.toFixed(1)}
      </div>
    </div>
  );
}

// — Affichage des cœurs ------------------------------------------------------
function Lives({ lives, total }: { lives: number; total: number }) {
  const full = Array.from({ length: lives }).map((_, i) => <span key={`f${i}`}>❤️</span>);
  const empty = Array.from({ length: Math.max(0, total - lives) }).map((_, i) => (
    <span key={`e${i}`} style={{ opacity: 0.25 }}>❤️</span>
  ));
  return (
    <div style={{ display:"flex", alignItems:"center", gap: 8, margin: "4px 0 10px" }}>
      <div style={{ minWidth: 90, fontWeight: 600 }}>Vies</div>
      <div style={{ fontSize: 18 }}>{full}{empty}</div>
    </div>
  );
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [question, setQuestion] = useState<QuestionLite | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [msg, setMsg] = useState("");

  // MC / saisie libre
  const [mcChoices, setMcChoices] = useState<ChoiceLite[] | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; correctLabel: string | null } | null>(null);
  const hasFeedbackRef = useRef(false);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ⚡ énergie / multiplicateur
  const [energy, setEnergy] = useState(10);
  const [mult, setMult]     = useState(1);
  const [energyErr, setEnergyErr] = useState<string | null>(null);

  // 🆕 vies (UX locale)
  const [lives, setLives] = useState<number>(TEXT_LIVES);

  // 🆕 contrôle de la révélation
  const [revealAnswer, setRevealAnswer] = useState<boolean>(false);

  // 🏆 leaderboard live
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);

  // ticking clock
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

  // focus auto en phase "playing"
  useEffect(() => {
    if (phase === "playing" && inputRef.current) inputRef.current.focus();
  }, [phase, question]);

  // focus permanent (clics)
  useEffect(() => {
    function handleClick() {
      if (phase === "playing" && inputRef.current) inputRef.current.focus();
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [phase]);

  // listeners énergie
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

  // connexion + flux trivia + deep-link join
  useEffect(() => {
    if (!roomId) return;

    const s = io(SOCKET_URL, { path: "/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    setSocket(s);

    s.on("error_msg", (m: string) => setMsg(m));
    s.on("info_msg",  (m: string) => setMsg(m));

    s.on("round_begin", (p: { index:number; total:number; endsAt:number; question: QuestionLite }) => {
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
    });

    s.on("multiple_choice", (p: { choices: ChoiceLite[] }) => {
      setMcChoices(p.choices);
      setTextAnswer("");
    });

    s.on("answer_feedback", (p: { correct: boolean; correctChoiceId: string | null; correctLabel: string | null }) => {
      hasFeedbackRef.current = true;
      setFeedback({ ok: p.correct, correctLabel: p.correctLabel ?? null });
      if (p.correctChoiceId) setCorrectId(p.correctChoiceId);
      setPending(false);

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
      }));
      setRevealAnswer(true);
      setEndsAt(null);
    });

    // 🏁 Nouvelle phase : leaderboard final (remplace tout l’affichage)
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
    });

    // Fallback legacy (si jamais émis)
    s.on("game_over", () => {
      setPhase("between");
      setQuestion(null); setSelected(null); setCorrectId(null); setEndsAt(null);
      setMcChoices(null); setTextAnswer(""); setFeedback(null);
      setMsg("Next game starting…");
      setRevealAnswer(false);
    });

    (async () => {
      const res = await fetch(`${API_BASE}/rooms/${roomId}`);
      if (res.ok) {
        const { room } = (await res.json()) as { room: { id: string; code: string } };
        s.emit("join_game", { code: room.code }); // auto-start côté serveur si nécessaire
      } else {
        setMsg("Room not found");
      }
    })();

    return () => { s.close(); };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (lives <= 0 || feedback?.ok) return; // ✅ désactivé après bonne réponse
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
    <div style={{ maxWidth: 980, margin: "40px auto", fontFamily: "system-ui, sans-serif" }}>
      <h2>Room {roomId}</h2>
      <p style={{ opacity: 0.8 }}>{msg}</p>

      {/* Phase finale : on remplace tout par l’écran de classement */}
      {phase === "final" ? (
        <div style={{ border: "1px solid #eee", padding: 16, borderRadius: 12, marginTop: 16, textAlign: "center", background:"#fff" }}>
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
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap: 16, alignItems: "start" }}>
          {/* Colonne principale */}
          <div>
            {question ? (
              <div style={{ border: "1px solid #eee", padding: 16, borderRadius: 12, marginTop: 16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>Question {index + 1}/{total}</div>
                  <div>{remaining !== null ? `${remaining}s` : ""}</div>
                </div>

                <EnergyBar energy={energy} max={ENERGY_MAX} mult={mult} />
                {energyErr && <div style={{ color:"#b00", marginBottom: 8 }}>{energyErr}</div>}
                {mcChoices === null && <Lives lives={lives} total={TEXT_LIVES} />}

                <h3>{question.text}</h3>
                {question.img && (() => {
                  const imgSrc = question.img.startsWith("http") || question.img.startsWith("/")
                    ? question.img
                    : "/" + question.img.replace(/^\.?\//, "");
                  return <img src={imgSrc} alt="" style={{ maxWidth: "100%", borderRadius: 8 }} />;
                })()}

                {mcChoices ? (
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
                            padding:"12px 16px", borderRadius:12, border:"1px solid #ddd",
                            background: isOk ? "#dff6dd" : isSel ? "#e8f0fe" : "#f8f8f8"
                          }}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", gap: 8, alignItems:"center" }}>
                      <input
                        ref={inputRef}
                        placeholder="Tape ta réponse..."
                        value={textAnswer}
                        onChange={(e) => setTextAnswer(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); sendText(); }
                          if (e.key === "Tab")   { e.preventDefault(); showMultipleChoice(); }
                        }}
                        disabled={phase !== "playing" || !!selected || lives <= 0}
                        style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                      />
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={sendText}
                        disabled={phase !== "playing" || lives <= 0}
                        style={{ padding: "10px 12px" }}
                      >
                        Envoyer
                      </button>
                      <button
                        onClick={showMultipleChoice}
                        disabled={phase !== "playing" || energy < MC_COST || lives <= 0 || !!feedback?.ok}
                        title={`Coût : ${MC_COST} énergie`}
                        style={{ padding: "10px 12px", opacity: energy < MC_COST || lives <= 0 || !!feedback?.ok ? 0.6 : 1 }}
                      >
                        Multiple-choice
                      </button>
                    </div>

                    {pending && !feedback && (
                      <div style={{ marginTop: 8, opacity: 0.7 }}>Réponse envoyée…</div>
                    )}
                    {feedback && (
                      <div style={{ marginTop: 8, fontWeight: 600 }}>
                        {feedback.ok ? "✔" : "✘"}
                        {revealAnswer && typeof feedback.correctLabel === "string" && (
                          <> — <span style={{ opacity: 0.8 }}>Réponse : {feedback.correctLabel}</span></>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ opacity: 0.7, padding: 8, marginTop: 16 }}>
                {phase === "between" ? "Next game starting…" :
                 phase === "idle"    ? "En attente des joueurs…" :
                                        "Préparation du prochain round…"}
              </div>
            )}
          </div>

          {/* 🏆 Colonne leaderboard */}
          <aside style={{ marginTop: 16 }}>
            <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
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
      )}
    </div>
  );
}
