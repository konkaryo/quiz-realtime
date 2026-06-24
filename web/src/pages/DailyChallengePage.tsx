import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import lockImg from "../assets/lock.png";
import Background from "../components/Background";

const API_BASE = import.meta.env.VITE_API_BASE as string;
const STORAGE_KEY = "dailyChallenge:results:v1";

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

const WEEKDAY_LABELS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

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

type CalendarResponse = {
  month: { year: number; month: number };
  today: string;
  challenges: CalendarChallenge[];
};

type CalendarCell = {
  day: number;
  iso: string;
};

function isoFromDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCalendarMatrix(
  year: number,
  monthIndex: number,
): (CalendarCell | null)[] {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const weekStartMonday = (firstDay.getUTCDay() + 6) % 7;
  const totalCells = Math.ceil((weekStartMonday + daysInMonth) / 7) * 7;
  const cells: (CalendarCell | null)[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const dayNumber = i - weekStartMonday + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cells.push(null);
      continue;
    }

    cells.push({
      day: dayNumber,
      iso: isoFromParts(year, monthIndex, dayNumber),
    });
  }
  return cells;
}

function isoFromParts(year: number, monthIndex: number, day: number) {
  return isoFromDate(new Date(Date.UTC(year, monthIndex, day)));
}

function readStorage(): Record<string, CompletedInfo> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, CompletedInfo>)
      : {};
  } catch {
    return {};
  }
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
  const [viewYear, setViewYear] = useState(fallbackYear);
  const [viewMonthIndex, setViewMonthIndex] = useState(fallbackMonthIndex);
  const [progress, setProgress] = useState<Record<string, CompletedInfo>>(() =>
    readStorage(),
  );

  useEffect(() => {
    let cancelled = false;
    async function loadCalendar() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/daily/calendar`, {
          credentials: "include",
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          throw new Error(data.error || data.message || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as CalendarResponse;
        if (cancelled) return;
        setCalendar(data);
        const map = new Map<string, CalendarChallenge>();
        data.challenges.forEach((challenge) =>
          map.set(challenge.date, challenge),
        );
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
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erreur lors du chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadCalendar();
    return () => {
      cancelled = true;
    };
  }, [navigationSelectedDate]);

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

  const calendarCells = useMemo(
    () => getCalendarMatrix(viewYear, viewMonthIndex),
    [viewYear, viewMonthIndex],
  );

  const selectedChallenge = selectedDate
    ? challengeMap.get(selectedDate)
    : undefined;
  const todayIso =
    calendar?.today ??
    isoFromParts(fallbackYear, fallbackMonthIndex, today.getUTCDate());

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

      if (
        newYear > maxYear ||
        (newYear === maxYear && newMonth > maxMonthIndex)
      ) {
        return;
      }

      setViewMonthIndex(newMonth);
      setViewYear(newYear);
    },
    [monthIndex, viewMonthIndex, viewYear, year],
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
        return;

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

  return (
    <div className="relative min-h-full overflow-hidden font-inter text-slate-50">
      <Background />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 py-12 sm:px-8 lg:px-10">
        <header className="text-center">
          <h1 className="font-brandUpright text-[46px] uppercase leading-[0.9] tracking-[0.01em] text-slate-50 sm:text-[56px]">
            DÉFI DU JOUR
          </h1>
        </header>
        {(loading || error) && (
          <div className="mt-6 text-center text-sm text-slate-200/80">
            {loading && <span>Chargement des défis…</span>}
            {!loading && error && (
              <span className="text-rose-200">{error}</span>
            )}
          </div>
        )}
        {!loading && !error && (
          <div className="mx-auto mt-12 flex w-full max-w-[760px] flex-col items-center">
            <div className="mb-4 grid w-full grid-cols-[1fr_auto_1fr] items-center">
              <button
                type="button"
                onClick={() => goToMonth(-1)}
                className="relative -top-[8px] justify-self-end pr-8 font-brandUpright text-[34px] leading-none text-slate-300/80 transition hover:text-white focus:outline-none"
              >
                <span className="sr-only">Mois précédent</span>
                <span aria-hidden>‹</span>
              </button>

              <div className="min-w-[170px] text-center font-brandUpright text-[28px] uppercase leading-none tracking-[0.01em] text-slate-100 drop-shadow-[0_2px_7px_rgba(255,255,255,0.14)]">
                {MONTH_NAMES[viewMonthIndex]} {viewYear}
              </div>

              <button
                type="button"
                onClick={() => goToMonth(1)}
                className="relative -top-[8px] justify-self-start pl-8 font-brandUpright text-[34px] leading-none text-slate-300/80 transition hover:text-white focus:outline-none"
              >
                <span className="sr-only">Mois suivant</span>
                <span aria-hidden>›</span>
              </button>
            </div>

            <div className="grid w-full grid-cols-7 gap-1.5 text-center font-inter text-[12px] font-black uppercase tracking-[0.05em] text-slate-300/80">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="py-2">
                  {label}
                </div>
              ))}
            </div>

            <div className="grid w-full grid-cols-7 gap-1.5">
              {calendarCells.map((cell, index) => {
                if (!cell) {
                  return (
                    <div
                      key={`empty-${index}`}
                      aria-hidden
                      className="h-[48px]"
                    />
                  );
                }
                const isFuture = cell.iso > todayIso;
                const isSelected = cell.iso === selectedDate;
                const completedInfo = progress[cell.iso];
                const canSelect = !isFuture;
                const isLocked = isFuture;
                const scoreLabel = new Intl.NumberFormat("fr-FR").format(
                  completedInfo?.score ?? 0,
                );
                const buttonClasses = [
                  "group relative flex h-[48px] min-w-0 flex-col items-center justify-center overflow-hidden rounded-[6px] border text-center transition sm:h-[54px] lg:h-[60px]",
                  isSelected
                    ? "border-white bg-white text-[#050B18] shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_0_24px_rgba(255,255,255,0.18)]"
                    : isLocked
                      ? "border-[#1F2A4F] bg-[#111733] text-slate-500/80 opacity-65"
                      : "border-[#3E4772] bg-[#2B3158]/90 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_26px_rgba(0,0,0,0.16)]",
                  canSelect && !isSelected
                    ? "hover:border-[#7A84BB]/80 hover:bg-[#343B68]"
                    : "",
                  !canSelect ? "cursor-default" : "cursor-pointer",
                ].join(" ");

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={!canSelect}
                    onClick={() => setSelectedDate(cell.iso)}
                    className={buttonClasses}
                  >
                    <span className="font-brutal text-[18px] leading-none text-inherit">
                      {cell.day}
                    </span>

                    <span className="mt-1.5 flex h-4 items-center justify-center leading-none">
                      {isLocked ? (
                        <img
                          src={lockImg}
                          alt="Verrouillé"
                          className="h-4 w-4 opacity-55 grayscale"
                        />
                      ) : completedInfo ? (
                        <span
                          className={[
                            "inline-flex min-w-[42px] items-center justify-center rounded-[4px] border px-2 py-0.5 font-inter text-[11px] font-black leading-none",
                            isSelected
                              ? "border-emerald-700/60 bg-emerald-200 text-emerald-950"
                              : "border-emerald-400/70 bg-emerald-500/25 text-emerald-100",
                          ].join(" ")}
                        >
                          {scoreLabel}
                        </span>
                      ) : (
                        <span
                          aria-label="Défi non joué"
                          className={[
                            "inline-flex h-4 w-4 items-center justify-center rounded-[3px] font-brutal text-[12px] leading-none",
                            isSelected
                              ? "bg-slate-300 text-slate-800"
                              : "bg-slate-500/70 text-slate-200",
                          ].join(" ")}
                        >
                          ×
                        </span>
                      )}
                    </span>

                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!selectedChallenge}
              onClick={() =>
                selectedDate && navigate(`/solo/daily/${selectedDate}`)
              }
              className={[
                "mt-8 inline-flex items-center justify-center rounded-[6px] px-10 py-2.5 font-inter text-[15px] font-bold transition",
                "border border-transparent bg-[#6250C7] text-slate-50 hover:bg-[#6F5BD4]",
                !selectedChallenge ? "cursor-not-allowed opacity-40" : "",
              ].join(" ")}
            >
              Jouer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
