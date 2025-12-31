// web/src/pages/Home.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Background from "../components/Background";
import homeBackground from "../assets/background-1.jpg"; // (si unused ailleurs tu peux le retirer)

const API_BASE = import.meta.env.VITE_API_BASE as string;

type OwnerLite = { id: string; displayName: string };
type RoomListItem = {
  id: string;
  name?: string | null;
  createdAt?: string;
  playerCount?: number;
  difficulty?: number; // 0–100
  owner?: OwnerLite | null;
  canClose?: boolean;
  isPrivate?: boolean;
};

type RoomDetail = { id: string; code?: string | null };
type BitsLeaderboardEntry = { id: string; name: string; bits: number; img?: string | null };

function diffMeta(diff?: number) {
  if (typeof diff !== "number") return { stars: "—", label: "—", pct: "—" };

  const pct = `${diff}%`;
  let s = 1;
  if (diff <= 20) s = 1;
  else if (diff <= 40) s = 2;
  else if (diff <= 60) s = 3;
  else if (diff <= 80) s = 4;
  else s = 5;

  const label =
    diff <= 20
      ? "Très facile"
      : diff <= 40
        ? "Facile"
        : diff <= 60
          ? "Moyenne"
          : diff <= 80
            ? "Difficile"
            : "Expert";

  return { stars: "★".repeat(s), label, pct };
}

function fmtCreated(createdAt?: string) {
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(createdAt));
}

function bestEffortIsPrivate(r: RoomListItem) {
  return Boolean((r as any).isPrivate) || Boolean((r as any).code);
}

