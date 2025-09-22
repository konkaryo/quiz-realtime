// web/src/pages/Home.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE as string;

type OwnerLite = { id: string; displayName: string };
type RoomListItem = {
  id: string;
  createdAt?: string;
  playerCount?: number;
  difficulty?: number;
  owner?: OwnerLite | null;
  canClose?: boolean; // 👈 NOUVEAU: fourni par l'API
};
type RoomDetail = { id: string; code?: string | null };
type Me = { id: string; displayName: string; role?: "USER" | "ADMIN" };

export default function Home() {
  const nav = useNavigate();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  async function fetchJSON(path: string, init?: RequestInit) {
    const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const data = isJson ? await res.json() : undefined;
    if (!res.ok) throw new Error((data as any)?.error || (data as any)?.message || `HTTP ${res.status}`);
    return data;
  }

  async function loadMe() {
    try {
      const data = (await fetchJSON("/auth/me")) as { user: Me | null };
      setMe(data?.user ?? null);
    } catch {
      setMe(null);
    }
  }

  async function loadRooms() {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchJSON("/rooms");
      setRooms(Array.isArray((data as any).rooms) ? (data as any).rooms : []);
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();      // pas strictement nécessaire si /rooms renvoie canClose, mais utile pour fallback
    loadRooms();
  }, []);

  async function openRoom(roomId: string) {
    try {
      const data = (await fetchJSON(`/rooms/${roomId}`)) as { room: RoomDetail };
      const code = (data.room?.code ?? "").trim();
      if (!code) return nav(`/room/${roomId}`);
      const userCode = (prompt("Cette room est privée. Entrez le code :") || "").trim().toUpperCase();
      if (!userCode) return;
      if (userCode === code.toUpperCase()) nav(`/room/${roomId}`);
      else alert("Code invalide.");
    } catch (e: any) {
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("410") || msg.includes("room closed")) {
        alert("Cette room est fermée.");
        await loadRooms();
        return;
      }
      alert(e?.message || "Impossible d'ouvrir la room");
    }
  }

  async function deleteRoom(roomId: string) {
    const r = rooms.find((x) => x.id === roomId);
    const label = r ? `#${r.id.slice(0, 6)}` : roomId.slice(0, 6);
    if (!confirm(`Fermer la room ${label} ?`)) return;
    try {
      await fetchJSON(`/rooms/${roomId}`, { method: "DELETE" });
      setRooms((prev) => prev.filter((x) => x.id !== roomId));
    } catch (e: any) {
      alert(e?.message || "Suppression impossible");
    }
  }

  // Fallback local si l'API ne renvoie pas canClose
  function localCanDelete(r: RoomListItem) {
    if (!me) return false;
    const isOwner = r.owner?.id === me.id;
    const isAdmin = me.role === "ADMIN";
    return isOwner || isAdmin;
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
          const deletable = r.canClose === true || localCanDelete(r);

          return (
            <li key={r.id}>
              {/* Ligne: colonne gauche (croix) + colonne droite (carte) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr",
                  alignItems: "stretch",
                  gap: 12,
                }}
              >
                {/* Colonne gauche : croix (ou placeholder pour alignement) */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {deletable ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRoom(r.id);
                      }}
                      title="Fermer la room"
                      aria-label="Fermer la room"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "#fef2f2",
                        color: "#991b1b",
                        fontWeight: 700,
                        lineHeight: "26px",
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  ) : (
                    <div style={{ width: 28, height: 28 }} />
                  )}
                </div>

                {/* Colonne droite : carte cliquable */}
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
                    cursor: "pointer",
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

                  {/* Badge droite */}
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
              </div>
            </li>
          );
        })}

        {/* Bouton pour créer une nouvelle room */}
        <li>
          <button
            onClick={() => nav("/rooms/new")}
            style={{
              width: "100%",
              padding: 20,
              borderRadius: 12,
              border: "2px dashed #d1d5db",
              background: "#f9fafb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
            title="Créer une nouvelle room"
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span>
            <span>Nouvelle room</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
