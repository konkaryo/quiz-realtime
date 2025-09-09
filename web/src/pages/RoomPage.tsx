// web/src/pages/RoomPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_BASE ?? (typeof window !== "undefined" ? window.location.origin : "");
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? (typeof window !== "undefined" ? window.location.origin : "");

type ChoiceLite = { id: string; label: string };
type QuestionLite = { id: string; text: string; img?: string|null };
type Phase = "idle" | "playing" | "reveal" | "between";
type LeaderRow = { id: string; name: string; score: number };

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
  const [mcChoices, setMcChoices] = useState<ChoiceLite[] | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; correctLabel: string | null } | null>(null);
  const hasFeedbackRef = useRef(false);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 🆕 leaderboard live
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);

  // ticking clock
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => { clearInterval(id); };
  }, [endsAt]);
  const remaining = useMemo(
    () => (endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null),
    [endsAt, now]
  );

  useEffect(() => {
    if (phase === "playing" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase, question]);

  useEffect(() => {
    function handleClick() {
      if (phase === "playing" && inputRef.current) {
        inputRef.current.focus();
      }
    }
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [phase]);

  useEffect(() => {
    if (!roomId) return;

    const s = io(SOCKET_URL, { transports: ["websocket"] });
    setSocket(s);

    s.on("error_msg", (m: string) => setMsg(m));
    s.on("info_msg", (m: string) => setMsg(m));

    s.on("round_begin", (p: { index:number; total:number; endsAt:number; question: QuestionLite }) => {
      setPhase("playing");
      setIndex(p.index); setTotal(p.total); setEndsAt(p.endsAt);
      setQuestion(p.question);
      setSelected(null); setCorrectId(null);
      setMcChoices(null); setTextAnswer("");
      setFeedback(null);
      hasFeedbackRef.current = false;
      // on garde le leaderboard existant; il sera mis à jour par leaderboard_update
    });

    s.on("multiple_choice", (p: { choices: ChoiceLite[] }) => {
      setMcChoices(p.choices);
      setTextAnswer("");
    });

    // 🔔 feedback immédiat après soumission
    s.on("answer_feedback", (p: { correct: boolean; correctChoiceId: string | null; correctLabel: string | null }) => {
      hasFeedbackRef.current = true;
      setFeedback({ ok: p.correct, correctLabel: p.correctLabel ?? null });
      if (p.correctChoiceId) setCorrectId(p.correctChoiceId);
      setPending(false);
    });

    // 🆕 leaderboard live pendant le round
    s.on("leaderboard_update", (p: { leaderboard: LeaderRow[] }) => {
      setLeaderboard(p.leaderboard ?? []);
    });

    // Fin de round (peut aussi contenir le leaderboard)
    s.on("round_end", (p: { index:number; correctChoiceId:string|null; correctLabel?: string | null; leaderboard?: LeaderRow[] }) => {
      setPhase("reveal");
      setCorrectId(p.correctChoiceId);
      if (Array.isArray(p.leaderboard)) setLeaderboard(p.leaderboard);
      if (!hasFeedbackRef.current) {
        setFeedback({ ok: false, correctLabel: p.correctLabel ?? null });
      }
      setEndsAt(null);
    });

    s.on("game_over", () => {
      setPhase("between");
      setQuestion(null); setSelected(null); setCorrectId(null); setEndsAt(null);
      setMcChoices(null); setTextAnswer(""); setFeedback(null);
      setMsg("Next game starting…");
      // on peut conserver le leaderboard final si tu veux le voir entre 2 parties
    });

    // Deep-link join
    (async () => {
      const res = await fetch(`${API_BASE}/rooms/${roomId}`);
      if (res.ok) {
        const { room } = (await res.json()) as { room: { id: string; code: string } };
        const saved = JSON.parse(localStorage.getItem("rq.player") || "{}");
        const name = saved?.name || "Guest";
        s.emit("join_game", { code: room.code, name });
      } else {
        setMsg("Room not found");
      }
    })();

    return () => { s.close(); };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => socket?.emit("start_game");

  const sendText = () => {
    if (!socket || phase !== "playing" || !question) return;
    const t = (textAnswer || "").trim();
    if (!t) return;
    setPending(true);
    socket.emit("submit_answer_text", { text: t }, (res: { ok: boolean }) => {
      setPending(false);
      if (!res?.ok) {
        // message d'erreur si besoin
      }
    });
  };

  const showMultipleChoice = () => {
    if (!socket || phase !== "playing") return;
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
      <button onMouseDown={(e) => e.preventDefault()} onClick={start} style={{ padding: "6px 12px" }}>Start (host)</button>

      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap: 16, alignItems: "start" }}>
        {/* Colonne principale */}
        <div>
          {question ? (
            <div style={{ border: "1px solid #eee", padding: 16, borderRadius: 12, marginTop: 16 }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <div>Question {index + 1}/{total}</div>
                <div>{remaining !== null ? `${remaining}s` : ""}</div>
              </div>

              <h3>{question.text}</h3>
              {question.img && <img src={question.img} alt="" style={{ maxWidth:"100%", borderRadius: 8 }} />}

              {mcChoices ? (
                // --- Mode Multiple-choice ---
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
                // --- Mode Saisie libre ---
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      ref={inputRef}
                      placeholder="Tape ta réponse..."
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          sendText();
                        }
                        if (e.key === "Tab") {
                          e.preventDefault();
                          showMultipleChoice();
                        }
                      }}
                      disabled={phase !== "playing" || !!selected}
                      style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                    />
                    <button onMouseDown={(e) => e.preventDefault()} onClick={sendText} disabled={phase !== "playing"} style={{ padding: "10px 12px" }}>
                      Envoyer
                    </button>
                    <button onClick={showMultipleChoice} disabled={phase !== "playing"} style={{ padding: "10px 12px" }}>
                      Multiple-choice
                    </button>
                  </div>

                  {/* 🔔 Feedback juste sous la barre */}
                  {pending && !feedback && (
                    <div style={{ marginTop: 8, opacity: 0.7 }}>Réponse envoyée…</div>
                  )}
                  {feedback && (
                    <div style={{ marginTop: 8, fontWeight: 600 }}>
                      {feedback.ok ? "Bonne réponse" : "Mauvaise réponse"}
                      {typeof feedback.correctLabel === "string" && (
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
              phase === "idle" ? "Waiting for host…" :
              "Preparing next round…"}
            </div>
          )}
        </div>

        {/* 🆕 Colonne leaderboard */}
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
    </div>
  );
}
