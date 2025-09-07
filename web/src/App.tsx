import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type ChoiceLite = { id: string; label: string };
type QuestionLite = {
  id: string;
  text: string;
  img?: string | null;
  choices: ChoiceLite[];
};

type Phase = "idle" | "playing" | "reveal" | "between";

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("Yoann");

  const [phase, setPhase] = useState<Phase>("idle");
  const [question, setQuestion] = useState<QuestionLite | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [msg, setMsg] = useState<string>("");

  const remaining = useMemo(() => {
    return endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : null;
  }, [endsAt, question, phase]);

  useEffect(() => {
    const s = io("http://localhost:3000", { transports: ["websocket"] });
    setSocket(s);

    s.on("welcome", () => {});
    s.on("error_msg", (m: string) => setMsg(m));
    s.on("info_msg", (m: string) => setMsg(m));

    s.on("joined", (p: { playerGameId: string; name: string; code: string; roomId: string }) => {
      setMsg(`Joined game ${p.code} as ${p.name}`);
      try {
        localStorage.setItem("rq.player", JSON.stringify({ code: p.code, name: p.name }));
      } catch {}
    });

    s.on("round_begin", (p: {
      index: number; total: number; endsAt: number;
      question: QuestionLite;
    }) => {
      setPhase("playing");
      setIndex(p.index);
      setTotal(p.total);
      setEndsAt(p.endsAt);
      setQuestion(p.question);
      setSelected(null);
      setCorrectId(null);
    });

    s.on("round_end", (p: {
      index: number; correctChoiceId: string | null;
      leaderboard: { id: string; name: string; score: number }[];
    }) => {
      setPhase("reveal");
      setCorrectId(p.correctChoiceId);
      // keep question to show reveal
      setEndsAt(null);
    });

    s.on("game_over", (_p: { nextGameReady: boolean }) => {
      setPhase("between");
      setQuestion(null);
      setSelected(null);
      setCorrectId(null);
      setEndsAt(null);
      setMsg("Next game starting…");
    });

    // auto-rejoin if saved
    try {
      const raw = localStorage.getItem("rq.player");
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.code && saved?.name) {
          setCode(saved.code);
          setName(saved.name);
          s.emit("join_game", { code: saved.code, name: saved.name });
        }
      }
    } catch {}

    return () => { 
      s.close();           // or s.disconnect();
    };
  }, []);

  const join = () => {
    if (!socket) return;
    socket.emit("join_game", { code, name });
  };

  const start = () => {
    if (!socket) return;
    socket.emit("start_game"); // ack optional
  };

  const answer = (choiceId: string) => {
    if (!socket) return;
    if (!question || phase !== "playing") return;
    if (selected) return;
    setSelected(choiceId);
    socket.emit("submit_answer", { code, choiceId });
  };

  return (
    <div className="container" style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>Realtime Quiz</h1>
      <p style={{ opacity: 0.8 }}>{msg}</p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <input
          placeholder="Room code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          style={{ padding: 8, width: 120 }}
        />
        <input
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 8, width: 180 }}
        />
        <button onClick={join} style={{ padding: "8px 12px" }}>Join</button>
        <button onClick={start} style={{ padding: "8px 12px" }}>Start (host)</button>
      </div>

      {question ? (
        <div style={{ border: "1px solid #eee", padding: 16, borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div>Question {index + 1}/{total}</div>
            <div>{remaining !== null ? `${remaining}s` : ""}</div>
          </div>
          <h2 style={{ marginTop: 0 }}>{question.text}</h2>
          {question.img && (
            <img src={question.img} alt="" style={{ maxWidth: "100%", borderRadius: 8, margin: "8px 0" }} />
          )}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            {question.choices.map((c) => {
              const isSelected = selected === c.id;
              const isCorrect = correctId && c.id === correctId;
              const disabled = phase !== "playing";
              return (
                <button
                  key={c.id}
                  onClick={() => answer(c.id)}
                  disabled={disabled}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: isCorrect ? "#dff6dd" : isSelected ? "#e8f0fe" : "#f8f8f8",
                    cursor: disabled ? "not-allowed" : "pointer",
                    textAlign: "left",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ opacity: 0.7, padding: 8 }}>
          {phase === "between" ? "Next game starting…" :
           phase === "idle" ? "Waiting for host…" :
           "Preparing next round…"}
        </div>
      )}
    </div>
  );
}