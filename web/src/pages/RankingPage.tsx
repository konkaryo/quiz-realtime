import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Search, Star } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import bitIconUrl from "@/assets/bit.png";
import goldRankingUrl from "@/assets/gold_ranking.png";
import silverRankingUrl from "@/assets/silver_ranking.png";
import bronzeRankingUrl from "@/assets/bronze_ranking.png";
import Background from "../components/Background";

const API_BASE = import.meta.env.VITE_API_BASE ?? (typeof window !== "undefined" ? window.location.origin : "");

type RankingKind = "general" | "daily";
type ScoreMode = "bits" | "daily";

type LeaderboardEntry = {
  id: string;
  name: string;
  img?: string | null;
  bits?: number;
  experience?: number;
  score?: number;
  gamesPlayed?: number;
  rank?: number;
};

type SelfLeaderboard = { rank: number; entry: LeaderboardEntry } | null;

type DailyLeaderboardEntry = { playerId: string; playerName: string; score: number; gamesPlayed?: number; img?: string | null };

const PAGE_SIZE = 10;

const FILTERS: Array<{ value: RankingKind; label: string; icon: typeof Star }> = [
  { value: "general", label: "Classement général", icon: Star },
  { value: "daily", label: "Défi du jour", icon: CalendarDays },
];

