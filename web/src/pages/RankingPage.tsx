import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Search, Star } from "lucide-react";
import bitIconUrl from "@/assets/bit.png";
import laurelLeftGoldUrl from "@/assets/laurel_left_gold.png";
import Background from "../components/Background";

const API_BASE = import.meta.env.VITE_API_BASE ?? (typeof window !== "undefined" ? window.location.origin : "");

type RankingKind = "general" | "daily";
type PeriodMode = "week" | "month" | "today";
type ScoreMode = "experience" | "daily";

type LeaderboardEntry = {
  id: string;
  name: string;
  img?: string | null;
  experience?: number;
  score?: number;
  gamesPlayed?: number;
};

type SelfLeaderboard = { rank: number; entry: LeaderboardEntry } | null;

type DailyLeaderboardEntry = { playerId: string; playerName: string; score: number; img?: string | null };

const PAGE_SIZE = 10;
const LEADERBOARD_FETCH_LIMIT = 100;
const CENTERED_ROW_OFFSET = Math.floor(PAGE_SIZE / 2);

const FILTERS: Array<{ value: RankingKind; label: string; icon: typeof Star }> = [
  { value: "general", label: "Classement général", icon: Star },
  { value: "daily", label: "Défi du jour", icon: CalendarDays },
];

const PERIODS: Array<{ value: PeriodMode; label: string }> = [
  { value: "week", label: "Semaine" },
  { value: "month", label: "Mois" },
  { value: "today", label: "Aujourd'hui" },
];

function formatValue(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function dailyLeaderboardUrl(period: PeriodMode) {
  if (period === "today") return `${API_BASE}/daily/leaderboard/daily/${todayIso()}`;
  return `${API_BASE}/daily/leaderboard/monthly?month=${currentMonth()}`;
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
    gamesPlayed: 0,
  };
}

function avatarFallback(name: string, index: number) {
  const colors = ["#0EA5E9", "#8B5CF6", "#22C55E", "#F97316", "#EC4899", "#EAB308"];
  return colors[index % colors.length];
}

