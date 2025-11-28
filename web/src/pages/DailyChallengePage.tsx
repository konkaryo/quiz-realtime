// web/src/pages/DailyChallengePage.tsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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

const LEADERBOARD = [
  { id: 1, name: "Amélie Dupont", avatarColor: "#6366f1", score: 2140 },
  { id: 2, name: "Noah Martin", avatarColor: "#ec4899", score: 2075 },
  { id: 3, name: "Sofia Bernard", avatarColor: "#22d3ee", score: 1920 },
  { id: 4, name: "Léo Garcia", avatarColor: "#f97316", score: 1870 },
  { id: 5, name: "Emma Rossi", avatarColor: "#84cc16", score: 1765 },
  { id: 6, name: "Lucas Moreau", avatarColor: "#14b8a6", score: 1690 },
  { id: 7, name: "Mila Lambert", avatarColor: "#a855f7", score: 1655 },
  { id: 8, name: "Louis Richard", avatarColor: "#facc15", score: 1580 },
  { id: 9, name: "Jade Petit", avatarColor: "#38bdf8", score: 1495 },
  { id: 10, name: "Nina Lefèvre", avatarColor: "#ef4444", score: 1440 },
];

const STORAGE_KEY = "dailyChallenge:results:v1";

type CompletedInfo = { score: number; completedAt: string };

type CalendarChallenge = {
  date: string;
  questionCount: number;
  slotLabels: string[];
  themeCounts: Record<string, number>;
  difficultyAverage: number | null;
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

export default function DailyChallengePage() {
  const navigate = useNavigate();
  const today = new Date();
  const fallbackYear = today.getUTCFullYear();
  const fallbackMonthIndex = today.getUTCMonth();

  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, CompletedInfo>>(() => readStorage());

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
        const defaultDate = map.has(data.today)
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

  // Mois / année renvoyés par l'API = mois en cours (limite max)
  const year = calendar?.month.year ?? fallbackYear;
  const monthIndex = calendar ? calendar.month.month - 1 : fallbackMonthIndex;

  // Mois / année affichés (navigables)
  const [viewYear, setViewYear] = useState(year);
  const [viewMonthIndex, setViewMonthIndex] = useState(monthIndex);

  // Recalage de la vue quand on reçoit les données
  useEffect(() => {
    if (calendar) {
      setViewYear(calendar.month.year);
      setViewMonthIndex(calendar.month.month - 1);
    }
  }, [calendar]);

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
  const completedDates = useMemo(() => new Set(Object.keys(progress)), [progress]);

  // Navigation mois avec limite max = mois / annee de l'API
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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#050816] via-[#050014] to-[#1b0308] text-slate-50">
      {/* halo + gradient alignés avec la page de jeu */}
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

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-16 pt-8 sm:px-8 lg:px-10">
        {/* HEADER */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-600 to-rose-400 shadow-[0_0_12px_rgba(248,113,113,0.7)]">
              <span className="text-lg font-black tracking-tight">刀</span>
            </div>
            <div className="leading-tight">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">
                Mode solo
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-50">Défi du jour</div>
            </div>
          </div>
        </header>

        <div className="text-sm text-slate-200/80">
          {loading && <span>Chargement des défis…</span>}
          {!loading && error && <span className="text-rose-200">{error}</span>}
        </div>

        {/* CARTE PRINCIPALE */}
        <div className="mt-4">
          <div
            className={[
              "relative w-full rounded-[40px] border border-slate-800/80",
              "bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.96),rgba(15,23,42,0.98)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.8),#020617)]",
              "shadow-[0_30px_80px_rgba(0,0,0,0.95)]",
              "p-5 sm:p-6 lg:p-7",
            ].join(" ")}
          >
            <div className="grid gap-6 lg:grid-cols-[260px,minmax(0,1fr),280px]">
              {/* CLASSEMENT MENSUEL */}
              <aside className="rounded-[24px] border border-slate-800/80 bg-black/70 p-4 shadow-inner shadow-black/70 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-300">
                    Classement mensuel
                  </div>
                  <div className="text-[11px] text-slate-500">Top 10</div>
                </div>
                <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-2 lb-scroll">
                  {LEADERBOARD.map((entry, index) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-black/70 p-3 text-slate-50 shadow-[0_14px_35px_rgba(0,0,0,0.9)]"
                    >
                      <div className="text-xs font-bold text-slate-400">#{index + 1}</div>
                      <div
                        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl text-sm font-semibold text-slate-50"
                        style={{ background: entry.avatarColor }}
                      >
                        {entry.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{entry.name}</div>
                        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                          {entry.score} pts
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>

              {/* CALENDRIER */}
              <section className="rounded-[24px] border border-slate-800/80 bg-black/70 p-5 shadow-inner shadow-black/70 backdrop-blur-xl">
                {/* EN-TÊTE CALENDRIER */}
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
                    const isCompleted = completedDates.has(iso);
                    const disabled = !challenge;

                    if (disabled) {
                      return (
                        <button
                          key={iso}
                          type="button"
                          disabled
                          className="relative flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold cursor-not-allowed bg-transparent text-slate-600/60"
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

                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setSelectedDate(iso)}
                        className={classes}
                      >
                        <span>{day}</span>
                        {isCompleted && (
                          <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
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
                    {/* Titre retravaillé */}
                    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                      Défi du
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-50">
                      {selectedDayLabel} {selectedMonthLabel}
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

                    <p className="mt-5 text-sm text-slate-300">
                      Chaque défi journalier propose un set fixe de questions. Pas de hasard :
                      tout le monde joue sur le même terrain pour comparer les scores.
                    </p>

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
