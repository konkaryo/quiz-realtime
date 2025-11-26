// web/src/pages/DailyChallengePage.tsx
import { useEffect, useMemo, useState } from "react";
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

  const year = calendar?.month.year ?? fallbackYear;
  const monthIndex = calendar ? calendar.month.month - 1 : fallbackMonthIndex;
  const monthLabel = `${MONTH_NAMES[monthIndex]} ${year}`;

  const challengeMap = useMemo(() => {
    const map = new Map<string, CalendarChallenge>();
    (calendar?.challenges ?? []).forEach((item) => {
      map.set(item.date, item);
    });
    return map;
  }, [calendar]);

  const calendarCells = useMemo(
    () => getCalendarMatrix(year, monthIndex),
    [year, monthIndex],
  );

  const selectedChallenge = selectedDate ? challengeMap.get(selectedDate) : undefined;
  const selectedProgress = selectedDate ? progress[selectedDate] : undefined;
  const selectedThemeKey = selectedChallenge ? topThemeKey(selectedChallenge.themeCounts) : null;
  const selectedThemeMeta = selectedThemeKey ? getThemeMeta(selectedThemeKey) : getThemeMeta(null);
  const selectedDifficultyLabel = difficultyLabel(selectedChallenge?.difficultyAverage ?? null);

  const todayIso = calendar?.today ?? isoFromParts(fallbackYear, fallbackMonthIndex, today.getUTCDate());
  const completedDates = useMemo(() => new Set(Object.keys(progress)), [progress]);

  return (
    <div className="relative">
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_top,_#5522aa,_#1c0c33_55%,_#060111_100%)]"
      />
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none opacity-40 mix-blend-soft-light bg-[radial-gradient(circle,_rgba(255,195,255,0.2)_0.5px,_transparent_0.5px)] bg-[length:4px_4px]"
      />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 py-10 text-white">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="uppercase tracking-[0.5em] text-sm text-white/70">Mode solo</p>
            <h1 className="font-brand m-0 text-4xl md:text-5xl tracking-wide">Défi du jour</h1>
            <p className="mt-2 max-w-xl text-white/85">
              Revenez chaque jour pour relever un nouveau challenge et grimper dans le classement mensuel.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-wide text-white/60">Mois en cours</div>
            <div className="text-lg font-semibold capitalize">{monthLabel}</div>
          </div>
        </header>

        <div className="mt-6 text-sm text-white/80">
          {loading && <span>Chargement des défis…</span>}
          {!loading && error && <span className="text-rose-200">{error}</span>}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[260px,minmax(0,1fr),280px]">
          <aside className="rounded-[22px] border border-white/15 bg-white/8 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="font-semibold uppercase tracking-wide text-sm text-white/70">Classement mensuel</div>
              <div className="text-xs text-white/50">Top 10</div>
            </div>
            <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-2 lb-scroll">
              {LEADERBOARD.map((entry, index) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="text-sm font-bold text-white/60">#{index + 1}</div>
                  <div
                    className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl text-base font-semibold text-white"
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
                    <div className="text-xs uppercase tracking-wide text-white/60">{entry.score} pts</div>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="rounded-[26px] border border-white/10 bg-white/8 p-6 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm uppercase tracking-[0.35em] text-white/60">Calendrier</div>
                <div className="text-2xl font-semibold capitalize">{MONTH_NAMES[monthIndex]}</div>
              </div>
              <div className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-white/70">
                {year}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-7 gap-2 text-center text-sm text-white/60">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="uppercase tracking-[0.35em]">
                  {label}
                </div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
              {calendarCells.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} />;
                }
                const iso = isoFromParts(year, monthIndex, day);
                const challenge = challengeMap.get(iso);
                const isToday = iso === todayIso;
                const isSelected = iso === selectedDate;
                const isCompleted = completedDates.has(iso);
                const disabled = !challenge;

                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (!disabled) setSelectedDate(iso);
                    }}
                    className={[
                      "relative flex h-14 w-full items-center justify-center rounded-2xl border text-lg font-semibold transition",
                      disabled
                        ? "border-white/5 bg-white/5 text-white/35 cursor-not-allowed"
                        : "border-white/15 bg-white/10 text-white hover:border-white/30",
                      isToday && !isSelected ? "border-white/50" : "",
                      isSelected ? "bg-white text-slate-900 shadow-lg" : "",
                    ].join(" ")}
                  >
                    <span>{day}</span>
                    {isCompleted && (
                      <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="rounded-[26px] border border-white/10 bg-white/8 p-6 backdrop-blur">
            {selectedChallenge ? (
              <div className="flex h-full flex-col">
                <div className="text-xs uppercase tracking-[0.4em] text-white/60">Défi sélectionné</div>
                <div className="mt-2 text-3xl font-semibold">
                  Défi du {selectedDate?.split("-")[2]} {MONTH_NAMES[monthIndex]}
                </div>

                <div className="mt-4 space-y-3 text-sm text-white/80">
                  <div className="flex items-center justify-between">
                    <span>Thème dominant</span>
                    <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: `${selectedThemeMeta.color}33`, color: selectedThemeMeta.color }}>
                      {selectedThemeMeta.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Difficulté</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                      {selectedDifficultyLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Nombre de questions</span>
                    <span className="font-semibold text-white">{selectedChallenge.questionCount}</span>
                  </div>
                </div>

                {selectedProgress && (
                  <div className="mt-4 rounded-2xl border border-emerald-300/40 bg-emerald-300/15 p-3 text-xs text-emerald-100">
                    Défi complété — {selectedProgress.score} bonnes réponses.
                  </div>
                )}

                <p className="mt-5 text-sm text-white/75">
                  Chaque défi journalier vous propose une sélection de questions préparées à l'avance. Pas de hasard : tout le monde joue sur le même set.
                </p>

                <button
                  type="button"
                  disabled={!selectedChallenge}
                  onClick={() => selectedDate && navigate(`/solo/daily/${selectedDate}`)}
                  className="mt-auto rounded-full border border-transparent bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Lancer le défi
                </button>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-sm text-white/70">
                <p>Aucun défi sélectionné.</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}