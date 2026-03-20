import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  Search,
} from "lucide-react";
import bitIconUrl from "@/assets/bit.png";
import rankingIconUrl from "@/assets/ranking.png";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");

type RankingMode = "experience" | "bits";

type LeaderboardEntry = {
  id: string;
  name: string;
  img?: string | null;
  bits?: number;
  experience?: number;
};

const MODE_OPTIONS: Array<{ value: RankingMode; label: string }> = [
  { value: "experience", label: "Expérience" },
  { value: "bits", label: "Bits" },
];

const PAGE_SIZE = 5;

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
    <span className="inline-flex h-6 min-w-[30px] items-center justify-center rounded-full bg-[#1EA7F2] px-2 text-[10px] font-extrabold uppercase tracking-wide text-white">
      XP
    </span>
  );
}

function RankDisplay({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="relative flex h-8 w-[68px] items-center justify-center bg-[#C9B15B] text-white">
        <span className="absolute left-2">
          <Crown className="h-3.5 w-3.5 fill-current" />
        </span>
        <span className="text-[18px] font-extrabold leading-none">{rank}</span>
      </div>
    );
  }

  return (
    <div className="flex h-8 items-center pl-5 text-[15px] font-bold text-white">
      {rank}
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

  useEffect(() => {
    const controller = new AbortController();

    async function loadLeaderboard() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/leaderboard/${mode}`, {
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

    loadLeaderboard();
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();

      const isTypingField =
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable;

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
    <div
      className="relative min-h-full overflow-hidden text-slate-50"
      spellCheck={false}
    >
      <div aria-hidden className="fixed inset-0 bg-[#13141F]" />

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col px-4 py-12 sm:px-8 lg:px-10">
        <header className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-[10px] border border-white/10 bg-white/5 p-3 shadow-[0_18px_40px_rgba(0,0,0,.35)]">
              <img
                src={rankingIconUrl}
                alt=""
                className="h-10 w-10 object-contain"
                draggable={false}
              />
            </div>
          </div>

          <h1 className="text-4xl font-brand italic text-slate-50 sm:text-5xl">
            CLASSEMENT
          </h1>
        </header>

        <section className="mx-auto mt-9 w-full max-w-[950px]">
          <div className="mx-auto w-full max-w-[760px]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative">
                  <select
                    value={mode}
                    onChange={(event) => setMode(event.target.value as RankingMode)}
                    className="h-[38px] min-w-[210px] appearance-none rounded-[4px] border border-white/10 bg-[#2A2C47] px-4 pr-10 text-[14px] font-medium text-white outline-none transition focus:border-[#0FACF3]"
                  >
                    {MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white" />
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
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
                    className="h-[38px] min-w-[240px] rounded-[4px] border border-white/10 bg-[#2A2C47] pl-10 pr-4 text-[14px] text-white placeholder:text-white/50 outline-none transition focus:border-[#0FACF3]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setPage(1)}
                  disabled={currentPage <= 1}
                  className="text-white transition hover:text-white/80 disabled:cursor-default disabled:text-white/35"
                  aria-label="Première page"
                >
                  <ChevronsLeft className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="text-white transition hover:text-white/80 disabled:cursor-default disabled:text-white/35"
                  aria-label="Page précédente"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <div className="grid h-[38px] w-[38px] place-items-center rounded-[4px] border border-white/10 bg-[#2A2C47] text-[16px] font-medium text-white">
                  {currentPage}
                </div>

                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="text-white transition hover:text-white/80 disabled:cursor-default disabled:text-white/35"
                  aria-label="Page suivante"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={() => setPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="text-white transition hover:text-white/80 disabled:cursor-default disabled:text-white/35"
                  aria-label="Dernière page"
                >
                  <ChevronsRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-10 overflow-hidden" spellCheck={false}>
              <div className="grid grid-cols-[92px,minmax(0,1fr),112px] px-5 pb-3 text-[13px] font-medium text-white">
                <div>Rang</div>
                <div>Joueur</div>
                <div className="text-right">{modeLabel}</div>
              </div>

              {loading && (
                <div className="bg-[#2A2C47] px-4 py-4 text-sm text-slate-300">
                  Chargement du classement…
                </div>
              )}

              {error && !loading && (
                <div className="bg-[#2A2C47] px-4 py-4 text-sm text-rose-200">{error}</div>
              )}

              {!loading && !error && paginatedEntries.length === 0 && (
                <div className="bg-[#2A2C47] px-4 py-4 text-sm text-slate-300">
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
                      className={[
                        "grid grid-cols-[92px,minmax(0,1fr),112px] items-center",
                        index % 2 === 0 ? "bg-[#2B2E4A]" : "bg-[#3B3E62]",
                      ].join(" ")}
                    >
                      <RankDisplay rank={absoluteRank} />

                      <div className="flex min-w-0 items-center gap-3 px-2 py-2">
                        {entry.img ? (
                          <img
                            src={entry.img}
                            alt={entry.name}
                            className="h-8 w-8 rounded-[2px] object-cover"
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <div
                            className="grid h-8 w-8 place-items-center rounded-[2px] text-[10px] font-bold text-white"
                            style={{ background: avatarFallback(entry.name, absoluteRank - 1) }}
                          >
                            {initialsFromName(entry.name)}
                          </div>
                        )}

                        <div className="min-w-0" spellCheck={false}>
                          <span
                            className="notranslate block truncate text-[14px] font-bold text-white [text-decoration:none]"
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
                      </div>

                      <div className="flex items-center justify-end gap-2 px-5 py-2">
                        <span className="text-[14px] font-bold text-white">
                          {formatValue(value)}
                        </span>
                        <ValueBadge mode={mode} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}