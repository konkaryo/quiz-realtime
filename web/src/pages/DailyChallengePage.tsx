// web/src/pages/DailyChallengePage.tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type LeaderboardEntry = {
  id: number;
  name: string;
  avatarColor: string;
  score: number;
};

type DailyChallenge = {
  day: number;
  title: string;
  theme: string;
  difficulty: "Facile" | "Intermédiaire" | "Difficile";
  questionCount: number;
  description: string;
};

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

const LEADERBOARD: LeaderboardEntry[] = [
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

function buildChallenges(year: number, month: number): DailyChallenge[] {
  const themes = [
    "Culture pop",
    "Histoire",
    "Sciences",
    "Sport",
    "Arts",
    "Technologie",
    "Géographie",
  ];
  const difficulties: DailyChallenge["difficulty"][] = [
    "Facile",
    "Intermédiaire",
    "Difficile",
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const theme = themes[index % themes.length];
    const difficulty = difficulties[index % difficulties.length];
    const questionCount = 8 + ((index * 3) % 5);

    return {
      day,
      theme,
      difficulty,
      questionCount,
      title: `Défi #${day}`,
      description:
        "Relevez une série de questions minutées pour engranger des points bonus. Chaque défi accompli renforce votre classement mensuel.",
    };
  });
}

function getCalendarMatrix(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weekStartMonday = (firstDay.getDay() + 6) % 7; // 0 = lundi
  const totalCells = Math.ceil((weekStartMonday + daysInMonth) / 7) * 7;

  const cells: (number | null)[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const dayNumber = i - weekStartMonday + 1;
    cells.push(dayNumber > 0 && dayNumber <= daysInMonth ? dayNumber : null);
  }

  return cells;
}

export default function DailyChallengePage() {
  const navigate = useNavigate();
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const currentDay = today.getDate();

  const [selectedDay, setSelectedDay] = useState<number>(currentDay);

  const challenges = useMemo(() => buildChallenges(year, month), [month, year]);
  const challengeMap = useMemo(() => {
    const map = new Map<number, DailyChallenge>();
    challenges.forEach((ch) => map.set(ch.day, ch));
    return map;
  }, [challenges]);

  const calendarCells = useMemo(
    () => getCalendarMatrix(year, month),
    [month, year],
  );

  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  const selectedChallenge = challengeMap.get(selectedDay);

  return (
    <div className="relative">
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_top,_#5522aa,_#1c0c33_55%,_#060111_100%)]"
      />
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none opacity-40 mix-blend-soft-light bg-[radial-gradient(circle,_rgba(255,255,255,0.2)_0.5px,_transparent_0.5px)] bg-[length:4px_4px]"
      />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 py-10 text-white">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="uppercase tracking-[0.5em] text-sm text-white/70">Mode solo</p>
            <h1 className="font-brand m-0 text-4xl md:text-5xl tracking-wide">
              Défi du jour
            </h1>
            <p className="mt-2 max-w-xl text-white/85">
              Revenez chaque jour pour relever un nouveau challenge et grimper dans le
              classement mensuel.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-wide text-white/60">Mois en cours</div>
            <div className="text-lg font-semibold">{monthLabel}</div>
          </div>
        </header>

        <div className="mt-8 grid gap-5 lg:grid-cols-[260px,minmax(0,1fr),280px]">
          <aside className="rounded-[22px] border border-white/15 bg-white/8 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="font-semibold uppercase tracking-wide text-sm text-white/70">
                Classement mensuel
              </div>
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
                    <div className="text-xs uppercase tracking-wide text-white/60">
                      {entry.score} pts
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="rounded-[26px] border border-white/10 bg-white/8 p-6 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm uppercase tracking-[0.35em] text-white/60">Calendrier</div>
                <div className="text-2xl font-semibold capitalize">{MONTH_NAMES[month]}</div>
              </div>
              <div className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-white/70">
                {year}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-wide text-white/60">
              {WEEKDAY_LABELS.map((label, index) => (
                <div key={`${label}-${index}`} className="py-1">
                  {label}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-2 text-sm">
              {calendarCells.map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="h-12 rounded-2xl bg-transparent" />;
                }

                const isSelected = day === selectedDay;
                const isToday = day === currentDay;
                const isPast = day < currentDay;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={`
                      group flex h-12 flex-col items-center justify-center rounded-2xl border transition
                      ${isSelected
                        ? "border-white bg-white/90 text-slate-900 shadow-lg"
                        : "border-white/10 bg-white/10 text-white hover:border-white/30 hover:bg-white/20"}
                      ${isToday && !isSelected ? "ring-2 ring-white/70" : ""}
                      ${isPast && !isSelected ? "opacity-80" : ""}
                    `}
                  >
                    <span className="text-sm font-semibold">{day}</span>
                    {isToday && !isSelected ? (
                      <span className="text-[10px] uppercase tracking-wide text-white/80">Aujourd'hui</span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wide text-white/60 opacity-0 transition group-hover:opacity-100">
                        Sélectionner
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="rounded-[22px] border border-white/15 bg-white/10 p-6 backdrop-blur">
            {selectedChallenge ? (
              <div className="flex h-full flex-col">
                <div className="text-xs uppercase tracking-[0.4em] text-white/60">Défi sélectionné</div>
                <div className="mt-2 text-3xl font-semibold">{selectedChallenge.title}</div>
                <div className="mt-1 text-sm uppercase tracking-wide text-white/70">
                  {selectedChallenge.theme} · {selectedChallenge.difficulty}
                </div>
                <p className="mt-3 text-sm text-white/80">{selectedChallenge.description}</p>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-white/70">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                    <div className="text-2xl font-semibold text-white">
                      {selectedChallenge.questionCount}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-wide">Questions</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                    <div className="text-2xl font-semibold text-white">
                      {selectedDay.toString().padStart(2, "0")}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-wide">Jour du mois</div>
                  </div>
                </div>

                <div className="mt-auto pt-6">
                  <button
                    type="button"
                    onClick={() => navigate(`/solo/daily/${selectedDay}`)}
                    className="w-full rounded-2xl border border-transparent bg-white py-3 text-base font-semibold text-slate-900 transition hover:scale-[1.01] hover:bg-white"
                  >
                    Jouer le défi du {selectedDay}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-white/70">
                <div className="text-lg font-semibold">Sélectionnez un jour</div>
                <p className="mt-2 text-sm">
                  Touchez une case du calendrier pour afficher les détails du défi.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}