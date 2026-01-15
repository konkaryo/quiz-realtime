import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getThemeMeta } from "../lib/themeMeta";

const API_BASE = import.meta.env.VITE_API_BASE as string;

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

const AVATAR_COLORS = [
  "#6366f1",
  "#ec4899",
  "#22d3ee",
  "#f97316",
  "#84cc16",
  "#14b8a6",
  "#a855f7",
  "#facc15",
  "#38bdf8",
  "#ef4444",
];

const STORAGE_KEY = "dailyChallenge:results:v1";

// états des questions stockés depuis DailyChallengePlayPage
type QuestionState = "pending" | "correct" | "wrong";

type CompletedInfo = {
  score: number;
  completedAt: string;
  questionStates?: QuestionState[];
};

type CalendarChallenge = {
  date: string;
  questionCount: number;
  slotLabels: string[];
  themeCounts: Record<string, number>;
  difficultyAverage: number | null;
};

type LeaderboardEntry = {
  playerId: string;
  playerName: string;
  score: number;
  img?: string | null;
};

type CalendarResponse = {
  month: { year: number; month: number };
  today: string;
  challenges: CalendarChallenge[];
};

function readStorage(): Record<string, CompletedInfo> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, CompletedInfo>;
    return {};
  } catch {
    return {};
  }
}