function initialsFromName(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function getEntryValue(entry: LeaderboardEntry, mode: ScoreMode) {
  return mode === "daily" ? entry.score ?? 0 : entry.experience ?? 0;
}

function ValueBadge() {
  return <img src={bitIconUrl} alt="" className="h-4 w-4 object-contain" draggable={false} />;
}

function RankDisplay({ rank }: { rank: number }) {
  if (rank <= 3) {
    const rankClass = rank === 1 ? "text-[#FFD832]" : rank === 2 ? "text-[#D6DEEA]" : "text-[#F39A45]";
    const laurelFilter = rank === 1 ? "" : rank === 2 ? "grayscale(1) brightness(1.75) opacity(0.78)" : "sepia(1) saturate(1.8) hue-rotate(340deg) brightness(0.95) opacity(0.78)";
    return (
      <div className="flex items-center justify-center gap-0.5 font-inter font-black leading-none">
        <img src={laurelLeftGoldUrl} alt="" className="h-[23px] w-4 object-contain" style={{ filter: laurelFilter }} draggable={false} />
        <span className={`${rankClass} w-5 text-center font-brandUpright text-[25px]`}>{rank}</span>
        <img src={laurelLeftGoldUrl} alt="" className="h-[23px] w-4 scale-x-[-1] object-contain" style={{ filter: laurelFilter }} draggable={false} />
      </div>
    );
  }
  return <div className="text-center font-inter text-[13px] font-black leading-none text-slate-200">{rank}</div>;
}

function rankRowBackground(rank: number) {
  if (rank === 1) return "linear-gradient(90deg, rgba(255,216,50,0.18) 0%, rgba(255,216,50,0.08) 32%, rgba(255,216,50,0) 100%)";
  if (rank === 2) return "linear-gradient(90deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.07) 32%, rgba(255,255,255,0) 100%)";
  if (rank === 3) return "linear-gradient(90deg, rgba(243,154,69,0.18) 0%, rgba(243,154,69,0.08) 32%, rgba(243,154,69,0) 100%)";
  return undefined;
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

function LeaderboardRow({ entry, rank, mode, highlighted = false }: { entry: LeaderboardEntry; rank: number; mode: ScoreMode; highlighted?: boolean }) {
  const podiumBackground = highlighted ? undefined : rankRowBackground(rank);
  return (
    <div
      className={[
        "grid grid-cols-[88px_minmax(150px,1fr)_170px_110px] items-center border-t border-white/[0.07] pl-0 pr-5 py-2 transition",
        highlighted ? "bg-[#6E4BFF]/20 shadow-[inset_3px_0_0_#8B5CF6]" : podiumBackground ? "" : "bg-transparent hover:bg-white/[0.035]",
      ].join(" ")}
      style={podiumBackground ? { background: podiumBackground } : undefined}
    >
      <RankDisplay rank={rank} />
      <PlayerCell entry={entry} rank={rank} />
      <div className="flex items-center justify-end gap-1.5 font-inter tabular-nums text-[13px] font-extrabold text-slate-100">
        {formatValue(getEntryValue(entry, mode))}
        <ValueBadge />
      </div>
      <div className="text-right font-inter tabular-nums text-[13px] font-extrabold text-slate-100">{formatValue(entry.gamesPlayed ?? 0)}</div>
    </div>
  );
}

export default function RankingPage() {
  const [kind, setKind] = useState<RankingKind>("general");
  const [period, setPeriod] = useState<PeriodMode>("week");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [self, setSelf] = useState<SelfLeaderboard>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [startIndex, setStartIndex] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const scoreMode: ScoreMode = kind === "daily" ? "daily" : "experience";

  useEffect(() => {
    const controller = new AbortController();
    async function loadLeaderboard() {
      setLoading(true);
      setError(null);
      try {
        const url = kind === "daily"
          ? dailyLeaderboardUrl(period)
          : `${API_BASE}/leaderboard/experience?limit=${LEADERBOARD_FETCH_LIMIT}`;
        const res = await fetch(url, { credentials: "include", signal: controller.signal });
        const data = (await res.json().catch(() => ({}))) as { leaderboard?: LeaderboardEntry[] | DailyLeaderboardEntry[]; self?: SelfLeaderboard; error?: string };
        if (!res.ok) throw new Error(data.error || "Impossible de charger le classement.");
        const rows = (data.leaderboard ?? []).map(normalizeLeaderboardEntry);
        setEntries(rows);
        setSelf(kind === "general" && data.self?.entry ? data.self : null);
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
  }, [kind, period]);

  useEffect(() => setStartIndex(0), [kind, period]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => entry.name.toLowerCase().includes(q));
  }, [entries, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const currentPage = Math.min(totalPages, Math.floor(startIndex / PAGE_SIZE) + 1);
  const clampedStartIndex = Math.min(startIndex, Math.max(0, filteredEntries.length - PAGE_SIZE));
  const pageEntries = filteredEntries.slice(clampedStartIndex, clampedStartIndex + PAGE_SIZE);
  const lastUpdatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const selfValue = self ? getEntryValue(self.entry, scoreMode) : 0;

  function showSelfRanking() {
    if (!self) return;
    const index = entries.findIndex((entry) => entry.id === self.entry.id);
    if (index < 0) return;

    const centeredStart = Math.max(0, index - CENTERED_ROW_OFFSET);
    const maxStartIndex = Math.max(0, entries.length - PAGE_SIZE);

    setSearch("");
    setStartIndex(Math.min(maxStartIndex, centeredStart));
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
              {kind === "daily" && <div className="mt-6"><label className="font-acuminSemiBold text-[11px] font-semibold uppercase text-slate-400">Période</label><select value={period} onChange={(event) => setPeriod(event.target.value as PeriodMode)} className="mt-2 h-9 w-full rounded-[5px] border border-white/[0.06] bg-[#131829] px-3 font-inter text-[12px] font-bold text-slate-200 outline-none">{PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>}
            </div>

            {self && (
              <div className="rounded-xl border border-white/[0.06] bg-[#131829] p-4 shadow-[0_22px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                <h2 className="font-brandUpright text-[21px] uppercase leading-none text-slate-200">Votre classement</h2>

                <div className="mt-8 text-center">
                  <div className="font-brandUpright text-[44px] leading-none text-white">#{formatValue(self.rank)}</div>
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
              <div className="grid min-w-[650px] grid-cols-[88px_minmax(150px,1fr)_170px_110px] pl-0 pr-5 py-3 font-acuminSemiBold text-[11px] font-semibold uppercase leading-none tracking-[0.04em] text-slate-400"><div className="text-center">Rang</div><div>Joueur</div><div className="text-right">Points</div><div className="text-right">Parties</div></div>
              <div className="min-w-[650px] font-inter">
                {loading && <div className="border-t border-white/[0.07] px-5 py-4 font-inter text-sm font-semibold text-slate-300">Chargement du classement…</div>}
                {error && !loading && <div className="border-t border-white/[0.07] px-5 py-4 font-inter text-sm font-semibold text-rose-200">{error}</div>}
                {!loading && !error && pageEntries.length === 0 && <div className="border-t border-white/[0.07] px-5 py-4 font-inter text-sm font-semibold text-slate-300">Aucun joueur disponible pour ce classement.</div>}
                {!loading && !error && pageEntries.map((entry, index) => { const absoluteRank = clampedStartIndex + index + 1; return <LeaderboardRow key={`${entry.id}-${kind}-${absoluteRank}`} entry={entry} rank={absoluteRank} mode={scoreMode} highlighted={self?.entry.id === entry.id} />; })}
              </div>
              <div className="flex min-w-[650px] items-center justify-between border-t border-white/[0.07] px-5 py-3 font-inter text-[12px] font-semibold text-slate-400"><div className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />Mis à jour à {lastUpdatedLabel}</div><div className="flex items-center gap-2"><button type="button" onClick={() => setStartIndex((index) => Math.max(0, index - PAGE_SIZE))} disabled={clampedStartIndex === 0} className="grid h-8 w-8 place-items-center rounded-[5px] bg-white/[0.055] text-white disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>{Array.from({ length: Math.min(3, totalPages) }, (_, i) => i + 1).map((p) => <button key={p} type="button" onClick={() => setStartIndex((p - 1) * PAGE_SIZE)} className={["h-8 min-w-8 rounded-[5px] px-2 font-inter font-black", currentPage === p ? "bg-[#6E4BFF] text-white" : "bg-white/[0.045] text-slate-300"].join(" ")}>{p}</button>)}{totalPages > 4 && <span className="px-1">…</span>}{totalPages > 3 && <button type="button" onClick={() => setStartIndex((totalPages - 1) * PAGE_SIZE)} className={["h-8 min-w-8 rounded-[5px] px-2 font-inter font-black", currentPage === totalPages ? "bg-[#6E4BFF] text-white" : "bg-white/[0.045] text-slate-300"].join(" ")}>{totalPages}</button>}<button type="button" onClick={() => setStartIndex((index) => Math.min(Math.max(0, filteredEntries.length - PAGE_SIZE), index + PAGE_SIZE))} disabled={clampedStartIndex + PAGE_SIZE >= filteredEntries.length} className="grid h-8 w-8 place-items-center rounded-[5px] bg-white/[0.055] text-white disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}