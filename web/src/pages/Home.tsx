// web/src/pages/Home.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE as string;

type OwnerLite = { id: string; displayName: string };
type RoomListItem = {
  id: string;
  createdAt?: string;
  playerCount?: number;
  difficulty?: number;           // 👈 nouveau
  owner?: OwnerLite | null;      // 👈 nouveau
};
type RoomDetail = { id: string; code?: string | null };

export default function Home() {
  const nav = useNavigate();
  const [rooms, setRooms]   = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);

  async function fetchJSON(path: string, init?: RequestInit) {
    const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
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
      // attendu: { rooms: Array<{ id, createdAt, playerCount, difficulty, owner:{id,displayName}|null }> }
      const data = await fetchJSON("/rooms");
      setRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRooms(); }, []);

  async function openRoom(roomId: string) {
    try {
      // on ne récupère le code (privée/publique) qu’au clic — jamais affiché
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
    <div style={{ maxWidth: 820, margin: "40px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Rooms</h1>
        <button onClick={loadRooms} disabled={loading} style={{ padding: "6px 10px" }}>
          Rafraîchir
        </button>
      </div>

      {loading && <div style={{ marginTop: 16 }}>Chargement…</div>}
      {err && <div style={{ marginTop: 16, color: "#b00" }}>{err}</div>}
      {!loading && !err && rooms.length === 0 && <div style={{ marginTop: 16 }}>Aucune room.</div>}

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12, marginTop: 16 }}>
        {rooms.map((r) => {
          const ownerName = r.owner?.displayName || "—";
          const diff = typeof r.difficulty === "number" ? r.difficulty : undefined;
          const pc = typeof r.playerCount === "number" ? r.playerCount : undefined;

          return (
            <li key={r.id}>
              <button
                onClick={() => openRoom(r.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: 14,
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                }}
              >
                {/* Bloc gauche : titre + métas */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
                    Room #{r.id.slice(0, 6)}
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 12, opacity: 0.75 }}>
                    {r.createdAt && <span>{new Date(r.createdAt).toLocaleString()}</span>}
                    <span>•</span>
                    <span>Créateur: {ownerName}</span>
                    {diff !== undefined && (
                      <>
                        <span>•</span>
                        <span>Difficulté: {diff}/10</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Badges droite */}
                <div
                    title="Joueurs connectés"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      background: "#f8fafc",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pc !== undefined ? `${pc} joueur${pc > 1 ? "s" : ""}` : "—"}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