function getCalendarMatrix(year: number, monthIndex: number) {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const weekStartMonday = (firstDay.getUTCDay() + 6) % 7; // 0 = lundi
  const totalCells = Math.ceil((weekStartMonday + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const dayNumber = i - weekStartMonday + 1;
    cells.push(dayNumber > 0 && dayNumber <= daysInMonth ? dayNumber : null);
  }
  return cells;
}

function isoFromParts(year: number, monthIndex: number, day: number) {
  const mm = (monthIndex + 1).toString().padStart(2, "0");
  const dd = day.toString().padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function difficultyLabel(avg: number | null): string {
  if (avg === null) return "Mixte";
  if (avg < 1.8) return "Facile";
  if (avg < 2.6) return "Intermédiaire";
  return "Difficile";
}

function topThemeKey(counts: Record<string, number>): string | null {
  let key: string | null = null;
  let best = -1;
  Object.entries(counts).forEach(([theme, count]) => {
    if (count > best) {
      best = count;
      key = theme;
    }
  });
  return key;
}

function avatarColor(name: string, index: number) {
  const sum = name
    .split("")
    .map((c) => c.charCodeAt(0))
    .reduce((acc, cur) => acc + cur, 0);
  return AVATAR_COLORS[(sum + index) % AVATAR_COLORS.length];
}

export default function DailyChallengePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationSelectedDate =
    (location.state as { selectedDate?: string } | null)?.selectedDate ?? null;
  const today = new Date();
  const fallbackYear = today.getUTCFullYear();
  const fallbackMonthIndex = today.getUTCMonth();

  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, CompletedInfo>>(() => readStorage());
  const [leaderboardMode, setLeaderboardMode] = useState<"monthly" | "daily">("monthly");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCalendar() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/daily/calendar`, { credentials: "include" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as CalendarResponse;
        if (cancelled) return;
        setCalendar(data);
        const map = new Map<string, CalendarChallenge>();
        data.challenges.forEach((c) => map.set(c.date, c));
        const preferredDate =
          navigationSelectedDate && map.has(navigationSelectedDate)
            ? navigationSelectedDate
            : null;
        const defaultDate = preferredDate
          ? preferredDate
          : map.has(data.today)
          ? data.today
          : data.challenges.length > 0
          ? data.challenges[0].date
          : null;
        setSelectedDate(defaultDate);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Erreur lors du chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCalendar();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setProgress(readStorage());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const fetchMonthlyLeaderboard = useCallback(
    async (yearValue: number, monthIndexValue: number) => {
      setLeaderboardLoading(true);
      setLeaderboardError(null);
      try {
        const monthLabel = `${yearValue}-${String(monthIndexValue + 1).padStart(2, "0")}`;
        const res = await fetch(`${API_BASE}/daily/leaderboard/monthly?month=${monthLabel}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { leaderboard: LeaderboardEntry[] };
        setLeaderboard(data.leaderboard ?? []);
      } catch (e: any) {
        setLeaderboard([]);
        setLeaderboardError(e?.message || "Erreur lors du chargement du classement");
      } finally {
        setLeaderboardLoading(false);
      }
    },
    [],
  );

  const fetchDailyLeaderboard = useCallback(async (dateIso: string) => {
    setLeaderboardLoading(true);
       setLeaderboardError(null);
    try {
      const res = await fetch(`${API_BASE}/daily/leaderboard/daily/${dateIso}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { leaderboard: LeaderboardEntry[] };
      setLeaderboard(data.leaderboard ?? []);
    } catch (e: any) {
      setLeaderboard([]);
      const msg = e?.message;
      setLeaderboardError(
        msg === "not_found"
          ? "Aucun défi trouvé pour cette date."
          : msg || "Erreur lors du chargement du classement",
      );
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  // Mois / année renvoyés par l'API = mois en cours (limite max)
  const year = calendar?.month.year ?? fallbackYear;
  const monthIndex = calendar ? calendar.month.month - 1 : fallbackMonthIndex;

  // Mois / année affichés (navigables)
  const [viewYear, setViewYear] = useState(year);
  const [viewMonthIndex, setViewMonthIndex] = useState(monthIndex);

  // Recalage de la vue quand on reçoit les données
  useEffect(() => {
    if (selectedDate) {
      const match = selectedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        setViewYear(Number(match[1]));
        setViewMonthIndex(Number(match[2]) - 1);
        return;
      }
    }

    if (calendar) {
      setViewYear(calendar.month.year);
      setViewMonthIndex(calendar.month.month - 1);
    }
  }, [calendar, selectedDate]);

  const challengeMap = useMemo(() => {
    const map = new Map<string, CalendarChallenge>();
    (calendar?.challenges ?? []).forEach((item) => {
      map.set(item.date, item);
    });
    return map;
  }, [calendar]);

  // Grille basée sur le mois affiché
  const calendarCells = useMemo(
    () => getCalendarMatrix(viewYear, viewMonthIndex),
    [viewYear, viewMonthIndex],
  );

  const selectedChallenge = selectedDate ? challengeMap.get(selectedDate) : undefined;
  const selectedProgress = selectedDate ? progress[selectedDate] : undefined;
  const selectedThemeKey = selectedChallenge ? topThemeKey(selectedChallenge.themeCounts) : null;
  const selectedThemeMeta = selectedThemeKey ? getThemeMeta(selectedThemeKey) : getThemeMeta(null);
  const selectedDifficultyLabel = difficultyLabel(selectedChallenge?.difficultyAverage ?? null);

  const todayIso =
    calendar?.today ?? isoFromParts(fallbackYear, fallbackMonthIndex, today.getUTCDate());

  useEffect(() => {
    if (!calendar) return;

    if (leaderboardMode === "daily") {
      if (!selectedDate) {
        setLeaderboardMode("monthly");
        return;
      }
      fetchDailyLeaderboard(selectedDate);
      return;
    }

    fetchMonthlyLeaderboard(calendar.month.year, calendar.month.month - 1);
  }, [
    calendar,
    fetchDailyLeaderboard,
    fetchMonthlyLeaderboard,
    leaderboardMode,
    selectedDate,
  ]);

  // Navigation mois avec limite max = mois / année de l'API
  const goToMonth = useCallback(
    (delta: number) => {
      if (!delta) return;

      let newMonth = viewMonthIndex + delta;
      let newYear = viewYear;

      if (newMonth < 0) {
        newMonth = 11;
        newYear -= 1;
      } else if (newMonth > 11) {
        newMonth = 0;
        newYear += 1;
      }

      const maxYear = year;
      const maxMonthIndex = monthIndex;

      // Interdit d'aller dans le futur au-delà du mois en cours
      if (newYear > maxYear || (newYear === maxYear && newMonth > maxMonthIndex)) {
        return;
      }

      setViewMonthIndex(newMonth);
      setViewYear(newYear);
    },
    [viewMonthIndex, viewYear, year, monthIndex],
  );

  // Navigation clavier (flèches gauche/droite)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToMonth(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToMonth(1);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goToMonth]);

  // Libellé du jour sélectionné
  const selectedDayLabel = selectedDate?.split("-")[2] ?? "";
  let selectedMonthLabel = MONTH_NAMES[monthIndex];
  if (selectedDate) {
    const [, mStr] = selectedDate.split("-");
    const mIdx = Number(mStr) - 1;
    if (!Number.isNaN(mIdx) && mIdx >= 0 && mIdx < 12) {
      selectedMonthLabel = MONTH_NAMES[mIdx];
    }
  }

  return (
    <div className="relative text-slate-50">
      <div aria-hidden className="fixed inset-0 bg-[#13141F]" />

      {/* CONTENU : même pattern que Home → relative + z-10, pas de min-h-screen */}
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 py-10 sm:px-8 lg:px-10">
        {/* HEADER simplifié : titre centré */}
        <header className="mb-3 text-center">
          <h1 className="text-5xl font-brand text-slate-50">DÉFI DU JOUR</h1>
        </header>

        <div className="mb-6 text-sm text-slate-200/80">
          {loading && <span>Chargement des défis…</span>}
          {!loading && error && <span className="text-rose-200">{error}</span>}
        </div>

        {/* PANNEAUX SÉPARÉS */}
        <div className="min-h-0">
          <div className="grid gap-6 lg:grid-cols-[320px,minmax(0,1fr),320px]">
            {/* CLASSEMENT */}
            <div className="space-y-3">
              <div className="flex justify-center">
                <div className="flex items-center gap-1 rounded-md border border-[#2A2D3C] bg-[#141625] p-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                  <button
                    type="button"
                    onClick={() => setLeaderboardMode("monthly")}
                    className={[
                      "rounded-md px-3 py-1 transition",
                      leaderboardMode === "monthly"
                        ? "bg-[#2D7CFF] text-white shadow-[0_0_12px_rgba(45,124,255,0.45)]"
                        : "hover:text-white",
                    ].join(" ")}
                  >
                    Mensuel
                  </button>
                  <button
                    type="button"
                    disabled={!selectedDate}
                    onClick={() => selectedDate && setLeaderboardMode("daily")}
                    className={[
                      "rounded-md px-3 py-1 transition",
                      leaderboardMode === "daily"
                        ? "bg-[#2D7CFF] text-white shadow-[0_0_12px_rgba(45,124,255,0.45)]"
                        : "hover:text-white",
                      !selectedDate ? "cursor-not-allowed opacity-40" : "",
                    ].join(" ")}
                  >
                    Quotidien
                  </button>
                </div>
              </div>
              <aside className="rounded-[6px] border border-[#2A2D3C] bg-[#1C1F2E] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                <div className="flex h-full flex-col">
                  <div className="mt-1 text-center text-sm font-semibold text-slate-100">
                    {leaderboard.length} joueurs
                  </div>

                  <div className="mt-4 max-h-[520px] flex-1 space-y-2 overflow-y-auto pr-2 lb-scroll">
                    {!leaderboardLoading && leaderboardError && (
                      <div className="text-sm text-rose-200">{leaderboardError}</div>
                    )}
                    {!leaderboardLoading && !leaderboardError && leaderboard.length === 0 && (
                      <div className="text-sm text-slate-400">
                        Aucun score disponible pour ce classement.
                      </div>
                    )}
                    {!leaderboardLoading &&
                      !leaderboardError &&
                      leaderboard.map((entry, index) => (
                        <div
                          key={`${entry.playerId}-${index}`}
                          className="mx-auto flex items-center gap-2 rounded-[12px] border border-[#2A2D3C] bg-[#151726] px-3 py-2 text-slate-50"
                        >
                          <div className="w-5 text-left text-[11px] font-bold text-slate-400">
                            #{index + 1}
                          </div>
                          {entry.img ? (
                            <img
                              src={entry.img}
                              alt=""
                              className="h-7 w-7 flex-shrink-0 rounded-[6px] object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-xl text-[10px] font-semibold text-slate-50"
                              style={{ background: avatarColor(entry.playerName, index) }}
                            >
                              {entry.playerName
                                .split(" ")
                                .map((part) => part[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                          )}
                          <div className="ml-0.5 flex min-w-0 flex-1 items-center justify-between">
                            <div className="truncate text-[13px] font-semibold">
                              {entry.playerName}
                            </div>
                            <div className="flex-shrink-0 text-[11px] font-semibold text-slate-100">
                              {entry.score}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </aside>
            </div>

            {/* CALENDRIER */}
            <section className="rounded-[6px] border border-[#2A2D3C] bg-[#1C1F2E] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
              <div className="mb-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => goToMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center text-sm font-semibold text-slate-300 hover:text-[#2D7CFF] focus:outline-none"
                >
                  <span className="sr-only">Mois précédent</span>
                  <span className="text-lg leading-none">‹</span>
                </button>

                <div className="text-sm font-semibold text-slate-100 sm:text-base">
                  {MONTH_NAMES[viewMonthIndex]} {viewYear}
                </div>

                <button
                  type="button"
                  onClick={() => goToMonth(1)}
                  className="flex h-8 w-8 items-center justify-center text-sm font-semibold text-slate-300 hover:text-[#2D7CFF] focus:outline-none"
                >
                  <span className="sr-only">Mois suivant</span>
                  <span className="text-lg leading-none">›</span>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-xs text-slate-400">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="uppercase tracking-[0.32em]">
                    {label}
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-7 gap-3">
                {calendarCells.map((day, idx) => {
                  if (!day) {
                    return (
                      <div key={`empty-${idx}`} className="flex flex-col items-center gap-0.5">
                        <div className="flex h-3 items-end gap-0 opacity-0 leading-none">
                          <span className="text-[12px]">★</span>
                          <span className="text-[16px]">★</span>
                          <span className="text-[12px]">★</span>
                        </div>
                        <div className="flex aspect-square w-full rounded-[10px] opacity-0" />
                      </div>
                    );
                  }

                  const iso = isoFromParts(viewYear, viewMonthIndex, day);
                  const challenge = challengeMap.get(iso);
                  const isToday = iso === todayIso;
                  const isSelected = iso === selectedDate;
                  const completion = progress[iso];
                  const disabled = !challenge;

                  const totalQuestions = completion?.questionStates?.length ?? 0;
                  const correctCount = completion?.questionStates?.filter(
                    (state) => state === "correct",
                  ).length ?? 0;
                  const ratio = totalQuestions > 0 ? correctCount / totalQuestions : 0;
                  const filledStars = Math.round(ratio * 3);

                  if (disabled) {
                    return (
                      <div key={iso} className="flex flex-col items-center gap-0.5">
                        <div className="flex h-3 items-end gap-0 text-slate-700 leading-none">
                          <span className="text-[12px]">☆</span>
                          <span className="text-[16px]">☆</span>
                          <span className="text-[12px]">☆</span>
                        </div>
                        <button
                          type="button"
                          disabled
                          className="flex aspect-square w-full cursor-not-allowed items-center justify-center rounded-[10px] bg-[#171828] text-sm font-semibold text-slate-500/80"
                        >
                          <span>{day}</span>
                        </button>
                      </div>
                    );
                  }

                  const classes = [
                    "flex aspect-square w-full items-center justify-center rounded-[10px] text-sm font-semibold transition-colors",
                    isSelected
                      ? "border border-white bg-[#621A64] text-white shadow-[0_10px_18px_rgba(0,0,0,0.4)]"
                      : "bg-[#572658] text-white hover:bg-[#7C367E]",
                    isToday && !isSelected ? "ring-1 ring-[#2D7CFF]/50" : "",
                  ].join(" ");

                  return (
                    <div key={iso} className="flex flex-col items-center gap-0.5">
                      <div className="flex h-3 items-end gap-0 leading-none">
                        {Array.from({ length: 3 }).map((_, starIndex) => (
                          <span
                            key={starIndex}
                            className={[
                              starIndex < filledStars ? "text-[#FACC15]" : "text-[#2A2D3C]",
                              starIndex === 1 ? "text-[16px]" : "text-[12px]",
                            ].join(" ")}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDate(iso);
                          setLeaderboardMode("daily");
                        }}
                        className={classes}
                      >
                        <span>{day}</span>
                      </button>

                    </div>

                  );
                })}
              </div>
            </section>

            {/* PANNEAU DÉTAIL DU DÉFI */}
            <aside className="rounded-[6px] border border-[#2A2D3C] bg-[#1C1F2E] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
              {selectedChallenge ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                        Défi du
                      </div>
                      <div className="mt-1 text-2xl font-semibold text-slate-50">
                        {selectedDayLabel} {selectedMonthLabel}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 text-sm text-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-300">Difficulté</span>
                      <span className="rounded-full bg-[#141625] px-3 py-1 text-xs font-semibold text-slate-100">
                        {selectedDifficultyLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-300">Nombre de questions</span>
                      <span className="font-semibold text-slate-50">
                        {selectedChallenge.questionCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-300">Score</span>
                      <span className="font-semibold text-slate-50">
                        {selectedProgress ? `${selectedProgress.score} pts` : "—"}
                      </span>
                    </div>
                  </div>
                  {selectedProgress?.questionStates &&
                    selectedProgress.questionStates.length > 0 && (
                      <div className="mt-5 grid grid-cols-8 gap-1.5">
                        {Array.from({
                          length: selectedChallenge.questionCount,
                        }).map((_, i) => {
                          const state = selectedProgress.questionStates?.[i];
                          let colorClasses =
                            "border-slate-700/90 bg-slate-700/60 text-slate-100";

                          if (state === "correct") {
                            colorClasses =
                              "border-emerald-600 bg-emerald-600 text-slate-50 shadow-[0_0_0px_rgba(52,211,153,0.75)]";
                          } else if (state === "wrong") {
                            colorClasses =
                              "border-rose-700 bg-rose-700 text-slate-50 shadow-[0_0_0px_rgba(248,113,113,0.8)]";
                          }

                          return (
                            <div
                              key={i}
                              className={[
                                "flex aspect-square w-full items-center justify-center rounded-md text-[11px] font-semibold",
                                "border",
                                colorClasses,
                              ].join(" ")}
                            >
                              {i + 1}
                            </div>
                          );
                        })}
                      </div>
                    )}

                  <button
                    type="button"
                    disabled={!selectedChallenge}
                    onClick={() => selectedDate && navigate(`/solo/daily/${selectedDate}`)}
                    className={[
                      "mt-auto inline-flex items-center justify-center rounded-[6px] px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] transition",
                      "border border-transparent bg-[#2D7CFF] text-slate-50 hover:bg-[#1F65DB]",
                      !selectedChallenge ? "cursor-not-allowed opacity-40" : "",
                    ].join(" ")}
                  >
                    Jouer
                  </button>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-sm text-slate-300">
                  <p>Aucun défi sélectionné.</p>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
