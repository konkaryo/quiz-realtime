import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

type Choice = { id: string; label: string };
type Question = { id: string; text: string; choices: Choice[] };
type RoundBegin = { index: number; question: Question };

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const s = io("http://localhost:3000", { transports: ["websocket"] });
    setSocket(s);

    s.on("connect", () => setMsg("Connected"));
    s.on("error_msg", (m: string) => setMsg(m));
    s.on("round_begin", (p: RoundBegin) => {
      setQuestion(p.question);
      setMsg(`Question ${p.index + 1}`);
    });

    return () => { s.disconnect(); };
  }, []);

  const join = () => {
    socket?.emit("join_game", { code: code.trim().toUpperCase(), name: name.trim() });
    setJoined(true);
  };

  const start = () => socket?.emit("start_game", code.trim().toUpperCase());

  const answer = (choiceId: string) => {
    if (!question) return;
    socket?.emit("submit_answer", { code: code.trim().toUpperCase(), questionId: question.id, choiceId });
    setMsg("Answer sent!");
  };

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, maxWidth: 720 }}>
      <h1>Realtime Quiz</h1>
      <p>{msg}</p>

      {!joined && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input placeholder="Game code" value={code} onChange={e => setCode(e.target.value)} />
          <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
          <button onClick={join} disabled={!code.trim() || !name.trim()}>Join</button>
        </div>
      )}

      {joined && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={start}>Start (host)</button>
        </div>
      )}

      {question && (
        <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h3>{question.text}</h3>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
            {question.choices.map(c => (
              <button key={c.id} onClick={() => answer(c.id)} style={{ padding: 12 }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
