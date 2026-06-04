import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  HelpCircle,
  Search,
} from "lucide-react";
import bitIconUrl from "@/assets/bit.png";
import laurelLeftGoldUrl from "@/assets/laurel_left_gold.png";

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");

type RankingMode = "experience" | "bits";

type LeaderboardEntry = {
  id: string;
  name: string;
  img?: string | null;
  bits?: number;
  experience?: number;
  gamesPlayed?: number;
};

const MODE_OPTIONS: Array<{ value: RankingMode; label: string }> = [
  { value: "experience", label: "Expérience" },
  { value: "bits", label: "Bits" },
];

const PAGE_SIZE = 10;

function formatValue(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function avatarFallback(name: string, index: number) {
  const colors = ["#0EA5E9", "#8B5CF6", "#22C55E", "#F97316", "#EC4899", "#EAB308"];
  return colors[index % colors.length];
}

function getEntryValue(entry: LeaderboardEntry, mode: RankingMode) {
  return mode === "experience" ? entry.experience ?? 0 : entry.bits ?? 0;
}

function initialsFromName(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ValueBadge({ mode }: { mode: RankingMode }) {
  if (mode === "bits") {
    return (
      <img
        src={bitIconUrl}
        alt=""
        className="h-5 w-5 object-contain"
        draggable={false}
      />
    );
  }

  return (
    <span className="text-[20px] leading-none text-[#D73BFF]">
      ✦
    </span>
  );
}

function RankDisplay({ rank }: { rank: number }) {
  if (rank <= 3) {
    const rankClass = rank === 1 ? "text-[#FFD832]" : rank === 2 ? "text-[#D6DEEA]" : "text-[#F39A45]";
    const laurelFilter =
      rank === 1
        ? ""
        : rank === 2
          ? "grayscale(1) brightness(1.75) opacity(0.78)"
          : "sepia(1) saturate(1.8) hue-rotate(340deg) brightness(0.95) opacity(0.78)";
    return (
      <div className="flex items-center justify-center gap-1 font-black leading-none">
        <img
          src={laurelLeftGoldUrl}
          alt=""
          className="h-6 w-4 object-contain"
          style={{ filter: laurelFilter }}
          draggable={false}
        />
        <span className={`${rankClass} w-6 text-center text-[22px]`}>
          {rank}
        </span>
        <img
          src={laurelLeftGoldUrl}
          alt=""
          className="h-6 w-4 scale-x-[-1] object-contain"
          style={{ filter: laurelFilter }}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className="text-center text-[15px] font-black leading-none text-slate-300">
      {rank}
    </div>
  );
}

function PlayerCell({
  entry,
  rank,
  highlight = false,
}: {
  entry: LeaderboardEntry;
  rank: number;
  highlight?: boolean;
}) {

  return (
    <div className="flex min-w-0 items-center gap-3">
      {entry.img ? (
        <img
          src={entry.img}
          alt={entry.name}
          className="h-8 w-8 rounded-full border-2 border-white/20 object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div
          className="grid h-8 w-8 place-items-center rounded-full border-2 border-white/20 text-[11px] font-black text-white"
          style={{ background: avatarFallback(entry.name, rank - 1) }}
        >
          {initialsFromName(entry.name)}
        </div>
      )}

      <span
        className={`notranslate block truncate text-[15px] font-black [text-decoration:none] ${highlight ? "text-white" : "text-slate-200"}`}
        spellCheck={false}
        suppressHydrationWarning
        translate="no"
        lang="zxx"
        dir="ltr"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
      >
        {entry.name}
      </span>
    </div>
  );
}

function ValueCell({
  value,
  mode,
  highlighted = false,
}: {
  value: number;
  mode: RankingMode;
  highlighted?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span
        className={`tabular-nums text-[16px] font-black ${highlighted ? "text-[#FFD832]" : "text-slate-200"}`}
      >
        {formatValue(value)}
      </span>
      <ValueBadge mode={mode} />
    </div>
  );
}


export default function RankingPage() {
  const [mode, setMode] = useState<RankingMode>("experience");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadLeaderboard() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/leaderboard/${mode}?limit=100`, {
          credentials: "include",
          signal: controller.signal,
        });

        const data = (await res.json().catch(() => ({}))) as {
          leaderboard?: LeaderboardEntry[];
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || "Impossible de charger le classement.");
        }

        setEntries(Array.isArray(data.leaderboard) ? data.leaderboard : []);
        setLastUpdated(new Date());
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setEntries([]);
        setError((err as Error).message || "Impossible de charger le classement.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadLeaderboard();
    return () => controller.abort();
  }, [mode]);

  useEffect(() => {
    setPage(1);
  }, [mode, search]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => entry.name.toLowerCase().includes(q));
  }, [entries, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, currentPage]);

  const modeLabel = useMemo(
    () => MODE_OPTIONS.find((option) => option.value === mode)?.label ?? "Expérience",
    [mode]
  );

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  const pagesToShow = useMemo(() => {
    const pages = new Set<number>([1, currentPage, totalPages]);
    if (currentPage > 1) pages.add(currentPage - 1);
    if (currentPage < totalPages) pages.add(currentPage + 1);
    return Array.from(pages).sort((a, b) => a - b);
  }, [currentPage, totalPages]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();

      const isTypingField = tag === "input" || tag === "textarea" || target?.isContentEditable;

      if (isTypingField) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPage((prev) => Math.max(1, prev - 1));
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPage((prev) => Math.min(totalPages, prev + 1));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [totalPages]);

  return (
    <div className="relative min-h-full overflow-hidden text-slate-50" spellCheck={false}>
      <div aria-hidden className="fixed inset-0 bg-[#060A19]" />
      <div
        aria-hidden
        className="fixed inset-0 bg-[radial-gradient(ellipse_at_16%_38%,rgba(24,36,74,0.42),transparent_46%),radial-gradient(ellipse_at_82%_44%,rgba(22,34,70,0.36),transparent_50%)]"
      />
      <svg
        aria-hidden="true"
        className="fixed inset-0 h-full w-full opacity-70"
        preserveAspectRatio="none"
        viewBox="0 0 1440 900"
      >
        <defs>
          <linearGradient id="rankingWaveA" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#0A132E" stopOpacity="0.06" />
            <stop offset="45%" stopColor="#1C2A52" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#0A132E" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="rankingWaveB" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#071028" stopOpacity="0.02" />
            <stop offset="52%" stopColor="#22315A" stopOpacity="0.36" />
            <stop offset="100%" stopColor="#071028" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path
          d="M-120 220 C 180 105 390 270 650 175 C 900 85 1110 175 1560 70 L1560 0 L-120 0 Z"
          fill="url(#rankingWaveA)"
        />
        <path
          d="M-120 500 C 180 390 410 545 700 440 C 980 340 1160 420 1560 330 L1560 170 C 1130 265 970 185 690 290 C 410 395 170 250 -120 350 Z"
          fill="url(#rankingWaveB)"
        />
        <path
          d="M-120 760 C 210 650 430 785 720 690 C 1010 595 1190 675 1560 575 L1560 430 C 1160 535 990 455 715 550 C 425 650 210 520 -120 620 Z"
          fill="url(#rankingWaveA)"
          opacity="0.66"
        />
        <path
          d="M-120 350 C 170 250 410 395 690 290 C 970 185 1130 265 1560 170"
          fill="none"
          stroke="#314474"
          strokeOpacity="0.14"
          strokeWidth="2"
        />
        <path
          d="M-120 620 C 210 520 425 650 715 550 C 990 455 1160 535 1560 430"
          fill="none"
          stroke="#2A3B68"
          strokeOpacity="0.12"
          strokeWidth="2"
        />
      </svg>
      <div
        aria-hidden
        className="fixed inset-0 bg-[linear-gradient(180deg,rgba(6,10,25,0)_0%,rgba(6,10,25,0.16)_58%,#060A19_100%)]"
      />

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col px-4 py-12 sm:px-8 lg:px-10">
        <header className="text-center">
          <h1 className="font-brandUpright text-[46px] uppercase leading-[0.9] tracking-[0.01em] text-slate-50 sm:text-[56px]">
            CLASSEMENT
          </h1>
        </header>

        <section className="mx-auto mt-9 w-full max-w-[1040px]">
          <div className="overflow-x-auto rounded-[10px] border border-[#21314C] bg-[#0E1625] backdrop-blur-xl" spellCheck={false}>
            <div className="grid min-w-[760px] grid-cols-[84px_minmax(260px,1fr)_190px_130px] items-center border-b border-[#1E2B42] bg-[#0E1625] px-5 py-4 font-brandUpright text-[20px] uppercase leading-none tracking-[0.04em] text-slate-400">
              <div className="text-center">Rang</div>
              <div>Joueur</div>
              <div className="flex items-center justify-end gap-2">
                <span>{modeLabel}</span>
                <HelpCircle className="h-4 w-4 text-slate-500" aria-hidden="true" />
              </div>
              <div className="text-right">Parties</div>
            </div>
            <div className="min-w-[760px]">

              {loading && (
                <div className="border-b border-[#1E2B42] px-5 py-5 text-sm font-bold text-slate-300">
                  Chargement du classement…
                </div>
              )}

              {error && !loading && (
                <div className="border-b border-[#1E2B42] px-5 py-5 text-sm font-bold text-rose-200">{error}</div>
              )}

              {!loading && !error && paginatedEntries.length === 0 && (
                <div className="border-b border-[#1E2B42] px-5 py-5 text-sm font-bold text-slate-300">
                  Aucun joueur disponible pour ce classement.
                </div>
              )}

              {!loading &&
                !error &&
                paginatedEntries.map((entry, index) => {
                  const absoluteRank = (currentPage - 1) * PAGE_SIZE + index + 1;
                  const value = getEntryValue(entry, mode);

                  return (
                    <div
                      key={`${entry.id}-${mode}-${absoluteRank}`}
                      spellCheck={false}
                      className="grid grid-cols-[84px_minmax(260px,1fr)_190px_130px] items-center border-b border-[#1E2B42]/85 bg-[#0E1625] px-5 py-2.5 last:border-b-0"
                    >
                      <RankDisplay rank={absoluteRank} />
                      <PlayerCell entry={entry} rank={absoluteRank} />
                      <ValueCell value={value} mode={mode} highlighted={absoluteRank === 1} />
                      <div className="text-right text-[15px] font-black text-slate-200">{formatValue(entry.gamesPlayed ?? 0)}</div>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-[10px] border border-[#21314C] bg-[#0E1625] px-5 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className={[
                    "rounded-[12px] px-4 py-2 text-[12px] font-black uppercase tracking-[0.08em] transition",
                    mode === option.value
                      ? "bg-[#6E4BFF] text-white"
                      : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Recherche un joueur..."
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="off"
                translate="no"
                lang="zxx"
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
                className="h-10 w-full rounded-[12px] border border-white/10 bg-[#071022]/80 pl-10 pr-4 text-[13px] font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-[#6E4BFF]"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-4 rounded-[10px] border border-[#21314C] bg-[#0E1625] px-5 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[13px] font-bold text-slate-400">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              <span>Mis à jour à {lastUpdatedLabel}</span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
                className="grid h-10 w-10 place-items-center rounded-[8px] border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-default disabled:text-slate-600 disabled:hover:bg-white/5"
                aria-label="Page précédente"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              {pagesToShow.map((pageNumber, index) => {
                const previousPage = pagesToShow[index - 1];
                const showEllipsis = previousPage && pageNumber - previousPage > 1;

                return (
                  <div key={pageNumber} className="flex items-center gap-2">
                    {showEllipsis && (
                      <span className="grid h-10 min-w-10 place-items-center rounded-[8px] border border-white/10 bg-white/5 px-3 text-sm font-black text-slate-400">
                        ...
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPage(pageNumber)}
                      className={[
                        "grid h-10 min-w-10 place-items-center rounded-[8px] border px-3 text-sm font-black transition",
                        currentPage === pageNumber
                          ? "border-[#6E4BFF] bg-[#6E4BFF] text-white"
                          : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                      ].join(" ")}
                      aria-label={`Page ${pageNumber}`}
                      aria-current={currentPage === pageNumber ? "page" : undefined}
                    >
                      {pageNumber}
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="grid h-10 w-10 place-items-center rounded-[8px] border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-default disabled:text-slate-600 disabled:hover:bg-white/5"
                aria-label="Page suivante"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}