import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Search, Star, TrendingUp } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getLevelFromExperience } from "@/utils/experience";

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

type DailyLeaderboardEntry = { playerId: string; playerName: string; score: number; gamesPlayed?: number; img?: string | null; experience?: number };

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
    experience: row.experience ?? 0,
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

function getScoreUnit(mode: ScoreMode) {
  return mode === "daily" ? "pts" : "bits";
}

function RankDisplay({ rank, highlighted = false }: { rank: number; highlighted?: boolean }) {
  const color = highlighted && rank > 3 ? "#8B5CF6" : rank === 1 ? "#FFD832" : rank === 2 ? "#9DB9FF" : rank === 3 ? "#FF865E" : "#505985";
  return <div className="mx-auto grid h-7 w-7 place-items-center" style={{ backgroundColor: color, clipPath: "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}><span className="font-brutal text-[13px] leading-none text-[#11131F]">{rank}</span></div>;
}

function rankRowBackground(rank: number, highlighted = false) {
  if (rank === 1) return "linear-gradient(90deg, rgba(255,216,50,0.18) 0%, rgba(255,216,50,0.08) 35%, #191c2c 100%)";
  if (rank === 2) return "linear-gradient(90deg, rgba(214,222,234,0.16) 0%, rgba(214,222,234,0.08) 35%, #191c2c 100%)";
  if (rank === 3) return "linear-gradient(90deg, rgba(243,154,69,0.18) 0%, rgba(243,154,69,0.08) 35%, #191c2c 100%)";
  if (highlighted) return "linear-gradient(90deg, rgba(139,92,246,0.22) 0%, rgba(139,92,246,0.1) 35%, #191c2c 100%)";
  return "#191c2c";
}

function rankAccentColor(rank: number, highlighted = false) {
  if (rank === 1) return "#FFD832";
  if (rank === 2) return "#D6DEEA";
  if (rank === 3) return "#F39A45";
  if (highlighted) return "#8B5CF6";
  return undefined;
}

function selfCardAccent(rank: number) {
  if (rank === 1) return { accent: "#FFD33F", score: "#FFD33F" };
  if (rank === 2) return { accent: "#91AFFF", score: "#AFC5FF" };
  if (rank === 3) return { accent: "#FF865E", score: "#FF865E" };
  return { accent: "#8B5CF6", score: "#A78BFA" };
}

function SelfPlayerCard({ self, totalPlayers, mode }: { self: NonNullable<SelfLeaderboard>; totalPlayers: number; mode: ScoreMode }) {
  const { rank, entry } = self;
  const colors = selfCardAccent(rank);
  const points = getEntryValue(entry, mode);
  const scoreUnit = getScoreUnit(mode);
  const percentile = totalPlayers > 0 ? Math.max(1, Math.ceil((rank / totalPlayers) * 100)) : null;

  return (
    <article
      className="relative w-[230px] rounded-[9px] p-px text-center shadow-[0_18px_46px_rgba(0,0,0,0.32)]"
      style={{ background: `linear-gradient(180deg, ${colors.accent} 0%, #11131F 42%)` }}
      aria-label={`${entry.name}, ${rank}${rank === 1 ? "er" : "e"} au classement`}
    >
      <div
        className="absolute -top-3.5 left-1/2 z-20 grid h-8 w-8 -translate-x-1/2 place-items-center"
        style={{ backgroundColor: colors.accent, clipPath: "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}
      >
        <span className="font-brutal text-[16px] leading-none text-[#11131F]">{rank}</span>
      </div>
      <span className="pointer-events-none absolute inset-px translate-y-1 rounded-[8px]" style={{ backgroundColor: colors.accent }} aria-hidden="true" />

      <div className="relative flex min-h-[280px] flex-col items-center rounded-[8px] bg-[linear-gradient(180deg,#24273C_0%,#151723_100%)] px-3 pb-3.5 pt-8">
        <div className="grid h-[58px] w-[58px] place-items-center rounded-full" style={{ boxShadow: `0 0 0 2px ${colors.accent}` }}>
          {entry.img ? (
            <span className="block h-full w-full rounded-full bg-[#D8DCE3] bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url("${entry.img}")` }} aria-hidden="true" />
          ) : (
            <div className="grid h-full w-full place-items-center rounded-full font-inter text-xl font-black text-white" style={{ background: avatarFallback(entry.name, rank - 1) }}>
              {initialsFromName(entry.name)}
            </div>
          )}
        </div>

        <h2 className="notranslate mt-2 max-w-full truncate font-inter text-[15px] font-semibold leading-tight text-white" translate="no" lang="zxx">{entry.name}</h2>
        <div className="mt-3.5 leading-none" style={{ fontFamily: '"Acumin Pro Extra Condensed Bold Italic", "Acumin Pro Extra Condensed", sans-serif', fontStyle: "italic", color: colors.score }}>
          <span className="text-[32px]">{formatValue(points)}</span><span className="ml-1 text-[17px]">{scoreUnit}</span>
        </div>

        <div className="mt-4 grid w-[88%] grid-cols-2 gap-1.5">
          <div className="rounded-[6px] border border-white/[0.09] bg-[#11131f]/25 px-1.5 py-1.5">
            <div className="font-acuminSemiBold text-[9px] uppercase text-slate-400">Bits</div>
            <div className="mt-1 flex items-center justify-center gap-1 font-inter text-[11px] font-extrabold tabular-nums text-white">
              {entry.bits === undefined ? "—" : formatValue(entry.bits)}
            </div>
          </div>
          <div className="rounded-[6px] border border-white/[0.09] bg-[#11131f]/25 px-1.5 py-1.5">
            <div className="font-acuminSemiBold text-[9px] uppercase text-slate-400">Parties</div>
            <div className="mt-1 font-inter text-[11px] font-extrabold tabular-nums text-white">{formatValue(entry.gamesPlayed ?? 0)}</div>
          </div>
        </div>

        {percentile !== null && <div className="mt-auto flex items-center gap-1.5 pt-3 font-inter text-[10px] font-extrabold" style={{ color: colors.score }}><TrendingUp className="h-4 w-4" aria-hidden="true" />Top {percentile}%</div>}
      </div>
    </article>
  );
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

function LeaderboardRow({ entry, rank, mode, highlighted = false, onClick }: { entry: LeaderboardEntry; rank: number; mode: ScoreMode; highlighted?: boolean; onClick?: (entry: LeaderboardEntry) => void }) {
  const rowBackground = rankRowBackground(rank, highlighted);
  const accentColor = rankAccentColor(rank, highlighted) ?? "#505985";
  const scoreColor = rankAccentColor(rank, highlighted) ?? "#8F96C8";
  const scoreUnit = getScoreUnit(mode);
  const isClickable = Boolean(onClick);
  const level = getLevelFromExperience(entry.experience ?? 0);

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
        "grid min-h-[52px] grid-cols-[86px_48px_minmax(120px,1fr)_88px] items-center overflow-hidden rounded-[5px] border border-white/[0.055] pr-3 transition",
        isClickable ? "cursor-pointer hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6E4BFF]" : "",
      ].filter(Boolean).join(" ")}
      style={{
        background: rowBackground,
        boxShadow: `inset 4px 0 0 ${accentColor}`,
      }}
    >
      <RankDisplay rank={rank} highlighted={highlighted} />
      <div className="grid h-11 w-11 place-items-center rounded-full" style={{ boxShadow: `0 0 0 1px ${accentColor}` }}>
        {entry.img ? <span className="block h-full w-full rounded-full bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url("${entry.img}")` }} aria-hidden="true" /> : <div className="grid h-full w-full place-items-center rounded-full font-inter text-xs font-black text-white" style={{ background: avatarFallback(entry.name, rank - 1) }}>{initialsFromName(entry.name)}</div>}
      </div>
      <div className="min-w-0 pl-2">
        <div className="notranslate truncate font-inter text-[14px] font-extrabold leading-tight text-white" translate="no" lang="zxx">{entry.name}</div>
        <div className="mt-0.5 font-inter text-[10px] font-semibold leading-none text-slate-300">Niveau {level}</div>
      </div>
      <div className="text-right leading-none" style={{ fontFamily: '"Acumin Pro Extra Condensed Bold Italic", "Acumin Pro Extra Condensed", sans-serif', fontStyle: "italic", color: scoreColor }}><span className="text-[25px]">{formatValue(getEntryValue(entry, mode))}</span><span className="ml-1 text-[14px]">{scoreUnit}</span></div>
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

  return (
    <div className="relative min-h-full overflow-hidden font-inter text-slate-50" spellCheck={false}>
      <div aria-hidden className="fixed inset-0 bg-[#11131f]" />
      <div className="relative z-10 mx-auto flex max-w-[1370px] flex-col px-4 pb-8 pt-16 sm:px-8 lg:px-10 lg:pt-20">
        <section className="grid w-full justify-center gap-10 lg:grid-cols-[minmax(500px,780px)_245px] lg:items-start lg:gap-12">

          <main className="min-w-0">
            <div className="w-full max-w-[780px] overflow-x-auto rounded-[7px] bg-transparent p-0 shadow-[0_22px_80px_rgba(0,0,0,0.22)]">
              <div className="min-w-[500px] space-y-1 font-inter">
                {loading && <div className="px-5 py-4 font-inter text-sm font-semibold text-slate-300">Chargement du classement…</div>}
                {error && !loading && <div className="px-5 py-4 font-inter text-sm font-semibold text-rose-200">{error}</div>}
                {!loading && !error && displayedEntries.length === 0 && <div className="px-5 py-3 font-inter text-[12px] font-medium text-slate-400">Aucune donnée disponible pour ce classement.</div>}
                {!loading && !error && displayedEntries.map((entry, index) => { const absoluteRank = entry.rank ?? clampedStartIndex + index + 1; return <LeaderboardRow key={`${entry.id}-${kind}-${absoluteRank}`} entry={entry} rank={absoluteRank} mode={scoreMode} highlighted={displayedSelf?.entry.id === entry.id} onClick={showPlayerProfile} />; })}
              </div>
              <div className="mt-2 flex min-w-[500px] items-center justify-between px-1 pb-1 pt-3 font-inter text-[12px] font-semibold text-slate-400"><div className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />Mis à jour à {lastUpdatedLabel}</div><div className="flex items-center gap-2"><button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="grid h-8 w-8 place-items-center rounded-[5px] bg-white/[0.055] text-white disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>{visiblePageButtons.map((page) => typeof page === "number" ? <button key={page} type="button" onClick={() => goToPage(page)} className={["h-8 min-w-8 rounded-[5px] px-2 font-inter font-black", currentPage === page ? "bg-[#6E4BFF] text-white" : "bg-white/[0.045] text-slate-300"].join(" ")}>{page}</button> : <span key={page} className="px-1">…</span>)}<button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="grid h-8 w-8 place-items-center rounded-[5px] bg-white/[0.055] text-white disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>
            </div>
          </main>
          <aside className="relative flex min-h-[560px] flex-col lg:sticky lg:top-20">
            <div className="flex flex-col gap-2">
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as RankingKind)}
                className="h-10 w-full rounded-[5px] border border-white/[0.06] bg-[#191c2c] px-3 font-inter text-[12px] font-bold text-slate-200 outline-none"
                aria-label="Type de classement"
              >
                {FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {kind === "daily" && (
                <select
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  className="h-10 w-full rounded-[5px] border border-white/[0.06] bg-[#191c2c] px-3 font-inter text-[12px] font-bold text-slate-200 outline-none"
                  aria-label="Mois du défi du jour"
                >
                  {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              )}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={search} onChange={(event) => { setSearch(event.target.value); setStartIndex(0); }} placeholder="Rechercher un joueur..." spellCheck={false} autoCorrect="off" autoCapitalize="off" autoComplete="off" className="h-10 w-full rounded-[5px] border border-white/[0.06] bg-[#191c2c] pl-10 pr-3 font-inter text-[12px] font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#6E4BFF]" />
              </div>
            </div>

            <div className="mt-20 flex justify-center lg:absolute lg:left-0 lg:right-0 lg:top-64 lg:mt-0">
              {displayedSelf && <SelfPlayerCard self={displayedSelf} totalPlayers={entries.length} mode={scoreMode} />}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}