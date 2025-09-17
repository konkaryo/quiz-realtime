// web/src/pages/Home.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE as string;

type RoomListItem = { id: string; createdAt?: string };
type RoomDetail = { id: string; code?: string | null };

export default function Home() {
  const nav = useNavigate();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function fetchJSON(path: string, init?: RequestInit) {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...init,
    });
    // Petite garde pour détecter le HTML servi par erreur
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const text = await res.text();
      throw new Error(`${res.status} ${res.statusText} – non-JSON: ${text.slice(0,120)}`);
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    return data;
  }

  async function loadRooms() {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchJSON("/rooms");
      setRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    console.log("API_BASE =", API_BASE); // Doit afficher http://localhost:3001
    loadRooms();
  }, []);

  async function openRoom(roomId: string) {
    try {
      const data = (await fetchJSON(`/rooms/${roomId}`)) as { room: RoomDetail };
      const code = (data.room?.code ?? "").trim();
      if (!code) return nav(`/room/${roomId}`); // publique
      const userCode = (prompt("Cette room est privée. Entrez le code :") || "").trim().toUpperCase();
      if (!userCode) return;
      if (userCode === code.toUpperCase()) nav(`/room/${roomId}`);
      else alert("Code invalide.");
    } catch (e: any) {
      alert(e?.message || "Impossible d'ouvrir la room");
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1>Rooms</h1>
      <div style={{ fontSize: 12, opacity: .7, marginBottom: 8 }}>API: {API_BASE}</div>
      <button onClick={loadRooms} disabled={loading}>Rafraîchir</button>
      {loading && <div>Chargement…</div>}
      {err && <div style={{ color: "#b00" }}>{err}</div>}
      {!loading && !err && rooms.length === 0 && <div>Aucune room.</div>}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {rooms.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => openRoom(r.id)}
              style={{ width: "100%", textAlign: "left", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            >
              <div style={{ fontWeight: 600 }}>Room #{r.id.slice(0, 6)}</div>
              {r.createdAt && (
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {new Date(r.createdAt).toLocaleString()}
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