export default function Home() {
  const nav = useNavigate();

  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [bitsLeaderboard, setBitsLeaderboard] = useState<BitsLeaderboardEntry[]>([]);
  const [bitsLoading, setBitsLoading] = useState(true);
  const [bitsErr, setBitsErr] = useState<string | null>(null);

  // Lobby UI
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "public" | "private">("all");
  const [sortBy, setSortBy] = useState<"recent" | "players" | "difficulty">("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function fetchJSON(path: string, init?: RequestInit) {
    const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const data = isJson ? await res.json() : undefined;

    if (!res.ok) {
      throw new Error((data as any)?.error || (data as any)?.message || `HTTP ${res.status}`);
    }
    return data;
  }

  async function loadRooms() {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchJSON("/rooms");
      const list = Array.isArray((data as any).rooms) ? ((data as any).rooms as RoomListItem[]) : [];
      setRooms(list);
      if (list.length > 0) setSelectedId((prev) => prev ?? list[0].id);
      else setSelectedId(null);
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

  // Layout
  const leftW = 500;
  const leftPad = 58;

  const filteredRooms = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = rooms.slice();

    if (tab === "public") list = list.filter((r) => !bestEffortIsPrivate(r));
    if (tab === "private") list = list.filter((r) => bestEffortIsPrivate(r));

    if (query) {
      list = list.filter((r) => {
        const name = (r.name ?? "").toLowerCase();
        const owner = (r.owner?.displayName ?? "").toLowerCase();
        return name.includes(query) || owner.includes(query);
      });
    }

    list.sort((a, b) => {
      if (sortBy === "players") {
        const ap = typeof a.playerCount === "number" ? a.playerCount : -1;
        const bp = typeof b.playerCount === "number" ? b.playerCount : -1;
        return bp - ap;
      }
      if (sortBy === "difficulty") {
        const ad = typeof a.difficulty === "number" ? a.difficulty : -1;
        const bd = typeof b.difficulty === "number" ? b.difficulty : -1;
        return bd - ad;
      }
      const at = a.createdAt && !Number.isNaN(Date.parse(a.createdAt)) ? Date.parse(a.createdAt) : 0;
      const bt = b.createdAt && !Number.isNaN(Date.parse(b.createdAt)) ? Date.parse(b.createdAt) : 0;
      return bt - at;
    });

    return list;
  }, [rooms, q, tab, sortBy]);

  // Rooms list look
  const listPrimaryBg = "bg-[#11182A]";
  const listAlternateBg = "bg-[#1B2132]";
  const listShadow = "shadow-[0_6px_16px_rgba(0,0,0,.30)]";
  const listPanel =
    "rounded-2xl overflow-hidden border border-white/10 " +
    "bg-gradient-to-b from-[#10172A]/95 to-[#0D1324]/95 " +
    "shadow-[0_18px_60px_rgba(0,0,0,.50)]";
  const colHead = "text-[10px] tracking-[0.16em] uppercase font-medium text-white/45";
  const selGrad = "bg-gradient-to-b from-sky-500/35 to-cyan-400/20";
  const selRing = "ring-1 ring-sky-200/50";

  const TabBtn = ({
    label,
    active,
    onClick,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-9 px-3 rounded-md border text-sm font-semibold transition",
        active
          ? `border-sky-200/35 ${selGrad} text-white ${selRing} shadow-[0_10px_22px_rgba(0,0,0,.25)]`
          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07] text-white/85",
      ].join(" ")}
    >
      {label}
    </button>
  );

  const Badge = ({
    variant,
    children,
  }: {
    variant: "public" | "private";
    children: any;
  }) => {
    const cls =
      variant === "public"
        ? "bg-white/5 text-cyan-200/90 border-white/10"
        : "bg-white/5 text-amber-200/90 border-white/10";
    return (
      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
        {children}
      </span>
    );
  };

  // =========================
  // Leaderboard: closer to reference
  // =========================
  const Laurel = ({ tone }: { tone: "gold" | "silver" | "bronze" }) => {
    const c =
      tone === "gold"
        ? "rgba(255,214,140,.95)"
        : tone === "silver"
          ? "rgba(220,230,245,.92)"
          : "rgba(255,200,170,.92)";
    return (
      <svg width="34" height="22" viewBox="0 0 52 36" fill="none" aria-hidden>
        <path
          d="M18 30c-7-3-12-9-12-16 0-4 2-7 5-9-1 3 1 6 4 7-2 1-3 3-3 6 0 5 3 9 6 12z"
          fill={c}
          opacity="0.95"
        />
        <path
          d="M16 22c-4-2-7-6-7-11 0-2 1-4 3-5-1 3 1 5 3 6-1 1-2 2-2 4 0 3 1 4 3 6z"
          fill={c}
          opacity="0.65"
        />
        <path
          d="M34 30c7-3 12-9 12-16 0-4-2-7-5-9 1 3-1 6-4 7 2 1 3 3 3 6 0 5-3 9-6 12z"
          fill={c}
          opacity="0.95"
        />
        <path
          d="M36 22c4-2 7-6 7-11 0-2-1-4-3-5 1 3-1 5-3 6 1 1 2 2 2 4 0 3-1 4-3 6z"
          fill={c}
          opacity="0.65"
        />
      </svg>
    );
  };

  const LbRow = ({
    rank,
    name,
    bits,
    img,
  }: {
    rank: number;
    name: string;
    bits: number;
    img?: string | null;
  }) => {
    const isTop = rank <= 3;

    const tone: "gold" | "silver" | "bronze" =
      rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";

    const border =
      rank === 1
        ? "rgba(255,214,140,.40)"
        : rank === 2
          ? "rgba(220,230,245,.30)"
          : rank === 3
            ? "rgba(255,200,170,.28)"
            : "rgba(255,255,255,.10)";

    const glow =
      rank === 1
        ? "0 0 0 1px rgba(255,214,140,.22), 0 0 34px rgba(255,214,140,.18), 0 18px 50px rgba(0,0,0,.45)"
        : rank === 2
          ? "0 0 0 1px rgba(220,230,245,.18), 0 0 30px rgba(220,230,245,.14), 0 18px 50px rgba(0,0,0,.45)"
          : rank === 3
            ? "0 0 0 1px rgba(255,200,170,.16), 0 0 28px rgba(255,200,170,.12), 0 18px 50px rgba(0,0,0,.45)"
            : "0 14px 40px rgba(0,0,0,.38)";

    // ✅ Style dark "de base"
    const rowBg = "linear-gradient(180deg, rgba(16,23,42,.86), rgba(10,16,32,.74))";

    const innerStroke =
      "inset 0 1px 0 rgba(255,255,255,.06), inset 0 -1px 0 rgba(0,0,0,.35)";

    return (
      <div
        className={[
          "relative overflow-hidden rounded-xl",
          isTop ? "lb-owBorder h-[74px]" : "h-[56px]",
        ].join(" ")}
        style={{
          background: rowBg,
          // Pour top3 : bordure légère, la “vraie” bordure est le pseudo-élément
          border: isTop ? "1px solid rgba(255,255,255,.10)" : `1px solid ${border}`,
          boxShadow: `${glow}, ${innerStroke}`,
        }}
      >
        {/* Sheen léger (comme avant) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(115deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,0) 38%, rgba(120,220,255,.05) 70%, rgba(120,220,255,0) 100%)",
            opacity: isTop ? 0.65 : 0.35,
          }}
          aria-hidden
        />

        <div className="h-full flex items-center justify-between gap-4 px-4 relative z-[1]">
          {/* LEFT: rank block */}
          <div className="flex items-center gap-3 min-w-0">
            {isTop ? (
              <div className="w-[72px] flex items-center justify-center">
                <div className="relative flex items-center justify-center">
                  <div className="absolute -top-[7px] left-1/2 -translate-x-1/2">
                    <Laurel tone={tone} />
                  </div>
                  <div
                    className="tabular-nums font-extrabold text-[28px]"
                    style={{
                      color:
                        rank === 1
                          ? "rgba(255,214,140,.98)"
                          : rank === 2
                            ? "rgba(220,230,245,.96)"
                            : "rgba(255,200,170,.96)",
                      textShadow: "0 2px 12px rgba(0,0,0,.55)",
                      letterSpacing: "0.02em",
                      transform: "translateY(4px)",
                    }}
                  >
                    {rank}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="w-[56px] h-[40px] rounded-lg flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.08)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
                }}
              >
                <div
                  className="tabular-nums font-extrabold text-[18px]"
                  style={{ color: "rgba(255,255,255,.78)", textShadow: "0 1px 0 rgba(0,0,0,.65)" }}
                >
                  {rank}
                </div>
              </div>
            )}

            {/* NAME + bits (top3 two lines) */}
            <div className="min-w-0">
              <div className={["truncate font-semibold", isTop ? "text-[18px]" : "text-[16px]"].join(" ")}>
                {name || "—"}
              </div>
              {isTop ? (
                <div className="text-[13px] text-white/55">
                  <span className="tabular-nums">{bits}</span> bits
                </div>
              ) : null}
            </div>
          </div>

          {/* RIGHT: bits (non-top) + avatar */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {!isTop ? (
              <div className="text-[16px] font-semibold tabular-nums text-white/70 w-[72px] text-right">
                {bits}
              </div>
            ) : null}

            <div
              className="w-[46px] h-[46px] rounded-full overflow-hidden flex-shrink-0"
              style={{
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.14)",
                boxShadow: "0 10px 30px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.10)",
              }}
            >
              {img ? (
                <img
                  src={img}
                  alt=""
                  className="w-full h-full object-cover"
                  draggable={false}
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-white/10" />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-[calc(100dvh-64px)] overflow-hidden">
      <Background />

      {/* ✅ Bordure uniquement (pas de couche grise), style dark conservé */}
      <style>{`
        .lb-owBorder {
          position: relative;
        }

        /* Bordure premium: or à gauche, bleu à droite (statique) */
        .lb-owBorder::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.5px; /* épaisseur bordure */
          pointer-events: none;

          background: linear-gradient(
            90deg,
            rgba(255,214,140,.92) 0%,
            rgba(255,214,140,.32) 18%,
            rgba(255,255,255,.10) 46%,
            rgba(255,255,255,.10) 54%,
            rgba(120,220,255,.32) 82%,
            rgba(120,220,255,.92) 100%
          );

          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;

          filter:
            drop-shadow(0 0 10px rgba(255,214,140,.14))
            drop-shadow(0 0 10px rgba(120,220,255,.16));
          opacity: .95;
        }

        /* Shimmer très discret, uniquement sur la bordure */
        .lb-owBorder::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.5px;
          pointer-events: none;

          background: linear-gradient(
            110deg,
            rgba(255,255,255,0) 0%,
            rgba(255,255,255,0) 44%,
            rgba(255,255,255,.40) 50%,
            rgba(255,255,255,0) 56%,
            rgba(255,255,255,0) 100%
          );
          background-size: 220% 100%;
          background-position: -120% 50%;

          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;

          opacity: .22;
          animation: lbBorderShimmer 4.2s ease-in-out infinite;
        }

        @keyframes lbBorderShimmer {
          0%   { background-position: -120% 50%; opacity: .10; }
          45%  { opacity: .22; }
          100% { background-position: 120% 50%; opacity: .10; }
        }

        @media (prefers-reduced-motion: reduce) {
          .lb-owBorder::after { animation: none; }
        }
      `}</style>

      <div className="relative z-10 min-h-[calc(100dvh-64px)] text-white">
        {/* LEFT SIDEBAR */}
        <aside
          className="hidden lg:block fixed top-16 bottom-0 left-0 z-20 overflow-x-hidden"
          style={{ width: leftW }}
        >
          <div className="h-full flex flex-col overflow-x-hidden">
            <div style={{ paddingLeft: leftPad, paddingRight: 24 }} className="pt-6 pb-6">
              {/* Frame closer to screenshot */}
              <div
                className="relative rounded-2xl"
                style={{
                  padding: 14,
                  background:
                    "radial-gradient(1200px 500px at 20% 10%, rgba(120,220,255,.10), rgba(0,0,0,0) 55%)," +
                    "radial-gradient(900px 520px at 60% 30%, rgba(255,255,255,.06), rgba(0,0,0,0) 62%)," +
                    "linear-gradient(180deg, rgba(10,16,32,.62), rgba(10,16,32,.38))",
                  border: "1px solid rgba(160,230,255,.22)",
                  boxShadow:
                    "0 24px 70px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.07)",
                }}
              >
                {/* right cyan glow line like reference */}
                <div
                  className="absolute top-3 bottom-3 right-3 w-[2px] rounded-full"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(120,220,255,.0), rgba(120,220,255,.65), rgba(120,220,255,.0))",
                    boxShadow: "0 0 18px rgba(120,220,255,.35)",
                    opacity: 0.95,
                  }}
                  aria-hidden
                />

                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-white/55">
                    Top joueurs (bits)
                  </div>
                  <div className="text-[12px] text-white/45 tabular-nums">{bitsLeaderboard.length}</div>
                </div>

                <div className="mt-4">
                  {bitsLoading && <div className="text-white/45 text-sm">Chargement…</div>}
                  {!bitsLoading && bitsErr && <div className="text-rose-200 text-sm">{bitsErr}</div>}
                  {!bitsLoading && !bitsErr && bitsLeaderboard.length === 0 && (
                    <div className="text-white/45 text-sm">—</div>
                  )}

                  {!bitsLoading && !bitsErr && bitsLeaderboard.length > 0 && (
                    <div className="lb-scroll overflow-y-auto pr-2 max-h-[78vh]">
                      {/* spacing like reference */}
                      <div className="space-y-3">
                        {bitsLeaderboard.map((e, idx) => (
                          <LbRow
                            key={e.id}
                            rank={idx + 1}
                            name={e.name || "—"}
                            bits={typeof e.bits === "number" ? e.bits : 0}
                            img={e.img}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <div
          className="relative"
          style={{
            fontFamily: headerFont,
            height: "calc(100dvh - 64px)",
            overflow: "hidden",
          }}
        >
          <div
            className="h-full"
            style={{
              marginLeft: leftW,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div style={{ width: "100%", maxWidth: 1180, padding: 16, paddingTop: 24 }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <h1 className="font-brand m-0 leading-none">SALONS MULTIJOUEURS</h1>
                  </div>
                </div>
                <div />
              </div>

              {loading && <div style={{ marginTop: 16 }}>Chargement…</div>}
              {err && <div style={{ marginTop: 16, color: "#fca5a5" }}>{err}</div>}

              {!loading && !err && (
                <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-4 h-[calc(100dvh-64px-104px)]">
                  <div className="flex flex-col min-h-0">
                    <div className="px-1 pt-1 pb-3 flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <TabBtn label="Tous" active={tab === "all"} onClick={() => setTab("all")} />
                          <TabBtn label="Public" active={tab === "public"} onClick={() => setTab("public")} />
                          <TabBtn label="Privé" active={tab === "private"} onClick={() => setTab("private")} />
                        </div>

                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as any)}
                          className="h-9 px-3 rounded-md border border-white/10 bg-white/[0.04] text-sm font-semibold text-white/85 outline-none"
                          title="Trier"
                        >
                          <option value="recent" className="bg-[#11182A]">
                            Plus récents
                          </option>
                          <option value="players" className="bg-[#11182A]">
                            Plus de joueurs
                          </option>
                          <option value="difficulty" className="bg-[#11182A]">
                            Plus difficile
                          </option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                          <span className="text-white/55 text-sm">⌕</span>
                          <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Filtrer par salon ou créateur…"
                            className="w-full bg-transparent outline-none text-[14px] text-white/95 placeholder:text-white/45"
                          />
                          {q.trim() && (
                            <button
                              type="button"
                              onClick={() => setQ("")}
                              className="text-white/55 hover:text-white text-sm px-2"
                              aria-label="Effacer"
                              title="Effacer"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        <button
                          onClick={() => loadRooms()}
                          className="h-10 px-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] text-sm font-extrabold text-white/90"
                          type="button"
                          title="Rafraîchir la liste"
                        >
                          ↻
                        </button>
                      </div>
                    </div>

                    <div className="px-1 pb-3">
                      <div className="hidden sm:grid grid-cols-[2.2fr_1fr_1fr_1.2fr_0.9fr] gap-3 px-3 py-2">
                        <div className={colHead}>Salon</div>
                        <div className={colHead}>Joueurs</div>
                        <div className={colHead}>Difficulté</div>
                        <div className={colHead}>Créateur</div>
                        <div className={colHead}>Créé</div>
                      </div>
                    </div>

                    <div className={`${listPanel} flex flex-col min-h-0 flex-1`}>
                      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
                        {filteredRooms.length === 0 ? (
                          <div className="px-4 py-10 text-center">
                            <div className="text-white/90 font-extrabold text-lg">Aucun salon</div>
                            <div className="text-white/60 text-sm mt-2">Change le filtre ou crée un salon.</div>
                            <button
                              onClick={() => nav("/rooms/new")}
                              className="mt-6 h-11 px-5 rounded-xl font-extrabold text-sm text-white bg-gradient-to-b from-[#D30E72] to-[#770577] hover:brightness-110"
                              type="button"
                            >
                              ＋ Créer un salon
                            </button>
                          </div>
                        ) : (
                          <>
                            <ol className="space-y-1.5">
                              {filteredRooms.map((r, idx) => {
                                const isSelected = r.id === selectedId;
                                const hasAlternateBackground = idx % 2 === 1;

                                const roomName = r?.name?.trim() || "—";
                                const ownerName = r?.owner?.displayName || "—";
                                const pc =
                                  typeof r?.playerCount === "number" ? r.playerCount : undefined;
                                const pcLabel = pc !== undefined ? `${pc}` : "—";
                                const d = diffMeta(r?.difficulty);
                                const created = fmtCreated(r?.createdAt);
                                const isPrivate = bestEffortIsPrivate(r);

                                return (
                                  <li key={r.id}>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedId(r.id)}
                                      onDoubleClick={() => openRoom(r.id)}
                                      className={[
                                        "w-full text-left rounded-lg px-3 py-2 border overflow-hidden",
                                        listShadow,
                                        "text-[13px] leading-tight transition",
                                        isSelected
                                          ? `border-sky-200/35 ${selGrad} text-white ${selRing}`
                                          : `${
                                              hasAlternateBackground ? listAlternateBg : listPrimaryBg
                                            } text-white border-white/10 hover:brightness-110`,
                                      ].join(" ")}
                                    >
                                      <div className="grid grid-cols-1 sm:grid-cols-[2.2fr_1fr_1fr_1.2fr_0.9fr] gap-3 items-center">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="truncate font-semibold text-white/95">{roomName}</span>
                                            {isPrivate ? (
                                              <Badge variant="private">Privé</Badge>
                                            ) : (
                                              <Badge variant="public">Public</Badge>
                                            )}
                                          </div>
                                          <div className="text-[11px] opacity-70 truncate">
                                            ID: <span className="opacity-90">{r.id}</span>
                                          </div>
                                        </div>

                                        <div className="flex items-baseline gap-2">
                                          <span className="tabular-nums text-sm font-semibold">{pcLabel}</span>
                                          <span className="text-[11px] opacity-70">joueurs</span>
                                        </div>

                                        <div title={d.pct}>
                                          <div className="font-semibold">{d.stars}</div>
                                          <div className="text-[11px] opacity-70">{d.label}</div>
                                        </div>

                                        <div className="min-w-0">
                                          <div className="truncate">{ownerName}</div>
                                          <div className="text-[11px] opacity-70">créateur</div>
                                        </div>

                                        <div className="text-[12px] opacity-85">{created}</div>
                                      </div>
                                    </button>
                                  </li>
                                );
                              })}
                            </ol>

                            <div className="mt-3 opacity-0 select-none">
                              <div className="h-[260px]" />
                            </div>
                          </>
                        )}
                      </div>

                      <div className="px-4 py-3 border-t border-white/10 bg-[#0E1424]/70 text-sm text-white/65 flex items-center justify-between">
                        <span>
                          {filteredRooms.length} salon{filteredRooms.length > 1 ? "s" : ""} affiché
                          {filteredRooms.length > 1 ? "s" : ""}
                        </span>
                        <span className="hidden sm:inline">Double-clic = rejoindre</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={[
                      "rounded-2xl border border-white/10",
                      "bg-gradient-to-b from-[#10172A]/70 to-[#0D1324]/70",
                      "shadow-[0_18px_60px_rgba(0,0,0,.45)]",
                    ].join(" ")}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
