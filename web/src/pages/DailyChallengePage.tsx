import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getThemeMeta } from "../lib/themeMeta";
import BronzeMedal from "../assets/bronze-feather.png";
import SilverMedal from "../assets/silver-feather.png";
import GoldMedal from "../assets/gold-feather.png";
import EliteMedal from "../assets/elite-feather.png";
import OwlEdge from "../assets/owledge.png";
import { User } from "lucide-react";

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

  // Choix de la médaille en fonction du score (Bronze <1000, Argent 1000–1499, Or 1500–1999, Elite ≥2000)
  let medalSrc: string | null = null;
  let medalAlt = "";

  if (selectedProgress) {
    const s = selectedProgress.score;
    if (s < 1000) {
      medalSrc = BronzeMedal;
      medalAlt = "Médaille bronze";
    } else if (s < 1500) {
      medalSrc = SilverMedal;
      medalAlt = "Médaille argent";
    } else if (s < 2000) {
      medalSrc = GoldMedal;
      medalAlt = "Médaille or";
    } else {
      medalSrc = EliteMedal;
      medalAlt = "Médaille élite";
    }
  }

  return (
    <div className="relative text-slate-50">
      {/* BACKGROUND GLOBAL (comme "wrapper background", mais en fixed pleine page) */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-gradient-to-br from-[#050816] via-[#050014] to-[#1b0308]"
      />
      {/* halo + gradient additionnel, aligné avec la page de jeu */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_top,rgba(248,113,113,0.15),transparent_60%),radial-gradient(circle_at_top,rgba(15,23,42,0.95),#020617)]"
      />
      {/* petites particules lumineuses */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        {[...Array(18)].map((_, i) => (
          <div
            key={i}
            className="absolute h-[3px] w-[3px] rounded-full bg-rose-200/40"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: 0.55,
            }}
          />
        ))}
      </div>

      {/* CONTENU : même pattern que Home → relative + z-10, pas de min-h-screen */}
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 py-6 sm:px-8 lg:px-10">
        {/* HEADER simplifié : titre centré */}
        <header className="mb-3 text-center">
          <h1 className="text-xl font-brutal text-slate-50 sm:text-2xl">DÉFI DU JOUR</h1>
        </header>

        <div className="mb-3 text-sm text-slate-200/80">
          {loading && <span>Chargement des défis…</span>}
          {!loading && error && <span className="text-rose-200">{error}</span>}
        </div>

        {/* CARTE PRINCIPALE : prend l'espace dispo, sans forcer le viewport */}
        <div className="min-h-0">
          <div
            className={[
              "relative w-full rounded-[40px] border border-slate-800/80",
              "bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.96),rgba(15,23,42,0.98)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.8),#020617)]",
              "shadow-[0_30px_80px_rgba(0,0,0,0.95)]",
              "p-5 sm:p-6 lg:p-7",
            ].join(" ")}
          >
            <div className="grid gap-6 lg:grid-cols-[300px,minmax(0,1fr),260px]">
              {/* CLASSEMENT */}
              <aside className="rounded-[24px] border border-slate-800/80 bg-black/70 p-4 shadow-inner shadow-black/70 backdrop-blur-xl">
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-100 sm:text-base">
                    <span>Classement</span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-100">
                      (
                      <User className="h-3 w-3 text-white" />
                      <span>{leaderboard.length}</span>
                      )
                    </span>
                  </div>

                  {/* Switch centré */}
                  <div className="mt-4 flex justify-center">
                    <div className="flex items-center gap-1 rounded-full border border-slate-800/80 bg-slate-900/60 p-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                      <button
                        type="button"
                        onClick={() => setLeaderboardMode("monthly")}
                        className={[
                          "rounded-full px-3 py-1 transition",
                          leaderboardMode === "monthly"
                            ? "bg-[#2563ff] text-white shadow-[0_0_12px_rgba(37,99,255,0.45)]"
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
                          "rounded-full px-3 py-1 transition",
                          leaderboardMode === "daily"
                            ? "bg-[#2563ff] text-white shadow-[0_0_12px_rgba(37,99,255,0.45)]"
                            : "hover:text-white",
                          !selectedDate ? "cursor-not-allowed opacity-40" : "",
                        ].join(" ")}
                      >
                        Quotidien
                      </button>
                    </div>
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
                          className="mx-auto flex items-center gap-2 rounded-[10px] border border-slate-700/80 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/10 px-2.5 py-1.5 text-slate-50 shadow-[0_14px_30px_rgba(0,0,0,0.85)]"
                        >
                          <div className="w-4 text-left text-[11px] font-bold text-slate-400">
                            #{index + 1}
                          </div>
                          {entry.img ? (
                            <img
                              src={entry.img}
                              alt=""
                              className="h-5 w-5 flex-shrink-0 rounded-[4px] object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-xl text-[9px] font-semibold text-slate-50"
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
                              {entry.score} pts
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </aside>

              {/* CALENDRIER */}
              <section className="rounded-[24px] border border-slate-800/80 bg-black/70 p-5 shadow-inner shadow-black/70 backdrop-blur-xl">
                <div className="mb-6 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => goToMonth(-1)}
                    className="flex h-8 w-8 items-center justify-center text-sm font-semibold text-slate-300 hover:text-[#2563ff] focus:outline-none"
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
                    className="flex h-8 w-8 items-center justify-center text-sm font-semibold text-slate-300 hover:text-[#2563ff] focus:outline-none"
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

                <div className="mt-2 grid grid-cols-7 gap-2">
                  {calendarCells.map((day, idx) => {
                    if (!day) {
                      return <div key={`empty-${idx}`} />;
                    }

                    const iso = isoFromParts(viewYear, viewMonthIndex, day);
                    const challenge = challengeMap.get(iso);
                    const isToday = iso === todayIso;
                    const isSelected = iso === selectedDate;
                    const completion = progress[iso];
                    const disabled = !challenge;

                    if (disabled) {
                      return (
                        <button
                          key={iso}
                          type="button"
                          disabled
                          className="relative flex h-12 w-full cursor-not-allowed items-center justify-center rounded-2xl bg-transparent text-sm font-semibold text-slate-600/60"
                        >
                          <span>{day}</span>
                        </button>
                      );
                    }

                    const isTodayNotSelected = isToday && !isSelected;

                    const classes = [
                      "relative flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold transition-colors border",
                      isSelected
                        ? "border-transparent bg-[#2563ff] text-white hover:bg-[#2563ff]"
                        : "border-slate-700/80 bg-slate-900/80 hover:bg-slate-900 hover:border-slate-300",
                      isTodayNotSelected ? "text-[#2563ff]" : "text-slate-100",
                    ].join(" ");

                    let dotColor: string | null = null;
                    if (completion && !isSelected) {
                      const s = completion.score;
                      if (s < 1000) {
                        dotColor = "#b45309";
                      } else if (s < 1500) {
                        dotColor = "#d1d5db";
                      } else if (s < 2000) {
                        dotColor = "#facc15";
                      } else {
                        dotColor = "#a855f7";
                      }
                    }

                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => {
                          setSelectedDate(iso);
                          setLeaderboardMode("daily");
                        }}
                        className={classes}
                      >
                        <span>{day}</span>
                        {dotColor && (
                          <span
                            className="absolute bottom-1 h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: dotColor }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* PANNEAU DÉTAIL DU DÉFI */}
              <aside className="rounded-[24px] border border-slate-800/80 bg-black/70 p-5 shadow-inner shadow-black/70 backdrop-blur-xl">
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
                      {medalSrc && (
                        <img
                          src={medalSrc}
                          alt={medalAlt}
                          className="h-10 w-10 flex-shrink-0"
                        />
                      )}
                    </div>

                    <div className="mt-4 space-y-3 text-sm text-slate-200">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-300">Difficulté</span>
                        <span className="rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold text-slate-100">
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
                        "mt-auto inline-flex items-center justify-center rounded-[14px] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] transition",
                        "border border-transparent bg-[#2563ff] text-slate-50 hover:bg-[#1d4ed8]",
                        !selectedChallenge ? "cursor-not-allowed opacity-40" : "",
                      ].join(" ")}
                    >
                      <span className="mr-2 text-xs">▶</span>
                      Lancer le défi
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
    </div>
  );
}
