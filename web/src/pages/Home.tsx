// web/src/pages/Home.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Background from "../components/Background";

const API_BASE = import.meta.env.VITE_API_BASE as string;

type OwnerLite = { id: string; displayName: string };
type RoomListItem = {
  id: string;
  name?: string | null;
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
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...init,
    });
    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const data = isJson ? await res.json() : undefined;

    if (!res.ok) {
      throw new Error(
        (data as any)?.error ||
          (data as any)?.message ||
          `HTTP ${res.status}`,
      );
    }
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

      const userCode = (prompt("Cette room est privée. Entrez le code :") || "")
        .trim()
        .toUpperCase();

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

  const headerFont = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

  return (
    <div className="relative">
      <Background />

      {/* CONTAINER */}
      <div
        style={{
          maxWidth: 980,
          margin: "40px auto",
          padding: 16,
          fontFamily: headerFont,
          position: "relative",
          zIndex: 1,
          color: "#fff",
        }}
      >
        {/* HEADER */}
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
            SALONS MULTIJOUEURS
          </h1>
        </div>

        {loading && <div style={{ marginTop: 16 }}>Chargement…</div>}
        {err && <div style={{ marginTop: 16, color: "#fca5a5" }}>{err}</div>}

        {!loading && !err && (
          <>
            {/* TABLEAU */}
            <div
              style={{
                marginTop: 20,
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,.08)",
                boxShadow:
                  "0 30px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04)",
                background:
                  "linear-gradient(180deg, rgba(15,23,42,.88), rgba(2,6,23,.92))",
                backdropFilter: "blur(6px)",
              }}
            >
              {/* EN-TÊTES */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.2fr 1.4fr 1fr 1fr 1.6fr 1fr",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 1.2,
                  padding: "12px 18px",
                  background:
                    "linear-gradient(180deg, rgba(30,41,59,.95), rgba(15,23,42,.95))",
                  borderBottom: "1px solid rgba(255,255,255,.08)",
                  color: "#94a3b8",
                  fontWeight: 700,
                }}
              >
                <span>Salon</span>
                <span>Créateur</span>
                <span>Joueurs</span>
                <span>Difficulté</span>
                <span>Créé le</span>
                <span style={{ textAlign: "right" }}>Statut</span>
              </div>

              {/* LIGNES */}
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {rooms.length === 0 && (
                  <div
                    style={{
                      padding: "16px 18px",
                      fontSize: 13,
                      color: "#9ca3af",
                    }}
                  >
                    Aucune room pour le moment.
                  </div>
                )}

                {rooms.map((r, index) => {
                  const ownerName = r.owner?.displayName || "—";
                  const roomName = r.name?.trim() || "—";

                  // ----------- DIFFICULTÉ → ÉTOILES 1 à 5 ------------
                  const diffNum =
                    typeof r.difficulty === "number" ? r.difficulty : undefined;

                  const diffLabel =
                    diffNum !== undefined ? `${diffNum}/10` : "—";

                  let starCount: number | null = null;
                  
                  if (diffNum !== undefined) {
                    if (diffNum <= 2) starCount = 1;      // 1–2
                    else if (diffNum <= 4) starCount = 2; // 3–4
                    else if (diffNum <= 6) starCount = 3; // 5–6
                    else if (diffNum <= 8) starCount = 4; // 7–8
                    else starCount = 5;                   // 9–10
                  }

                  const diffStars =
                    starCount !== null ? "★".repeat(starCount) : "—";
                  // --------------------------------------------------

                  const pcNum =
                    typeof r.playerCount === "number"
                      ? r.playerCount
                      : undefined;

                  const pcLabel =
                    pcNum !== undefined
                      ? `${pcNum} joueur${pcNum > 1 ? "s" : ""}`
                      : "—";

                  const created =
                    r.createdAt && !Number.isNaN(Date.parse(r.createdAt))
                      ? new Intl.DateTimeFormat("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                          hour12: false,
                        }).format(new Date(r.createdAt))
                      : "—";

                  const baseBg =
                    index % 2 === 0
                      ? "rgba(15,23,42,.75)"
                      : "rgba(2,6,23,.75)";

                  return (
                    <button
                      key={r.id}
                      onClick={() => openRoom(r.id)}
                      style={{
                        width: "100%",
                        display: "grid",
                        gridTemplateColumns:
                          "2.2fr 1.4fr 1fr 1fr 1.6fr 1fr",
                        alignItems: "center",
                        padding: "12px 18px",
                        border: "none",
                        background: baseBg,
                        cursor: "pointer",
                        color: "#e5e7eb",
                        fontSize: 13,
                        textAlign: "left",
                        transition: "all .15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "linear-gradient(90deg, rgba(59,130,246,.18), rgba(15,23,42,.95))";
                        e.currentTarget.style.boxShadow =
                          "inset 0 0 0 1px rgba(59,130,246,.5)";
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = baseBg;
                        e.currentTarget.style.boxShadow = "none";
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      {/* Salon */}
                      <span
                        style={{
                          fontWeight: 700,
                          color: "#e0e7ff",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {roomName}
                      </span>

                      {/* Créateur */}
                      <span
                        style={{
                          opacity: 0.85,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {ownerName}
                      </span>

                      {/* Joueurs */}
                      <span style={{ fontWeight: 700, color: "#bfdbfe" }}>
                        {pcLabel}
                      </span>

                      {/* Difficulté → Étoiles */}
                      <span style={{ fontWeight: 700 }} title={diffLabel}>
                        {diffStars}
                      </span>

                      {/* Créé le */}
                      <span style={{ opacity: 0.75 }}>{created}</span>

                      {/* Statut */}
                      <span
                        style={{
                          justifySelf: "end",
                          padding: "6px 14px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          background:
                            "linear-gradient(135deg, #2563eb, #06b6d4)",
                          color: "#fff",
                          boxShadow: "0 6px 18px rgba(0,0,0,.4)",
                        }}
                      >
                        Rejoindre
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CTA : créer un salon */}
            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => nav("/rooms/new")}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.25)",
                  background: "#DA026F",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all .15s ease",
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
                <span>Créer un salon privé</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
