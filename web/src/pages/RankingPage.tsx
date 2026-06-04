import { useEffect, useMemo, useState } from "react";
import {
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

type SelfLeaderboard = {
  rank: number;
  entry: LeaderboardEntry;
} | null;

const MODE_OPTIONS: Array<{ value: RankingMode; label: string }> = [
  { value: "experience", label: "Expérience" },
  { value: "bits", label: "Bits" },
];

const LEADERBOARD_FETCH_LIMIT = 100;
const LOAD_CHUNK_SIZE = 50;

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
        className="h-4 w-4 object-contain"
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
      <div className="flex items-center justify-center gap-0.5 font-semibold leading-none">
        <img
          src={laurelLeftGoldUrl}
          alt=""
          className="h-[18px] w-3 object-contain"
          style={{ filter: laurelFilter }}
          draggable={false}
        />
        <span className={`${rankClass} w-5 text-center text-[19px]`}>
          {rank}
        </span>
        <img
          src={laurelLeftGoldUrl}
          alt=""
          className="h-[18px] w-3 scale-x-[-1] object-contain"
          style={{ filter: laurelFilter }}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className="text-center text-[13px] font-medium leading-none text-slate-300">
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
          className="h-8 w-8 rounded-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div
          className="grid h-8 w-8 place-items-center rounded-full text-[10px] font-medium text-white"
          style={{ background: avatarFallback(entry.name, rank - 1) }}
        >
          {initialsFromName(entry.name)}
        </div>
      )}

      <span
        className={`notranslate block truncate text-[13px] font-medium [text-decoration:none] ${highlight ? "text-white" : "text-slate-200"}`}
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
        className={`tabular-nums text-[14px] font-semibold ${highlighted ? "text-[#FFD832]" : "text-slate-200"}`}
      >
        {formatValue(value)}
      </span>
      <ValueBadge mode={mode} />
    </div>
  );
}

function LeaderboardRow({
  entry,
  rank,
  mode,
  highlighted = false,
  detached = false,
}: {
  entry: LeaderboardEntry;
  rank: number;
  mode: RankingMode;
  highlighted?: boolean;
  detached?: boolean;
}) {
  const value = getEntryValue(entry, mode);

  return (
    <div
      spellCheck={false}
      className={[
        "grid grid-cols-[104px_minmax(120px,1fr)_190px_110px] items-center rounded-[9px] px-2",
        detached ? "py-2" : "py-1.5",
        highlighted ? "bg-[#251C59]" : "bg-[#121727]",
      ].join(" ")}
    >
      <RankDisplay rank={rank} />
      <PlayerCell entry={entry} rank={rank} highlight={highlighted} />
      <ValueCell value={value} mode={mode} highlighted={rank === 1} />
      <div className="text-right text-[14px] font-semibold text-slate-200">
        {formatValue(entry.gamesPlayed ?? 0)}
      </div>
    </div>
  );
}

