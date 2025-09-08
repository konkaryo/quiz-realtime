// web/src/pages/Home.tsx
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("Yoann");
  const navigate = useNavigate();

  useEffect(() => {
    const s = io({ withCredentials: true, transports: ["websocket", "polling"] });
    setSocket(s);

    s.on("joined", (p: { playerGameId: string; name: string; roomId: string; code: string }) => {
      try {
        localStorage.setItem("rq.player", JSON.stringify({ code: p.code, name: p.name }));
      } catch {}
      navigate(`/room/${p.roomId}`);
    });

    return () => {
      s.close();
    };
  }, [navigate]);

  const join = () => {
    socket?.emit("join_game", { code: code.trim().toUpperCase(), name: name.trim() });
  };

  return (
    <div style={{ maxWidth: 720, margin: "40px auto" }}>
      <h1>Realtime Quiz</h1>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Room code"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
        <button onClick={join}>Join</button>
      </div>
    </div>
  );
}