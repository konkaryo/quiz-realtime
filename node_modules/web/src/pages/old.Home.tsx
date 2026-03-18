// web/src/pages/Home.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Background from "../components/Background";

const API_BASE = import.meta.env.VITE_API_BASE as string;

type OwnerLite = { id: string; displayName: string };
type RoomListItem = {
  id: string;
  createdAt?: string;
  playerCount?: number;
  difficulty?: number;
  owner?: OwnerLite | null;
  canClose?: boolean;
};
type RoomDetail = { id: string; code?: string | null };

export default function Home() {
  const nav = useNavigate();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function fetchJSON(path: string, init?: RequestInit) {
    const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const data = isJson ? await res.json() : undefined;
    if (!res.ok) throw new Error((data as any)?.error || (data as any)?.message || `HTTP ${res.status}`);
    return data;
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

  return (
    <div className="relative">
      <Background />

      {/* ====== Contenu ====== */}
      <div
        style={{
          maxWidth: 820,
          margin: "40px auto",
          padding: 16,
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          zIndex: 1,
          color: "#fff",
        }}
      >
        {/* Titre + bouton refresh à gauche (texte “Rooms” ne bouge pas) */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 32, height: 32, display: "inline-flex" }}>
            <button
              onClick={loadRooms}
              disabled={loading}
              aria-label="Rafraîchir"
              title="Rafraîchir"
              className={`w-8 h-8 rounded-md border border-white/40 text-white flex items-center justify-center bg-transparent ${
                loading ? "cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                className={loading ? "animate-spin" : ""}
                style={{ display: "block" }}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4v6h6" />
                <path d="M20 20v-6h-6" />
                <path d="M5.5 18.5a8 8 0 1 0 .5-13" />
              </svg>
            </button>
          </span>

          <h1 className="font-brand" style={{ margin: 0, lineHeight: 1 }}>
            LISTE DES SALONS PUBLICS
          </h1>
        </div>

        {loading && <div style={{ marginTop: 16 }}>Chargement…</div>}
        {err && <div style={{ marginTop: 16, color: "#fca5a5" }}>{err}</div>}
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
                    cursor: "pointer",
                    color: "#111827",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        marginBottom: 4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
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

          {/* CTA — pointillés plus fins, texte blanc, fond transparent */}
          <li>
            <button
              onClick={() => nav("/rooms/new")}
              title=""
              aria-label=""
              style={{
                width: "100%",
                padding: 20,
                borderRadius: 12,
                border: "1px dashed #d1d5db",   // ✅ plus fin (1px)
                background: "transparent",       // ✅ fond transparent
                color: "#ffffff",                // ✅ texte en blanc
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                fontWeight: 700,
                cursor: "pointer",
                transition: "transform .12s ease, box-shadow .12s ease",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(0px)";
                e.currentTarget.style.boxShadow = "0 10px 24px rgba(0,0,0,.25), inset 0 0 0 1px rgba(255,255,255,0.10)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.04)";
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span>
              <span>Créer un salon privé</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
