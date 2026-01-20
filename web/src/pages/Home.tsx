// web/src/pages/Home.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

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
  const listPrimaryBg = "bg-[#1C1F2E]";
  const listAlternateBg = "bg-[#181A28]";
  const listShadow = "shadow-[0_5px_12px_rgba(0,0,0,.30)]";
  const listPanel =
    "rounded-[6px] overflow-hidden border border-[#2A2D3C] bg-[#1C1F2E] " +
    "shadow-[0_18px_40px_rgba(0,0,0,.45)]";
  const colHead = "text-[10px] tracking-[0.16em] uppercase font-medium text-white/45";
  const selGrad = "bg-gradient-to-b from-[#2D7CFF]/35 to-[#1F65DB]/25";
  const selRing = "ring-1 ring-[#2D7CFF]/45";

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
        "h-7 px-2.5 rounded-[6px] border text-[12px] font-semibold transition",
        active
          ? `border-[#2D7CFF]/40 ${selGrad} text-white ${selRing} shadow-[0_10px_22px_rgba(0,0,0,.25)]`
          : "border-[#2A2D3C] bg-white/[0.04] hover:bg-white/[0.07] text-white/85",
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
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[999px] border ${cls}`}>
        {children}
      </span>
    );
  };

  return (
    <div className="relative text-slate-50">
      <div aria-hidden className="fixed inset-0 bg-[#13141F]" />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 py-10 sm:px-8 lg:px-10">
        <header className="mb-3 text-center">
          <h1 className="text-5xl font-brand text-slate-50">SALONS MULTIJOUEURS</h1>
        </header>

        {loading && <div style={{ marginTop: 16 }}>Chargement…</div>}
        {err && <div style={{ marginTop: 16, color: "#fca5a5" }}>{err}</div>}

        {!loading && !err && (
          <div className="mt-4 flex min-h-0 flex-col gap-3">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <TabBtn label="Tous" active={tab === "all"} onClick={() => setTab("all")} />
                  <TabBtn label="Public" active={tab === "public"} onClick={() => setTab("public")} />
                  <TabBtn label="Privé" active={tab === "private"} onClick={() => setTab("private")} />
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="h-7 px-2.5 rounded-[6px] border border-[#2A2D3C] bg-white/[0.04] text-[12px] font-semibold text-white/85 outline-none"
                  title="Trier"
                >
                  <option value="recent" className="bg-[#1C1F2E]">
                    Plus récents
                  </option>
                  <option value="players" className="bg-[#1C1F2E]">
                    Plus de joueurs
                  </option>
                  <option value="difficulty" className="bg-[#1C1F2E]">
                    Plus difficile
                  </option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-[6px] border border-[#2A2D3C] bg-white/[0.04] px-2.5 py-1.5">
                  <span className="text-white/55 text-[12px]">⌕</span>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Filtrer par salon ou créateur…"
                    className="w-full bg-transparent outline-none text-[12px] text-white/95 placeholder:text-white/45"
                  />
                  {q.trim() && (
                    <button
                      type="button"
                      onClick={() => setQ("")}
                      className="text-white/55 hover:text-white text-[12px] px-1.5"
                      aria-label="Effacer"
                      title="Effacer"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  onClick={() => loadRooms()}
                  className="h-8 px-2.5 rounded-[6px] border border-[#2A2D3C] bg-white/[0.04] hover:bg-white/[0.07] text-[12px] font-extrabold text-white/90"
                  type="button"
                  title="Rafraîchir la liste"
                >
                  ↻
                </button>
              </div>
            </div>
            <div className="px-1">
              <div className="hidden sm:grid grid-cols-[2.2fr_1fr_1fr_1.2fr_0.9fr] gap-2.5 px-2.5 py-1.5">
                <div className={colHead}>Salon</div>
                <div className={colHead}>Joueurs</div>
                <div className={colHead}>Difficulté</div>
                <div className={colHead}>Créateur</div>
                <div className={colHead}>Créé</div>
              </div>
            </div>
            <div className={`${listPanel} flex flex-col min-h-0 flex-1`}>
              <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2.5">
                {filteredRooms.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <div className="text-white/90 font-extrabold text-[15px]">Aucun salon</div>
                    <div className="text-white/60 text-[12px] mt-1.5">
                      Change le filtre ou crée un salon.
                    </div>
                    <button
                      onClick={() => nav("/rooms/new")}
                      className="mt-5 h-9 px-4 rounded-[6px] font-extrabold text-[12px] text-white bg-gradient-to-b from-[#D30E72] to-[#770577] hover:brightness-110"
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
                        const pc = typeof r?.playerCount === "number" ? r.playerCount : undefined;
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
                                "w-full text-left rounded-[6px] px-2.5 py-1.5 border overflow-hidden",
                                listShadow,
                                "text-[12px] leading-tight transition",
                                isSelected
                                  ? `border-[#2D7CFF]/45 ${selGrad} text-white ${selRing}`
                                  : `${
                                      hasAlternateBackground ? listAlternateBg : listPrimaryBg
                                    } text-white border-[#2A2D3C] hover:brightness-110`,
                              ].join(" ")}
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-[2.2fr_1fr_1fr_1.2fr_0.9fr] gap-2.5 items-center">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="truncate font-semibold text-white/95">{roomName}</span>
                                    {isPrivate ? (
                                      <Badge variant="private">Privé</Badge>
                                    ) : (
                                      <Badge variant="public">Public</Badge>
                                    )}
                                  </div>
                                  <div className="text-[10px] opacity-70 truncate">
                                    ID: <span className="opacity-90">{r.id}</span>
                                  </div>
                                </div>

                                <div className="flex items-baseline gap-2">
                                  <span className="tabular-nums text-[12px] font-semibold">{pcLabel}</span>
                                  <span className="text-[10px] opacity-70">joueurs</span>
                                </div>

                                <div title={d.pct}>
                                  <div className="font-semibold">{d.stars}</div>
                                  <div className="text-[10px] opacity-70">{d.label}</div>
                                </div>

                                <div className="min-w-0">
                                  <div className="truncate">{ownerName}</div>
                                  <div className="text-[10px] opacity-70">créateur</div>
                                </div>

                                <div className="text-[11px] opacity-85">{created}</div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ol>

                    <div className="mt-2 opacity-0 select-none">
                      <div className="h-[210px]" />
                    </div>
                  </>
                )}
              </div>

              <div className="px-3 py-2 border-t border-[#2A2D3C] bg-[#181A28] text-[12px] text-white/65 flex items-center justify-between">
                <span>
                  {filteredRooms.length} salon{filteredRooms.length > 1 ? "s" : ""} affiché
                  {filteredRooms.length > 1 ? "s" : ""}
                </span>
                <span className="hidden sm:inline">Double-clic = rejoindre</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
