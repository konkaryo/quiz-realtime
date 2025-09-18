// web/src/pages/Home.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE as string;

type RoomListItem = {
  id: string;
  createdAt?: string;
  playerCount?: number; // <- nouveau
};
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
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const text = await res.text();
      throw new Error(`${res.status} ${res.statusText} – non-JSON: ${text.slice(0, 120)}`);
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    return data;
  }

  async function loadRooms() {
    setLoading(true);
    setErr(null);
    try {
      // /rooms doit renvoyer: { rooms: Array<{ id, createdAt, playerCount }> }
      const data = await fetchJSON("/rooms");
      const list = Array.isArray(data.rooms) ? data.rooms : [];
      setRooms(list);
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRooms();
  }, []);

  async function openRoom(roomId: string) {
    try {
      // On récupère le détail AU CLIC SEULEMENT (et on ne l’affiche pas)
      const data = (await fetchJSON(`/rooms/${roomId}`)) as { room: RoomDetail };
      const code = (data.room?.code ?? "").trim();

      // room publique: pas de code => navigation directe
      if (!code) return nav(`/room/${roomId}`);

      // room privée: on demande le code à l’utilisateur
      const userCode = (prompt("Cette room est privée. Entrez le code :") || "").trim().toUpperCase();
      if (!userCode) return;

      if (userCode === code.toUpperCase()) {
        nav(`/room/${roomId}`);
      } else {
        alert("Code invalide.");
      }
    } catch (e: any) {
      alert(e?.message || "Impossible d'ouvrir la room");
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Rooms</h1>
        <button onClick={loadRooms} disabled={loading} style={{ padding: "6px 10px" }}>
          Rafraîchir
        </button>
      </div>

      {loading && <div style={{ marginTop: 16 }}>Chargement…</div>}
      {err && <div style={{ marginTop: 16, color: "#b00" }}>{err}</div>}
      {!loading && !err && rooms.length === 0 && <div style={{ marginTop: 16 }}>Aucune room.</div>}

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10, marginTop: 16 }}>
        {rooms.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => openRoom(r.id)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>Room #{r.id.slice(0, 6)}</div>
                {r.createdAt && (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Badge joueurs */}
              <div
                title="Joueurs connectés"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  background: "#f8fafc",
                }}
              >
                {typeof r.playerCount === "number" ? `${r.playerCount} joueur${r.playerCount > 1 ? "s" : ""}` : "—"}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
