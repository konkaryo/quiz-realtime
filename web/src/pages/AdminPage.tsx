import { type DragEvent, useEffect, useMemo, useState } from "react";

type AdminToolId = "users" | "questions" | "games" | "dailyChallenges";

type AdminTool = {
  id: AdminToolId;
  label: string;
  title: string;
  description: string;
  emptyState: string;
};

type AdminUser = {
  id: string;
  email: string | null;
  displayName: string;
  role: "ADMIN" | "MODERATOR" | "USER" | string;
  guest: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  player: {
    id: string;
    name: string;
    img: string | null;
    bits: number;
    experience: number;
  } | null;
};

type AdminQuestion = {
  id: string;
  text: string;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  choices: Array<{
    id: string;
    label: string;
    isCorrect: boolean;
  }>;
  acceptedAnswers: Array<{
    id: string;
    text: string;
  }>;
  answersCount: number;
  dailyEntriesCount: number;
  reportsCount: number;
};

type AdminGame = {
  id: string;
  name: string | null;
  code: string | null;
  status: "OPEN" | "CLOSED" | string;
  visibility: "PUBLIC" | "PRIVATE" | string;
  image: string | null;
  difficulty: number;
  questionCount: number;
  roundSeconds: number;
  bannedThemes: string[];
  createdAt: string;
  closedAt: string | null;
  owner: {
    id: string;
    email: string | null;
    displayName: string;
    playerName: string | null;
  } | null;
  gamesCount: number;
  latestGame: {
    id: string;
    state: string;
    createdAt: string;
    playersCount: number;
  } | null;
};

type AdminDailyChallengeSummary = {
  date: string;
  questionCount: number;
  slotLabels: string[];
  themeCounts: Record<string, number>;
  difficultyAverage: number | null;
};

type AdminDailyChallengeQuestion = {
  entryId: string;
  id: string;
  text: string;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  choices: Array<{
    id: string;
    label: string;
    isCorrect: boolean;
  }>;
  acceptedNorms: string[];
  correctLabel: string;
  slotLabel: string | null;
  position: number;
};

type AdminDailyChallengeDetail = {
  id: string;
  date: string;
  questionCount: number;
  questions: AdminDailyChallengeQuestion[];
};


const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");


