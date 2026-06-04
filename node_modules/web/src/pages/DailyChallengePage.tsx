import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import lockImg from "../assets/lock.png";

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
    <div className="relative min-h-full overflow-hidden text-slate-50">
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
          <linearGradient id="dailyWaveA" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#0A132E" stopOpacity="0.06" />
            <stop offset="45%" stopColor="#1C2A52" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#0A132E" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="dailyWaveB" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#101B3A" stopOpacity="0.04" />
            <stop offset="48%" stopColor="#243A70" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#101B3A" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path
          d="M-120 220 C 180 105 390 270 650 175 C 900 85 1110 175 1560 70 L1560 0 L-120 0 Z"
          fill="url(#dailyWaveA)"
        />
        <path
          d="M-120 500 C 180 390 410 545 700 440 C 980 340 1160 420 1560 330 L1560 170 C 1130 265 970 185 690 290 C 410 395 170 250 -120 350 Z"
          fill="url(#dailyWaveB)"
        />
        <path
          d="M-120 760 C 210 650 430 785 720 690 C 1010 595 1190 675 1560 575 L1560 430 C 1160 535 990 455 715 550 C 425 650 210 520 -120 620 Z"
          fill="url(#dailyWaveA)"
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
                className="relative -top-[8px] justify-self-end pr-8 text-[34px] font-semibold leading-none text-slate-300/80 transition hover:text-white focus:outline-none"
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
                className="relative -top-[8px] justify-self-start pl-8 text-[34px] font-semibold leading-none text-slate-300/80 transition hover:text-white focus:outline-none"
              >
                <span className="sr-only">Mois suivant</span>
                <span aria-hidden>›</span>
              </button>
            </div>

            <div className="grid w-full grid-cols-7 gap-1.5 text-center text-[12px] font-black uppercase tracking-[0.05em] text-slate-300/80">
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
                const isToday = cell.iso === todayIso;
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
                      ? "border-[#070B14] bg-[#020611] text-slate-600/70 opacity-55"
                      : "border-[#13213E] bg-[#050B18] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_26px_rgba(0,0,0,0.18)]",
                  canSelect && !isSelected
                    ? "hover:border-[#2D7CFF]/80 hover:bg-[#132345]"
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
                    <span className="text-[18px] font-black leading-none text-inherit">
                      {cell.day}
                    </span>

                    <span className="mt-1.5 flex h-4 items-center justify-center leading-none">
                      {isLocked ? (
                        <img
                          src={lockImg}
                          alt="Verrouillé"
                          className="h-4 w-4 opacity-55 grayscale"
                        />
                      ) : isToday ? (
                        <span
                          aria-label="Défi du jour en attente"
                          role="img"
                          className={[
                            "text-[15px] leading-none",
                            isSelected ? "text-[#050B18]" : "text-slate-200",
                          ].join(" ")}
                        >
                          ⏱
                        </span>
                      ) : (
                        <span
                          className={[
                            "inline-flex items-center gap-1 text-[13px] font-semibold drop-shadow-[0_0_8px_rgba(174,67,255,0.35)]",
                            isSelected ? "text-[#050B18]" : "text-white",
                          ].join(" ")}
                        >
                          <span
                            aria-hidden
                            className={[
                              "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] text-[10px] font-black leading-none text-white",
                              completedInfo ? "bg-emerald-500" : "bg-red-600",
                            ].join(" ")}
                          >
                            {completedInfo ? "✓" : "×"}
                          </span>
                          <span>{scoreLabel}</span>
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
                "mt-8 inline-flex items-center justify-center rounded-[6px] px-10 py-2.5 font-sans text-[15px] font-bold transition",
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
