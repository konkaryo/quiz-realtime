// web/src/pages/Home.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Background from "../components/Background";
import homeBackground from "../assets/background-1.jpg";

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
type BitsLeaderboardEntry = { id: string; name: string; bits: number; img?: string | null };

export default function Home() {
  const nav = useNavigate();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [bitsLeaderboard, setBitsLeaderboard] = useState<BitsLeaderboardEntry[]>([]);
  const [bitsLoading, setBitsLoading] = useState(true);
  const [bitsErr, setBitsErr] = useState<string | null>(null);

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

  async function loadBitsLeaderboard() {
    setBitsLoading(true);
    setBitsErr(null);
    try {
      const data = await fetchJSON("/leaderboard/bits?limit=50");
      setBitsLeaderboard(
        Array.isArray((data as any).leaderboard) ? (data as any).leaderboard : [],
      );
    } catch (e: any) {
      setBitsErr(e?.message || "Erreur");
    } finally {
      setBitsLoading(false);
    }
  }

  useEffect(() => {
    loadRooms();
    loadBitsLeaderboard();
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
  const leftW = 280;

  return (
    <div className="relative min-h-[calc(100dvh-64px)] overflow-hidden">
      <Background />

      <div className="relative z-10 min-h-[calc(100dvh-64px)] text-white">
        <div
          className="hidden lg:block fixed top-16 bottom-0 w-[2px] bg-white/15 z-30"
          style={{ left: leftW }}
          aria-hidden
        />

        <aside className="hidden lg:block fixed top-16 bottom-0 left-0 w-[280px] z-20 overflow-x-hidden">
          <div className="h-full px-6 py-6 flex flex-col overflow-x-hidden border-r border-white/10 bg-slate-950/70 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-white/55">
                Classement général
              </div>
              <div className="text-[12px] text-white/55">{bitsLeaderboard.length} joueurs</div>
            </div>

            <div className="mt-4 flex-1 min-h-0 overflow-x-hidden">
              {bitsLoading && <div className="text-white/45 text-sm">Chargement…</div>}
              {!bitsLoading && bitsErr && <div className="text-rose-200 text-sm">{bitsErr}</div>}
              {!bitsLoading && !bitsErr && bitsLeaderboard.length === 0 && (
                <div className="text-white/45 text-sm">—</div>
              )}
              {!bitsLoading && !bitsErr && bitsLeaderboard.length > 0 && (
                <ol
                  className={[
                    "lb-scroll",
                    "m-0 space-y-2",
                    "overflow-y-auto overflow-x-hidden",
                    "pr-3",
                    "max-h-[560px]",
                    "min-h-[240px]",
                  ].join(" ")}
                >
                  {bitsLeaderboard.map((entry, index) => (
                    <li key={entry.id} className="max-w-full overflow-x-hidden">
                      <div className="flex items-stretch gap-2 w-full max-w-full overflow-x-hidden">
                        <span className="w-4 text-right text-[12px] opacity-70 tabular-nums leading-[42px] flex-shrink-0">
                          {index + 1}
                        </span>

                        <div className="w-full min-w-0 flex items-center justify-between gap-3 rounded-xl px-3 py-2 border border-white/10 bg-white/[0.03]">
                          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                            {entry.img ? (
                              <img
                                src={entry.img}
                                alt=""
                                className="w-7 h-7 rounded-md object-cover flex-shrink-0 border border-white/10"
                                draggable={false}
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-md bg-white/10 border border-white/10 flex-shrink-0" />
                            )}

                            <div className="min-w-0 leading-tight overflow-hidden">
                              <div className="truncate text-[13px] font-semibold text-white/90">
                                {entry.name || "—"}
                              </div>
                              <div className="text-[11px] text-white/45">Bits</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="tabular-nums text-[13px] font-semibold text-white/85">
                              {entry.bits}
                            </span>
                            <span className="text-[11px] text-white/45">bits</span>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </aside>

        {/* CONTAINER */}
        <div
          className="relative lg:ml-[280px]"
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            padding: 16,
            paddingTop: 24,
            fontFamily: headerFont,
            position: "relative",
            zIndex: 1,
            color: "#fff",
            height: "calc(100dvh - 64px)",
            overflow: "hidden",
          }}
        >
          {/* HEADER */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 32, height: 32, display: "inline-flex" }}>
              <button
                onClick={() => {
                  loadRooms();
                  loadBitsLeaderboard();
                }}
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
                  width: "100%",
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

                  {Array.from({
                    length: Math.max(10, rooms.length),
                  }).map((_, index) => {
                    const r = rooms[index];
                    const isEmpty = !r;
                    const ownerName = r?.owner?.displayName || "—";
                    const roomName = r?.name?.trim() || "—";

                    // ----------- DIFFICULTÉ → ÉTOILES 1 à 5 ------------
                    const diffNum =
                      typeof r?.difficulty === "number" ? r.difficulty : undefined;

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
                      typeof r?.playerCount === "number"
                        ? r.playerCount
                        : undefined;

                    const pcLabel =
                      pcNum !== undefined
                        ? `${pcNum} joueur${pcNum > 1 ? "s" : ""}`
                        : "—";

                    const created =
                      r?.createdAt && !Number.isNaN(Date.parse(r.createdAt))
                        ? new Intl.DateTimeFormat("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                            hour12: false,
                          }).format(new Date(r.createdAt))
                        : "—";

                    const baseBg = index % 2 === 0 ? "#0B3146" : "#0A2536";

                    if (isEmpty) {
                      return (
                        <div
                          key={`empty-${index}`}
                          style={{
                            width: "100%",
                            display: "grid",
                            gridTemplateColumns:
                              "2.2fr 1.4fr 1fr 1fr 1.6fr 1fr",
                            alignItems: "center",
                            padding: "12px 18px",
                            background: baseBg,
                            color: "#94a3b8",
                            fontSize: 13,
                            textAlign: "left",
                          }}
                        >
                          <span>—</span>
                          <span>—</span>
                          <span>—</span>
                          <span>—</span>
                          <span>—</span>
                          <span style={{ textAlign: "right" }}>—</span>
                        </div>
                      );
                    }

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
    </div>
  );
}