export default function RankingPage() {
  const [mode, setMode] = useState<RankingMode>("experience");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [self, setSelf] = useState<SelfLeaderboard>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(LOAD_CHUNK_SIZE);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadLeaderboard() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/leaderboard/${mode}?limit=${LEADERBOARD_FETCH_LIMIT}`, {
          credentials: "include",
          signal: controller.signal,
        });

        const data = (await res.json().catch(() => ({}))) as {
          leaderboard?: LeaderboardEntry[];
          self?: SelfLeaderboard;
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || "Impossible de charger le classement.");
        }

        setEntries(Array.isArray(data.leaderboard) ? data.leaderboard : []);
        setSelf(data.self?.entry ? data.self : null);
        setLastUpdated(new Date());
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setEntries([]);
        setSelf(null);
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
    setVisibleCount(LOAD_CHUNK_SIZE);
  }, [mode, search]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => entry.name.toLowerCase().includes(q));
  }, [entries, search]);

  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, visibleCount),
    [filteredEntries, visibleCount]
  );

  const hasMoreEntries = visibleCount < filteredEntries.length;

  const modeLabel = useMemo(
    () => MODE_OPTIONS.find((option) => option.value === mode)?.label ?? "Expérience",
    [mode]
  );

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

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

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 py-12 sm:px-8 lg:px-10">
        <section className="mx-auto mt-0 grid w-full max-w-6xl gap-24 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-32">
          <aside className="flex flex-col gap-6 lg:sticky lg:top-8">
            <div>
              <h1 className="font-brandUpright text-[44px] uppercase leading-[0.9] tracking-[0.01em] text-slate-50 sm:text-[54px]">
                CLASSEMENT
              </h1>
              <p className="mt-3 max-w-[230px] text-[13px] font-semibold leading-snug text-slate-400">
                Les meilleurs joueurs, tous modes confondus.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className={[
                    "w-full rounded-[10px] px-4 py-2.5 text-left text-[12px] font-black uppercase tracking-[0.08em] transition",
                    mode === option.value
                      ? "bg-[#6E4BFF] text-white shadow-[0_10px_28px_rgba(110,75,255,0.25)]"
                      : "bg-transparent text-slate-400 hover:bg-white/5 hover:text-white",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="relative">
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
                className="h-10 w-full rounded-[10px] border border-[#1C2332] bg-[#0C1222]/85 pl-10 pr-4 text-[13px] font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-[#6E4BFF]"
              />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Mis à jour à {lastUpdatedLabel}</span>
            </div>
          </aside>

          <div className="min-w-0 overflow-x-auto rounded-[14px]">
            <div className="mr-6 grid min-w-[620px] grid-cols-[104px_minmax(120px,1fr)_190px_110px] items-center px-2 pb-2 pt-1 font-brandUpright text-[17px] uppercase leading-none tracking-[0.04em] text-slate-400">
              <div className="text-center">Rang</div>
              <div>Joueur</div>
              <div className="flex items-center justify-end gap-2">
                <span>{modeLabel}</span>
                <HelpCircle className="h-4 w-4 text-slate-500" aria-hidden="true" />
              </div>
              <div className="text-right">Parties</div>
            </div>

            <div className="lb-scroll max-h-[calc(100vh-260px)] min-w-[644px] overflow-y-auto pr-6 font-inter">
              <div className="flex flex-col gap-1.5">
                {loading && (
                  <div className="rounded-[9px] bg-[#121727] px-5 py-4 text-sm font-semibold text-slate-300">
                    Chargement du classement…
                  </div>
                )}

                {error && !loading && (
                  <div className="rounded-[9px] bg-[#121727] px-5 py-4 text-sm font-semibold text-rose-200">{error}</div>
                )}

                {!loading && !error && visibleEntries.length === 0 && (
                  <div className="rounded-[9px] bg-[#121727] px-5 py-4 text-sm font-semibold text-slate-300">
                    Aucun joueur disponible pour ce classement.
                  </div>
                )}

                {!loading &&
                  !error &&
                  visibleEntries.map((entry, index) => {
                    const absoluteRank = index + 1;
                    const isSelf = self?.entry.id === entry.id;

                    return (
                      <LeaderboardRow
                        key={`${entry.id}-${mode}-${absoluteRank}`}
                        entry={entry}
                        rank={absoluteRank}
                        mode={mode}
                        highlighted={isSelf}
                      />
                    );
                  })}

                {!loading && !error && hasMoreEntries && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + LOAD_CHUNK_SIZE)}
                    className="rounded-[9px] border border-dashed border-[#2C3650] bg-[#121727] px-5 py-3 text-center text-[12px] font-black uppercase tracking-[0.08em] text-slate-300 transition hover:border-[#6E4BFF] hover:text-white"
                  >
                    Voir davantage
                  </button>
                )}
              </div>
            </div>
            {!loading && !error && self && (
              <div className="mt-4 min-w-[644px] pr-6 font-inter">
                <LeaderboardRow
                  entry={self.entry}
                  rank={self.rank}
                  mode={mode}
                  highlighted
                  detached
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}