function formatValue(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatMonthOption(monthIso: string) {
  const [year, month] = monthIso.split("-").map(Number);
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date(year, month - 1, 1));
  return `${year} - ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function getMonthOptions(count = 24) {
  const date = new Date();
  date.setDate(1);

  return Array.from({ length: count }, (_, index) => {
    const optionDate = new Date(date.getFullYear(), date.getMonth() - index, 1);
    const value = `${optionDate.getFullYear()}-${String(optionDate.getMonth() + 1).padStart(2, "0")}`;
    return { value, label: formatMonthOption(value) };
  });
}

function dailyLeaderboardUrl(monthIso: string) {
  return `${API_BASE}/daily/leaderboard/monthly?month=${encodeURIComponent(monthIso)}&all=true`;
}

function isDailyLeaderboardEntry(row: LeaderboardEntry | DailyLeaderboardEntry): row is DailyLeaderboardEntry {
  return "playerId" in row;
}

function normalizeLeaderboardEntry(row: LeaderboardEntry | DailyLeaderboardEntry): LeaderboardEntry {
  if (!isDailyLeaderboardEntry(row)) return row;
  return {
    id: row.playerId,
    name: row.playerName,
    img: row.img,
    score: row.score,
    gamesPlayed: row.gamesPlayed ?? 0,
  };
}

function normalizeSelfLeaderboard(self: SelfLeaderboard | { rank: number; entry: DailyLeaderboardEntry } | null | undefined): SelfLeaderboard {
  if (!self?.entry) return null;
  return { rank: self.rank, entry: normalizeLeaderboardEntry(self.entry) };
}

function avatarFallback(name: string, index: number) {
  const colors = ["#0EA5E9", "#8B5CF6", "#22C55E", "#F97316", "#EC4899", "#EAB308"];
  return colors[index % colors.length];
}

function initialsFromName(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function getEntryValue(entry: LeaderboardEntry, mode: ScoreMode) {
  return mode === "daily" ? entry.score ?? 0 : entry.bits ?? 0;
}

function ValueBadge({ mode }: { mode: ScoreMode }) {
  const sizeClass = mode === "bits" ? "h-6 w-6" : "h-4 w-4";
  return <img src={bitIconUrl} alt="" className={`${sizeClass} object-contain`} draggable={false} />;
}

function RankDisplay({ rank }: { rank: number }) {
  const topRankImage = rank === 1 ? goldRankingUrl : rank === 2 ? silverRankingUrl : rank === 3 ? bronzeRankingUrl : null;

  if (topRankImage) {
    return (
      <div className="relative flex h-[25px] items-center justify-center overflow-visible">
        <img src={topRankImage} alt={`Rang ${rank}`} className="pointer-events-none absolute h-[32px] w-[106px] max-w-none object-contain" draggable={false} />
      </div>
    );
  }
  return <div className="text-center font-inter text-[13px] font-black leading-none text-slate-200">{rank}</div>;
}

function rankRowBackground(rank: number, highlighted = false) {
  if (rank === 1) return "linear-gradient(90deg, rgba(255,216,50,0.18) 0%, rgba(255,216,50,0.08) 32%, rgba(255,216,50,0) 100%)";
  if (rank === 2) return "linear-gradient(90deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.07) 32%, rgba(255,255,255,0) 100%)";
  if (rank === 3) return "linear-gradient(90deg, rgba(243,154,69,0.18) 0%, rgba(243,154,69,0.08) 32%, rgba(243,154,69,0) 100%)";
  if (highlighted) return "linear-gradient(90deg, rgba(110,75,255,0.22) 0%, rgba(110,75,255,0.11) 32%, rgba(110,75,255,0) 100%)";
  return undefined;
}

function rankAccentColor(rank: number, highlighted = false) {
  if (rank === 1) return "#FFD832";
  if (rank === 2) return "#D6DEEA";
  if (rank === 3) return "#F39A45";
  if (highlighted) return "#8B5CF6";
  return undefined;
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

function getVisiblePageButtons(currentPage: number, totalPages: number) {
  const pages = new Set([1, totalPages, currentPage]);
  if (currentPage > 1) pages.add(currentPage - 1);
  if (currentPage < totalPages) pages.add(currentPage + 1);

  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  return sortedPages.flatMap((page, index) => {
    const previous = sortedPages[index - 1];
    if (previous && page - previous > 1) return [`ellipsis-${previous}-${page}`, page] as const;
    return [page] as const;
  });
}

function PlayerCell({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {entry.img ? (
        <img src={entry.img} alt={entry.name} className="h-8 w-8 rounded-full object-cover" loading="lazy" draggable={false} />
      ) : (
        <div className="grid h-8 w-8 place-items-center rounded-full font-inter text-[10px] font-bold text-white" style={{ background: avatarFallback(entry.name, rank - 1) }}>{initialsFromName(entry.name)}</div>
      )}
      <span className="notranslate block truncate font-inter text-[13px] font-extrabold text-slate-100" spellCheck={false} translate="no" lang="zxx">{entry.name}</span>
    </div>
  );
}

function LeaderboardRow({ entry, rank, mode, highlighted = false, onClick }: { entry: LeaderboardEntry; rank: number; mode: ScoreMode; highlighted?: boolean; onClick?: (entry: LeaderboardEntry) => void }) {
  const rowBackground = rankRowBackground(rank, highlighted);
  const accentColor = rankAccentColor(rank, highlighted);
  const isClickable = Boolean(onClick);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onClick(entry);
  }
  return (
    <div
      role={isClickable ? "link" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `Voir le profil de ${entry.name}` : undefined}
      onClick={onClick ? () => onClick(entry) : undefined}
      onKeyDown={handleKeyDown}
      className={[
        "grid grid-cols-[88px_minmax(150px,1fr)_170px_110px] items-center border-t border-white/[0.07] pl-0 pr-5 py-2 transition",
        isClickable ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6E4BFF] focus-visible:ring-inset" : "",
        rowBackground ? "" : "bg-transparent hover:bg-white/[0.035]",
      ].filter(Boolean).join(" ")}
      style={{
        ...(rowBackground ? { background: rowBackground } : {}),
        ...(accentColor ? { boxShadow: `inset 3px 0 0 ${accentColor}` } : {}),
      }}
    >
      <RankDisplay rank={rank} />
      <PlayerCell entry={entry} rank={rank} />
      <div className="flex items-center justify-end gap-1.5 font-inter tabular-nums text-[13px] font-extrabold text-slate-100">
        {formatValue(getEntryValue(entry, mode))}
        <ValueBadge mode={mode} />
      </div>
      <div className="text-right font-inter tabular-nums text-[13px] font-extrabold text-slate-100">{formatValue(entry.gamesPlayed ?? 0)}</div>
    </div>
  );
}

export default function RankingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [kind, setKind] = useState<RankingKind>(() => searchParams.get("kind") === "daily" ? "daily" : "general");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [self, setSelf] = useState<SelfLeaderboard>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [startIndex, setStartIndex] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [profileImages, setProfileImages] = useState<Record<string, string | null>>({});

  const scoreMode: ScoreMode = kind === "daily" ? "daily" : "bits";
  const monthOptions = useMemo(() => getMonthOptions(), []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadLeaderboard() {
      setLoading(true);
      setError(null);
      try {
        const url = kind === "daily"
          ? dailyLeaderboardUrl(selectedMonth)
          : `${API_BASE}/leaderboard/bits?all=true`;
        const res = await fetch(url, { credentials: "include", signal: controller.signal });
        const data = (await res.json().catch(() => ({}))) as { leaderboard?: LeaderboardEntry[] | DailyLeaderboardEntry[]; self?: SelfLeaderboard; error?: string };
        if (!res.ok) throw new Error(data.error || "Impossible de charger le classement.");
        const rows = (data.leaderboard ?? []).map((row, index) => ({
          ...normalizeLeaderboardEntry(row),
          rank: index + 1,
        }));
        setEntries(rows);
        setSelf(normalizeSelfLeaderboard(data.self));
        setProfileImages({});
        setLastUpdated(new Date());
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setEntries([]);
        setSelf(null);
        setError((err as Error).message || "Impossible de charger le classement.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadLeaderboard();
    return () => controller.abort();
  }, [kind, selectedMonth]);

  useEffect(() => setStartIndex(0), [kind, selectedMonth]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => entry.name.toLowerCase().includes(q));
  }, [entries, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const clampedStartIndex = Math.min(startIndex, Math.max(0, filteredEntries.length - PAGE_SIZE));
  const currentPage = Math.min(totalPages, Math.floor(clampedStartIndex / PAGE_SIZE) + 1);
  const pageEntries = filteredEntries.slice(clampedStartIndex, clampedStartIndex + PAGE_SIZE);
  const displayedEntries = useMemo(() => pageEntries.map((entry) => ({
    ...entry,
    img: profileImages[entry.id] ?? entry.img ?? null,
  })), [pageEntries, profileImages]);
  const displayedSelf = useMemo(() => self ? {
    ...self,
    entry: {
      ...self.entry,
      img: profileImages[self.entry.id] ?? self.entry.img ?? null,
    },
  } : null, [profileImages, self]);
  const lastUpdatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const selfValue = displayedSelf ? getEntryValue(displayedSelf.entry, scoreMode) : 0;
  const visiblePageButtons = getVisiblePageButtons(currentPage, totalPages);

  useEffect(() => {

    const ids = Array.from(new Set([...pageEntries.map((entry) => entry.id), ...(self?.entry.id ? [self.entry.id] : [])]))
      .filter((id) => !(id in profileImages));
    if (ids.length === 0) return;

    const controller = new AbortController();
    async function loadVisibleProfileImages() {
      const url = `${API_BASE}/leaderboard/profile-images?ids=${encodeURIComponent(ids.join(","))}`;
      const res = await fetch(url, { credentials: "include", signal: controller.signal });
      const data = (await res.json().catch(() => ({}))) as { images?: Record<string, string | null> };
      if (!res.ok) return;
      setProfileImages((current) => ({ ...current, ...(data.images ?? {}) }));
    }

    void loadVisibleProfileImages();
    return () => controller.abort();
  }, [pageEntries, profileImages, self?.entry.id]);

  function goToPage(page: number) {
    const safePage = Math.min(totalPages, Math.max(1, page));
    setStartIndex((safePage - 1) * PAGE_SIZE);
  }

  useEffect(() => {
    function handleRankingPaginationShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      const nextPage = event.key === "ArrowRight" ? currentPage + 1 : currentPage - 1;
      if (nextPage < 1 || nextPage > totalPages) return;

      event.preventDefault();
      setStartIndex((nextPage - 1) * PAGE_SIZE);
    }

    window.addEventListener("keydown", handleRankingPaginationShortcut);
    return () => window.removeEventListener("keydown", handleRankingPaginationShortcut);
  }, [currentPage, totalPages]);

  function showPlayerProfile(entry: LeaderboardEntry) {
    navigate(`/players/${entry.id}/profile`);
  }

  function showSelfRanking() {
    if (!self) return;
    const index = entries.findIndex((entry) => entry.id === self.entry.id);
    if (index < 0) return;

    const pageStart = Math.floor(index / PAGE_SIZE) * PAGE_SIZE;
    const maxStartIndex = Math.max(0, entries.length - PAGE_SIZE);

    setSearch("");
    setStartIndex(Math.min(maxStartIndex, pageStart));
  }

  return (
    <div className="relative min-h-full overflow-hidden font-inter text-slate-50" spellCheck={false}>
      <Background />
      <div className="relative z-10 mx-auto flex max-w-[1370px] flex-col px-4 py-8 sm:px-8 lg:px-10">
        <section className="grid w-full gap-8 lg:grid-cols-[245px_minmax(0,1fr)] lg:items-start">
          <aside className="flex flex-col gap-5 lg:sticky lg:top-8">
            <div className="rounded-xl border border-white/[0.06] bg-[#131829] p-4 shadow-[0_22px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl">
              <h2 className="font-brandUpright text-[21px] uppercase leading-none text-slate-200">Filtres</h2>
              <div className="mt-4 flex flex-col gap-2">
                {FILTERS.map((option) => {
                  const Icon = option.icon;
                  return <button key={option.value} type="button" onClick={() => setKind(option.value)} className={["flex items-center gap-3 rounded-[5px] px-3 py-2.5 text-left font-inter text-[12px] font-extrabold transition", kind === option.value ? "bg-[#5F55C8] text-white" : "bg-white/[0.045] text-slate-300 hover:bg-white/10 hover:text-white"].join(" ")}><Icon className="h-4 w-4" aria-hidden="true" />{option.label}</button>;
                })}
              </div>
              {kind === "daily" && <div className="mt-6"><label className="font-acuminSemiBold text-[11px] font-semibold uppercase text-slate-400">Période</label><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="mt-2 h-9 w-full rounded-[5px] border border-white/[0.06] bg-[#131829] px-3 font-inter text-[12px] font-bold text-slate-200 outline-none">{monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>}
            </div>

            {displayedSelf && (
              <div className="rounded-xl border border-white/[0.06] bg-[#131829] p-4 shadow-[0_22px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                <h2 className="font-brandUpright text-[21px] uppercase leading-none text-slate-200">Votre classement</h2>

                <div className="mt-8 text-center">
                  <div className="font-brandUpright text-[44px] leading-none text-white">#{formatValue(displayedSelf.rank)}</div>
                  <div className="text-[12px] font-inter text-slate-400">Sur {formatValue(entries.length)} joueurs</div>
                </div>

                <div
                  aria-label={`${formatValue(selfValue)} bits`}
                  className="relative mx-auto mt-4 flex h-[45px] w-[170px] -translate-x-1 items-center justify-start font-inter font-semibold text-white"
                >
                  <span className="absolute left-7 right-0 h-[26px] rounded-full bg-[#10131E]" aria-hidden="true" />
                  <img
                    src={bitIconUrl}
                    alt=""
                    aria-hidden="true"
                    className="relative z-[1] h-[55px] w-[55px] shrink-0 object-contain drop-shadow-[0_3px_7px_rgba(0,0,0,0.5)]"
                    draggable={false}
                  />
                  <span className="relative z-[1] inline-flex min-w-[115px] items-center justify-center font-inter text-[13px] font-bold leading-none tabular-nums">
                    {formatValue(selfValue)}
                  </span>
                </div>

                <button type="button" onClick={showSelfRanking} className="mt-5 flex h-12 w-full items-center justify-center gap-4 rounded-[8px] bg-white/[0.055] font-inter text-[12px] font-extrabold text-white transition hover:bg-white/10 hover:text-white">
                  Voir mon classement
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </aside>

          <main className="min-w-0">
            <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div><h1 className="font-brandUpright text-[38px] uppercase leading-none tracking-[0.01em] text-white sm:text-[46px]">Classement</h1></div>
              <div className="relative w-full max-w-[330px]"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => { setSearch(event.target.value); setStartIndex(0); }} placeholder="Rechercher un joueur..." spellCheck={false} autoCorrect="off" autoCapitalize="off" autoComplete="off" className="h-9 w-full rounded-[5px] border border-white/[0.06] bg-[#131829] pl-10 pr-4 font-inter text-[12px] font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#6E4BFF]" /></div>
            </div>

            <div className="overflow-hidden rounded-[7px] border border-white/[0.06] bg-[#131829] shadow-[0_22px_80px_rgba(0,0,0,0.34)]">
              <div className="grid min-w-[650px] grid-cols-[88px_minmax(150px,1fr)_170px_110px] pl-0 pr-5 py-3 font-acuminSemiBold text-[11px] font-semibold uppercase leading-none tracking-[0.04em] text-slate-400"><div className="text-center">Rang</div><div>Joueur</div><div className="text-right">{kind === "general" ? "Bits" : "Points"}</div><div className="text-right">Parties</div></div>
              <div className="min-w-[650px] font-inter">
                {loading && <div className="border-t border-white/[0.07] px-5 py-4 font-inter text-sm font-semibold text-slate-300">Chargement du classement…</div>}
                {error && !loading && <div className="border-t border-white/[0.07] px-5 py-4 font-inter text-sm font-semibold text-rose-200">{error}</div>}
                {!loading && !error && displayedEntries.length === 0 && <div className="border-t border-white/[0.07] px-5 py-3 font-inter text-[12px] font-medium text-slate-400">Aucune donnée disponible pour ce classement.</div>}
                {!loading && !error && displayedEntries.map((entry, index) => { const absoluteRank = entry.rank ?? clampedStartIndex + index + 1; return <LeaderboardRow key={`${entry.id}-${kind}-${absoluteRank}`} entry={entry} rank={absoluteRank} mode={scoreMode} highlighted={displayedSelf?.entry.id === entry.id} onClick={showPlayerProfile} />; })}
              </div>
              <div className="flex min-w-[650px] items-center justify-between border-t border-white/[0.07] px-5 py-3 font-inter text-[12px] font-semibold text-slate-400"><div className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />Mis à jour à {lastUpdatedLabel}</div><div className="flex items-center gap-2"><button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="grid h-8 w-8 place-items-center rounded-[5px] bg-white/[0.055] text-white disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>{visiblePageButtons.map((page) => typeof page === "number" ? <button key={page} type="button" onClick={() => goToPage(page)} className={["h-8 min-w-8 rounded-[5px] px-2 font-inter font-black", currentPage === page ? "bg-[#6E4BFF] text-white" : "bg-white/[0.045] text-slate-300"].join(" ")}>{page}</button> : <span key={page} className="px-1">…</span>)}<button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="grid h-8 w-8 place-items-center rounded-[5px] bg-white/[0.055] text-white disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}