const adminTools: AdminTool[] = [
  {
    id: "users",
    label: "Liste des utilisateurs",
    title: "Liste des utilisateurs",
    description:
      "Consultez, recherchez et gérez les comptes joueurs depuis cet espace.",
    emptyState: "Aucun utilisateur trouvé.",
  },
  {
    id: "questions",
    label: "Liste des questions",
    title: "Liste des questions",
    description:
      "Retrouvez le catalogue de questions, leurs thèmes et leurs informations de validation.",
    emptyState: "Aucune question trouvée.",
  },
  {
    id: "games",
    label: "Liste des parties",
    title: "Liste des parties",
    description:
      "Suivez les salons et parties créés sur Synapz, qu’ils soient publics ou privés.",
    emptyState: "Aucune partie trouvée.",
  },
  {
    id: "dailyChallenges",
    label: "Défis du jour",
    title: "Défis du jour",
    description:
      "Préparez et contrôlez les défis quotidiens proposés aux joueurs.",
    emptyState: "Aucun défi du jour trouvé pour cette date.",
  },
];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function monthLabel(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

function isoFromParts(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildCalendarCells(year: number, monthIndex: number) {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const firstWeekdayMonday = (firstDay + 6) % 7;
  const totalCells = Math.ceil((firstWeekdayMonday + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const day = index - firstWeekdayMonday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
}


function UserStatusBadge({ user }: { user: AdminUser }) {
  const label = user.guest
    ? "Invité"
    : user.emailVerifiedAt
      ? "Vérifié"
      : "Email non vérifié";
  const className = user.guest
    ? "border-slate-400/30 bg-slate-400/10 text-slate-200"
    : user.emailVerifiedAt
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : "border-amber-400/30 bg-amber-400/10 text-amber-200";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>
      {label}
    </span>
  );
}

function UsersPanel({ emptyState }: { emptyState: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsers() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/admin/users`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "Vous n’avez pas accès à la liste des utilisateurs."
              : "Impossible de charger la liste des utilisateurs."
          );
        }

        const payload = (await res.json()) as { users?: AdminUser[] };
        setUsers(Array.isArray(payload.users) ? payload.users : []);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger la liste des utilisateurs.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadUsers();

    return () => {
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-5 rounded-[12px] border border-white/10 bg-[#0f172a]/60 p-6 text-sm text-white/65">
        Chargement des utilisateurs…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-5 rounded-[12px] border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-100">
        {error}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="mt-5 rounded-[12px] border border-dashed border-white/15 bg-[#0f172a]/60 p-6 text-sm leading-6 text-white/65">
        {emptyState}
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-hidden rounded-[12px] border border-white/10 bg-[#0f172a]/60">
      <div className="border-b border-white/10 px-4 py-3 text-sm font-bold text-white/80">
        {users.length} utilisateur{users.length > 1 ? "s" : ""}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-white/45">
            <tr>
              <th className="px-4 py-3 font-black">Utilisateur</th>
              <th className="px-4 py-3 font-black">Rôle</th>
              <th className="px-4 py-3 font-black">Statut</th>
              <th className="px-4 py-3 font-black">Bits</th>
              <th className="px-4 py-3 font-black">XP</th>
              <th className="px-4 py-3 font-black">Créé le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.map((user) => (
              <tr key={user.id} className="text-white/75">
                <td className="px-4 py-3">
                  <div className="flex min-w-[220px] items-center gap-3">
                    <img
                      src={user.player?.img ?? "/img/profiles/0.avif"}
                      alt=""
                      className="h-9 w-9 rounded-lg object-cover"
                      onError={(event) => {
                        event.currentTarget.src = "/img/profiles/0.avif";
                      }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-bold text-white">
                        {user.player?.name ?? user.displayName}
                      </div>
                      <div className="truncate text-xs text-white/45">
                        {user.email ?? "Compte invité"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-bold text-white/80">{user.role}</td>
                <td className="px-4 py-3">
                  <UserStatusBadge user={user} />
                </td>
                <td className="px-4 py-3 font-semibold">{user.player?.bits ?? 0}</td>
                <td className="px-4 py-3 font-semibold">{user.player?.experience ?? 0}</td>
                <td className="px-4 py-3 text-white/60">{formatDate(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuestionsPanel({ emptyState }: { emptyState: string }) {
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadQuestions() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/admin/questions`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "Vous n’avez pas accès à la liste des questions."
              : "Impossible de charger la liste des questions."
          );
        }

        const payload = (await res.json()) as { questions?: AdminQuestion[] };
        setQuestions(Array.isArray(payload.questions) ? payload.questions : []);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger la liste des questions.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadQuestions();

    return () => {
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-5 rounded-[12px] border border-white/10 bg-[#0f172a]/60 p-6 text-sm text-white/65">
        Chargement des questions…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-5 rounded-[12px] border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-100">
        {error}
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mt-5 rounded-[12px] border border-dashed border-white/15 bg-[#0f172a]/60 p-6 text-sm leading-6 text-white/65">
        {emptyState}
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-hidden rounded-[12px] border border-white/10 bg-[#0f172a]/60">
      <div className="border-b border-white/10 px-4 py-3 text-sm font-bold text-white/80">
        {questions.length} question{questions.length > 1 ? "s" : ""}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-white/45">
            <tr>
              <th className="px-4 py-3 font-black">Question</th>
              <th className="px-4 py-3 font-black">Thème</th>
              <th className="px-4 py-3 font-black">Difficulté</th>
              <th className="px-4 py-3 font-black">Réponses</th>
              <th className="px-4 py-3 font-black">Stats</th>
              <th className="px-4 py-3 font-black">Signalements</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {questions.map((question) => {
              const correctChoices = question.choices
                .filter((choice) => choice.isCorrect)
                .map((choice) => choice.label);
              const acceptedAnswers = question.acceptedAnswers.map((answer) => answer.text);
              const answersLabel = [...correctChoices, ...acceptedAnswers].join(", ") || "—";

              return (
                <tr key={question.id} className="text-white/75">
                  <td className="px-4 py-3">
                    <div className="flex min-w-[340px] items-start gap-3">
                      {question.img ? (
                        <img
                          src={question.img}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-xs font-black text-white/35">
                          Q
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="line-clamp-2 font-bold leading-5 text-white">
                          {question.text}
                        </div>
                        <div className="mt-1 text-xs text-white/40">ID : {question.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-white/80">
                    {question.theme ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-white/70">{question.difficulty ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-[260px] truncate text-white/70" title={answersLabel}>
                      {answersLabel}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    <div>{question.answersCount} réponse{question.answersCount > 1 ? "s" : ""}</div>
                    <div className="text-xs text-white/45">
                      {question.dailyEntriesCount} défi{question.dailyEntriesCount > 1 ? "s" : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold text-white/80">
                    {question.reportsCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GamesPanel({ emptyState }: { emptyState: string }) {
  const [games, setGames] = useState<AdminGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGames() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/admin/games`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "Vous n’avez pas accès à la liste des parties."
              : "Impossible de charger la liste des parties."
          );
        }

        const payload = (await res.json()) as { games?: AdminGame[] };
        setGames(Array.isArray(payload.games) ? payload.games : []);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger la liste des parties.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadGames();

    return () => {
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-5 rounded-[12px] border border-white/10 bg-[#0f172a]/60 p-6 text-sm text-white/65">
        Chargement des parties…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-5 rounded-[12px] border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-100">
        {error}
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="mt-5 rounded-[12px] border border-dashed border-white/15 bg-[#0f172a]/60 p-6 text-sm leading-6 text-white/65">
        {emptyState}
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-hidden rounded-[12px] border border-white/10 bg-[#0f172a]/60">
      <div className="border-b border-white/10 px-4 py-3 text-sm font-bold text-white/80">
        {games.length} partie{games.length > 1 ? "s" : ""}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-white/45">
            <tr>
              <th className="px-4 py-3 font-black">Partie</th>
              <th className="px-4 py-3 font-black">Hôte</th>
              <th className="px-4 py-3 font-black">Statut</th>
              <th className="px-4 py-3 font-black">Configuration</th>
              <th className="px-4 py-3 font-black">Joueurs</th>
              <th className="px-4 py-3 font-black">Créée le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {games.map((game) => {
              const ownerLabel = game.owner?.playerName ?? game.owner?.displayName ?? "—";
              const statusClass = game.status === "OPEN"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-slate-400/30 bg-slate-400/10 text-slate-200";

              return (
                <tr key={game.id} className="text-white/75">
                  <td className="px-4 py-3">
                    <div className="flex min-w-[260px] items-center gap-3">
                      {game.image ? (
                        <img
                          src={game.image}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-xs font-black text-white/35">
                          P
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-bold text-white">
                          {game.name ?? `Partie ${game.id}`}
                        </div>
                        <div className="mt-1 text-xs text-white/40">
                          {game.code ? `Code : ${game.code}` : `ID : ${game.id}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white/80">{ownerLabel}</div>
                    <div className="text-xs text-white/45">{game.owner?.email ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass}`}>
                        {game.status}
                      </span>
                      <span className="text-xs font-semibold text-white/50">{game.visibility}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    <div>{game.questionCount} questions · {game.roundSeconds}s</div>
                    <div className="text-xs text-white/45">Difficulté {game.difficulty}</div>
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    <div>{game.latestGame?.playersCount ?? 0} joueur{(game.latestGame?.playersCount ?? 0) > 1 ? "s" : ""}</div>
                    <div className="text-xs text-white/45">
                      {game.gamesCount} session{game.gamesCount > 1 ? "s" : ""}
                      {game.latestGame ? ` · ${game.latestGame.state}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    <div>{formatDate(game.createdAt)}</div>
                    {game.closedAt ? (
                      <div className="text-xs text-white/40">Fermée le {formatDate(game.closedAt)}</div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DailyChallengesPanel({ emptyState }: { emptyState: string }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getUTCFullYear());
  const [viewMonthIndex, setViewMonthIndex] = useState(today.getUTCMonth());
  const [todayIso, setTodayIso] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<AdminDailyChallengeSummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<AdminDailyChallengeDetail | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const [questionSearch, setQuestionSearch] = useState("");
  const [questionSearchResults, setQuestionSearchResults] = useState<AdminQuestion[]>([]);
  const [questionSearchLoading, setQuestionSearchLoading] = useState(false);
  const [insertLoading, setInsertLoading] = useState(false);
  const [insertError, setInsertError] = useState<string | null>(null);

  const challengesByDate = useMemo(() => {
    return new Map(challenges.map((challenge) => [challenge.date, challenge]));
  }, [challenges]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCalendar() {
      setCalendarLoading(true);
      setCalendarError(null);

      try {
        const month = `${viewYear}-${String(viewMonthIndex + 1).padStart(2, "0")}`;
        const res = await fetch(`${API_BASE}/admin/daily?month=${month}`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "Vous n’avez pas accès aux défis du jour."
              : "Impossible de charger le calendrier des défis."
          );
        }

        const payload = (await res.json()) as {
          today?: string;
          challenges?: AdminDailyChallengeSummary[];
        };
        const nextChallenges = Array.isArray(payload.challenges) ? payload.challenges : [];
        setTodayIso(payload.today ?? null);
        setChallenges(nextChallenges);

        const selectedIsInMonth = selectedDate?.startsWith(month) ?? false;
        if (!selectedIsInMonth) {
          const defaultDate = nextChallenges.some((challenge) => challenge.date === payload.today)
            ? payload.today ?? null
            : nextChallenges[0]?.date ?? null;
          setSelectedDate(defaultDate);
        }
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setChallenges([]);
        setSelectedDate(null);
        setCalendarError(loadError instanceof Error ? loadError.message : "Impossible de charger le calendrier des défis.");
      } finally {
        if (!controller.signal.aborted) setCalendarLoading(false);
      }
    }

    void loadCalendar();

    return () => {
      controller.abort();
    };
  }, [selectedDate, viewMonthIndex, viewYear]);

  useEffect(() => {
    if (!selectedDate) {
      setSelectedChallenge(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadChallenge() {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const res = await fetch(`${API_BASE}/admin/daily/${selectedDate}`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (res.status === 404) {
          setSelectedChallenge(null);
          return;
        }

        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "Vous n’avez pas accès à ce défi du jour."
              : "Impossible de charger les questions du défi."
          );
        }

        const payload = (await res.json()) as { challenge?: AdminDailyChallengeDetail };
        setSelectedChallenge(payload.challenge ?? null);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setSelectedChallenge(null);
        setDetailError(loadError instanceof Error ? loadError.message : "Impossible de charger les questions du défi.");
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    }

    void loadChallenge();

    return () => {
      controller.abort();
    };
  }, [selectedDate]);

  useEffect(() => {
    const query = questionSearch.trim();
    setInsertError(null);

    if (!selectedDate || query.length === 0) {
      setQuestionSearchResults([]);
      setQuestionSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setQuestionSearchLoading(true);

      try {
        const res = await fetch(`${API_BASE}/admin/questions/search?q=${encodeURIComponent(query)}`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error("Impossible de rechercher cette question.");
        }

        const payload = (await res.json()) as { questions?: AdminQuestion[] };
        setQuestionSearchResults(Array.isArray(payload.questions) ? payload.questions : []);
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") return;
        setQuestionSearchResults([]);
        setInsertError(searchError instanceof Error ? searchError.message : "Impossible de rechercher cette question.");
      } finally {
        if (!controller.signal.aborted) setQuestionSearchLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [questionSearch, selectedDate]);

  function getReorderedQuestions(
    questions: AdminDailyChallengeQuestion[],
    sourceEntryId: string,
    targetEntryId: string,
  ) {
    const sourceIndex = questions.findIndex((question) => question.entryId === sourceEntryId);
    const targetIndex = questions.findIndex((question) => question.entryId === targetEntryId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return questions;

    const nextQuestions = [...questions];
    const [movedQuestion] = nextQuestions.splice(sourceIndex, 1);
    nextQuestions.splice(targetIndex, 0, movedQuestion);

    return nextQuestions.map((question, index) => ({
      ...question,
      position: index + 1,
    }));
  }


  async function persistQuestionOrder(nextQuestions: AdminDailyChallengeQuestion[]) {
    if (!selectedChallenge) return;

    setOrderSaving(true);
    setDetailError(null);

    try {
      const res = await fetch(`${API_BASE}/admin/daily/${selectedChallenge.date}/reorder`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryIds: nextQuestions.map((question) => question.entryId) }),
      });

      if (!res.ok) {
        throw new Error("Impossible d’enregistrer le nouvel ordre des questions.");
      }

      const payload = (await res.json()) as { challenge?: AdminDailyChallengeDetail };
      if (payload.challenge) {
        setSelectedChallenge(payload.challenge);
      }
    } catch (saveError) {
      setDetailError(saveError instanceof Error ? saveError.message : "Impossible d’enregistrer le nouvel ordre des questions.");
    } finally {
      setOrderSaving(false);
    }
  }

  function moveQuestionPreview(sourceEntryId: string, targetEntryId: string) {
    if (sourceEntryId === targetEntryId) return;

    setSelectedChallenge((current) => {
      if (!current) return current;
      const nextQuestions = getReorderedQuestions(current.questions, sourceEntryId, targetEntryId);
      if (nextQuestions === current.questions) return current;
      return { ...current, questions: nextQuestions };
    });
  }

  function handleQuestionDrop(event: DragEvent<HTMLElement>, targetEntryId: string) {
    event.preventDefault();
    const sourceEntryId = event.dataTransfer.getData("text/plain") || draggedEntryId;
    setDraggedEntryId(null);
    if (!sourceEntryId || !selectedChallenge) return;

    const nextQuestions = getReorderedQuestions(selectedChallenge.questions, sourceEntryId, targetEntryId);
    setSelectedChallenge({ ...selectedChallenge, questions: nextQuestions });
    void persistQuestionOrder(nextQuestions);
  }

  async function insertQuestionIntoChallenge(question: AdminQuestion) {
    if (!selectedDate) return;

    setInsertLoading(true);
    setInsertError(null);

    try {
      const res = await fetch(`${API_BASE}/admin/daily/${selectedDate}/questions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        challenge?: AdminDailyChallengeDetail;
        error?: string;
      };

      if (!res.ok) {
        const message = payload.error === "daily_challenge_full"
          ? "Ce défi contient déjà 15 questions."
          : payload.error === "question_already_in_challenge"
            ? "Cette question est déjà intégrée à ce défi."
            : "Impossible d’insérer cette question dans le défi.";
        throw new Error(message);
      }

      if (payload.challenge) {
        const updatedChallenge = payload.challenge;
        setSelectedChallenge(updatedChallenge);
        setChallenges((current) => {
          const exists = current.some((challenge) => challenge.date === updatedChallenge.date);
          const nextSummary: AdminDailyChallengeSummary = {
            date: updatedChallenge.date,
            questionCount: updatedChallenge.questionCount,
            slotLabels: updatedChallenge.questions.map((question) => question.slotLabel ?? ""),
            themeCounts: updatedChallenge.questions.reduce<Record<string, number>>((acc, question) => {
              if (question.theme) acc[question.theme] = (acc[question.theme] ?? 0) + 1;
              return acc;
            }, {}),
            difficultyAverage: null,
          };

          const next = exists
            ? current.map((challenge) => challenge.date === nextSummary.date ? nextSummary : challenge)
            : [...current, nextSummary];

          return next.sort((a, b) => a.date.localeCompare(b.date));
        });
      }

      setQuestionSearch("");
      setQuestionSearchResults([]);
    } catch (insertErrorValue) {
      setInsertError(insertErrorValue instanceof Error ? insertErrorValue.message : "Impossible d’insérer cette question dans le défi.");
    } finally {
      setInsertLoading(false);
    }
  }


  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(viewYear, viewMonthIndex + delta, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonthIndex(next.getUTCMonth());
  }

  const calendarCells = buildCalendarCells(viewYear, viewMonthIndex);

  return (
    <div className="mt-5 flex flex-col gap-5">
      <section className="w-full max-w-[420px] rounded-[12px] border border-white/10 bg-[#0f172a]/60 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-white/70 hover:bg-white/[0.08] hover:text-white"
          >
            ←
          </button>
          <div className="text-center font-bold capitalize text-white">
            {monthLabel(viewYear, viewMonthIndex)}
          </div>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-white/70 hover:bg-white/[0.08] hover:text-white"
          >
            →
          </button>
        </div>

        {calendarError ? (
          <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            {calendarError}
          </div>
        ) : null}

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-black uppercase tracking-[0.12em] text-white/35">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => (
            <div key={`${day}-${index}`} className="py-2">{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} className="aspect-square" />;

            const dateIso = isoFromParts(viewYear, viewMonthIndex, day);
            const summary = challengesByDate.get(dateIso);
            const isSelected = selectedDate === dateIso;
            const isToday = todayIso === dateIso;

            return (
              <button
                key={dateIso}
                type="button"
                onClick={() => setSelectedDate(dateIso)}
                className={`aspect-square rounded-lg border p-1 text-left transition ${
                  isSelected
                    ? "border-[#eacb4d]/80 bg-[#eacb4d]/20 text-white"
                    : summary
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/15"
                      : "border-white/10 bg-white/[0.03] text-white/45 hover:bg-white/[0.07] hover:text-white/75"
                }`}
              >
                <span className="block text-sm font-black">{day}</span>
                {summary ? (
                  <span className="mt-1 block text-[10px] font-bold text-white/65">
                    {summary.questionCount} q.
                  </span>
                ) : null}
                {isToday ? <span className="mt-1 block h-1 w-1 rounded-full bg-[#eacb4d]" /> : null}
              </button>
            );
          })}
        </div>

        {calendarLoading ? (
          <div className="mt-3 text-sm text-white/55">Chargement du calendrier…</div>
        ) : null}
      </section>

      <section className="w-full rounded-[12px] border border-white/10 bg-[#0f172a]/60 p-4">

        {detailLoading ? (
          <div className="rounded-[12px] border border-white/10 bg-white/[0.03] p-6 text-sm text-white/65">
            Chargement des questions du défi…
          </div>
        ) : null}

        {!detailLoading && detailError ? (
          <div className="rounded-[12px] border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-100">
            {detailError}
          </div>
        ) : null}

        {!detailLoading && !detailError && selectedDate && (selectedChallenge?.questionCount ?? 0) < 15 ? (
          <div className="mb-3 rounded-[12px] border border-white/10 bg-white/[0.035] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-bold text-white/75">
                Rechercher une question par identifiant
                <input
                  type="search"
                  value={questionSearch}
                  onChange={(event) => setQuestionSearch(event.target.value)}
                  placeholder="Identifiant de question"
                  className="h-10 rounded-lg border border-white/10 bg-[#0f172a] px-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/30 focus:border-[#eacb4d]/70"
                />
              </label>

              <div className="min-w-0 flex-[1.4] rounded-lg border border-white/10 bg-[#0f172a]/70 p-2 text-sm text-white/70">
                {questionSearchLoading ? "Recherche…" : null}
                {!questionSearchLoading && questionSearch.trim() && questionSearchResults.length === 0 ? "Aucune question trouvée." : null}
                {!questionSearchLoading && !questionSearch.trim() ? "Saisissez un identifiant pour afficher les questions correspondantes." : null}
                {!questionSearchLoading && questionSearchResults.length > 0 ? (
                  <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto">
                    {questionSearchResults.map((question) => (
                      <div
                        key={question.id}
                        className="flex min-w-0 flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-2 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-bold text-white">{question.id}</div>
                          <div className="truncate text-xs text-white/55">{question.text}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void insertQuestionIntoChallenge(question)}
                          disabled={insertLoading}
                          className="h-9 rounded-lg border border-[#eacb4d]/40 bg-[#eacb4d]/15 px-3 text-xs font-black text-[#f7df7b] transition hover:bg-[#eacb4d]/20 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {insertLoading ? "Insertion…" : "Insérer"}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            {insertError ? <div className="mt-3 text-sm font-semibold text-red-200">{insertError}</div> : null}
          </div>
        ) : null}

        {!detailLoading && !detailError && !selectedChallenge ? (
          <div className="rounded-[12px] border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm leading-6 text-white/65">
            {emptyState}
          </div>
        ) : null}

        {!detailLoading && !detailError && selectedChallenge ? (
          <div className="flex flex-col gap-3">
            {selectedChallenge.questions.map((question) => {
              const themeCode = (question.theme ?? "—")
                .slice(0, 3)
                .toUpperCase();

              const difficultyValue = Math.min(
                4,
                Math.max(1, Number.parseInt(question.difficulty ?? "1", 10) || 1)
              );

              const difficultyColor =
                difficultyValue === 4
                  ? "bg-red-500"
                  : difficultyValue === 3
                    ? "bg-orange-400"
                    : difficultyValue === 2
                      ? "bg-[#eacb4d]"
                      : "bg-emerald-400";

              return (
                <article
                  key={question.entryId}
                  draggable={!orderSaving}
                  onDragStart={(event) => {
                    setDraggedEntryId(question.entryId);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", question.entryId);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (draggedEntryId) {
                      moveQuestionPreview(draggedEntryId, question.entryId);
                    }
                  }}
                  onDrop={(event) => handleQuestionDrop(event, question.entryId)}
                  onDragEnd={() => setDraggedEntryId(null)}
                  className={`rounded-[6px] border px-4 py-4 shadow-[0_6px_16px_rgba(0,0,0,.12)] transition-all ${
                    draggedEntryId === question.entryId
                      ? "border-[#eacb4d]/55 bg-[#eacb4d]/10 opacity-80"
                      : "border-white/[0.09] bg-white/[0.025] hover:border-white/[0.16] hover:bg-white/[0.04]"
                  } ${orderSaving ? "cursor-wait" : "cursor-grab active:cursor-grabbing"}`}
                >
                  <div className="flex items-center gap-5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] border border-white/[0.14] bg-transparent text-[11px] font-semibold text-white/65">
                      {question.position}
                    </div>

                    <h4 className="min-w-0 flex-1 text-[14px] font-semibold leading-6 text-white/95">
                      {question.text}
                    </h4>

                    <div className="flex shrink-0 items-center gap-8">
                      <span className="min-w-[32px] text-center text-[10px] font-black uppercase tracking-[0.035em] text-white/90">
                        {themeCode}
                      </span>

                      <span
                        aria-label={`Difficulté ${question.difficulty ?? "—"}`}
                        title={`Difficulté ${question.difficulty ?? "—"}`}
                        className="flex w-4 flex-col gap-[2px]"
                      >
                        {Array.from({ length: 4 }).map((_, index) => {
                          const isActive = index >= 4 - difficultyValue;

                          return (
                            <span
                              key={index}
                              className={`h-[3px] w-full rounded-none ${
                                isActive ? difficultyColor : "bg-white/[0.18]"
                              }`}
                            />
                          );
                        })}
                      </span>

                      <div className="flex w-2 flex-col items-center justify-center gap-[3px] text-white/75">
                        <span className="h-[3px] w-[3px] rounded-full bg-current" />
                        <span className="h-[3px] w-[3px] rounded-full bg-current" />
                        <span className="h-[3px] w-[3px] rounded-full bg-current" />
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}


function ToolContent({ selectedTool }: { selectedTool: AdminTool }) {
  if (selectedTool.id === "users") {
    return <UsersPanel emptyState={selectedTool.emptyState} />;
  }

  if (selectedTool.id === "questions") {
    return <QuestionsPanel emptyState={selectedTool.emptyState} />;
  }

  if (selectedTool.id === "games") {
    return <GamesPanel emptyState={selectedTool.emptyState} />;
  }

  if (selectedTool.id === "dailyChallenges") {
    return <DailyChallengesPanel emptyState={selectedTool.emptyState} />;
  }

  return (
    <div className="mt-5 rounded-[12px] border border-dashed border-white/15 bg-[#0f172a]/60 p-6 text-sm leading-6 text-white/65">
      {selectedTool.emptyState}
    </div>
  );
}


export default function AdminPage() {
  const [selectedToolId, setSelectedToolId] = useState<AdminToolId>(adminTools[0].id);
  const selectedTool = useMemo(
    () => adminTools.find((tool) => tool.id === selectedToolId) ?? adminTools[0],
    [selectedToolId]
  );
  return (
    <div className="relative min-h-full overflow-hidden text-white">
      <div aria-hidden className="fixed inset-0 bg-[#060A19]" />

      <div className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 py-8 sm:px-5 lg:flex-row">
        <aside className="w-full shrink-0 rounded-[14px] border border-white/10 bg-[#111827]/90 p-4 shadow-[0_12px_28px_rgba(0,0,0,.3)] lg:fixed lg:left-[max(1.25rem,calc((100vw-1180px)/2+1.25rem))] lg:top-[84px] lg:z-20 lg:max-h-[calc(100dvh-104px)] lg:w-[280px] lg:overflow-y-auto">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#eacb4d]">
            Outils admin
          </p>
          <nav aria-label="Outils d’administration" className="flex flex-col gap-2">
            {adminTools.map((tool) => {
              const isSelected = selectedTool.id === tool.id;

              return (
                <button
                  key={tool.id}
                  type="button"
                  aria-current={isSelected ? "page" : undefined}
                  onClick={() => setSelectedToolId(tool.id)}
                  className={`rounded-[10px] border px-4 py-3 text-left text-sm font-bold transition ${
                    isSelected
                      ? "border-[#eacb4d]/70 bg-[#eacb4d]/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.08)]"
                      : "border-white/10 bg-white/[0.04] text-white/72 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  {tool.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 lg:ml-[304px]">
          <header className="mb-7">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-[#eacb4d]">
              Accès administrateur
            </p>
            <h1 className="text-[34px] font-brand italic leading-none text-white sm:text-[46px]">
              Administration
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
              Sélectionnez un outil dans le menu de gauche pour administrer Synapz.
            </p>
          </header>

          <section className="rounded-[14px] border border-white/10 bg-[#1E2030] p-5 shadow-[0_12px_28px_rgba(0,0,0,.3)] sm:p-6">
            <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">
                  {selectedTool.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
                  {selectedTool.description}
                </p>
              </div>

              <span className="inline-flex w-fit rounded-full border border-[#eacb4d]/40 bg-[#eacb4d]/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#f7df7b]">
                Admin
              </span>
            </div>

            <ToolContent selectedTool={selectedTool} />
          </section>
        </main>
      </div>
    </div>
  );
}