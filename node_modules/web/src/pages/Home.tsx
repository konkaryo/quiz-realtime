// web/src/pages/Home.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Clock3, Plus } from "lucide-react";
import { io } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_BASE as string;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? (typeof window !== "undefined" ? window.location.origin : "");
const PUBLIC_ROOMS_UPDATED_EVENT = "public_rooms_updated";

type RoomPlayer = { id: string; name: string; img: string };
type RoomListItem = { id: string; name?: string | null; image?: string | null; difficulty?: number; playerCount?: number; questionCount?: number; progressCount?: number; players?: RoomPlayer[] };
type RoomDetail = { id: string; code?: string | null };
type CalendarChallenge = { date: string; completed?: boolean };
type ApiPayload = Record<string, unknown>;

const weekdays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function difficulty(value?: number) {
  const score = Number.isFinite(value) ? value! : 50;
  return score <= 25 ? 1 : score <= 50 ? 2 : score <= 75 ? 3 : 4;
}

function isoWeek(date: Date) {
  const thursday = new Date(date);
  thursday.setHours(0, 0, 0, 0);
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));
  const weekYear = thursday.getFullYear();
  const firstThursday = new Date(weekYear, 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604_800_000);
  return `${weekYear} - S${String(week).padStart(2, "0")}`;
}

export default function Home() {
  const nav = useNavigate();

  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("utilisateur");
  const [isGuest, setIsGuest] = useState(true);
  const [clock, setClock] = useState(() => Date.now());
  const [weekOffset, setWeekOffset] = useState(0);
  const [challenges, setChallenges] = useState<CalendarChallenge[]>([]);
  const currentDate = useMemo(() => new Date(clock), [clock]);
  const today = isoDate(currentDate);
  const weekStart = useMemo(() => {
    const start = new Date(currentDate);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    start.setDate(start.getDate() + weekOffset * 7);
    return start;
  }, [currentDate, weekOffset]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  }), [weekStart]);
  const calendarMonths = Array.from(new Set(weekDates.map((date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`))).join(",");
  const weekLabel = isoWeek(weekStart);

  async function fetchJSON(path: string, init?: RequestInit): Promise<ApiPayload> {
    const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
    const data: ApiPayload = (res.headers.get("content-type") || "").includes("application/json") ? await res.json() : {};
    if (!res.ok) throw new Error(String(data.error || data.message || `HTTP ${res.status}`));
    return data;
  }

  const loadRooms = useCallback(async (spinner = true) => {
    if (spinner) setLoading(true);
    setErr(null);
    try {
      const data = await fetchJSON("/rooms");
      setRooms((Array.isArray(data.rooms) ? data.rooms as RoomListItem[] : []).sort((a, b) => (a.difficulty ?? 999) - (b.difficulty ?? 999)));
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : "Impossible de charger les parties");
    } finally {
      if (spinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRooms();
    fetchJSON("/auth/me").then((data) => {
      const user = data.user as { displayName?: string; guest?: boolean } | undefined;
      setDisplayName(user?.displayName?.trim() || "utilisateur");
      setIsGuest(user?.guest ?? true);
    }).catch(() => undefined);
  }, [loadRooms]);

  useEffect(() => {
    Promise.all(calendarMonths.split(",").map((month) => fetchJSON(`/daily/calendar?month=${month}`)))
      .then((payloads) => setChallenges(payloads.flatMap((data) => Array.isArray(data.challenges) ? data.challenges as CalendarChallenge[] : [])))
      .catch(() => setChallenges([]));
  }, [calendarMonths]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);


  useEffect(() => {
    const socket = io(SOCKET_URL, { path: "/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    const refresh = () => void loadRooms(false);
    socket.on("connect", refresh);
    socket.on(PUBLIC_ROOMS_UPDATED_EVENT, refresh);
    return () => { socket.off("connect", refresh); socket.off(PUBLIC_ROOMS_UPDATED_EVENT, refresh); socket.close(); };
  }, [loadRooms]);

  async function openRoom(roomId: string) {
    try {
      const data = await fetchJSON(`/rooms/${roomId}`) as { room: RoomDetail };
      const code = (data.room?.code ?? "").trim();
      const enter = () => { sessionStorage.setItem("join-loading", "1"); nav(`/room/${roomId}`); };
      if (!code) return enter();
      const input = (prompt("Cette room est privée. Entrez le code :") || "").trim().toUpperCase();
      if (input && input === code.toUpperCase()) enter(); else if (input) alert("Code invalide.");
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Impossible d'ouvrir la room");
    }
  }

  const challengeMap = new Map(challenges.map((challenge) => [challenge.date, challenge]));
  const nextDay = new Date(clock);
  nextDay.setHours(24, 0, 0, 0);
  const remainingMinutes = Math.max(0, Math.ceil((nextDay.getTime() - clock) / 60_000));
  const remainingLabel = `${Math.floor(remainingMinutes / 60)}h ${String(remainingMinutes % 60).padStart(2, "0")}m`;

  return (
    <main className="min-h-[calc(100dvh-52px)] bg-[#11131f] px-5 pb-6 pt-10 text-white sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-[1440px] gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-10">
        <div className="min-w-0 space-y-10">
          <section className="relative isolate min-h-[240px] overflow-hidden rounded-2xl border border-white/10 bg-[#12172a] shadow-2xl xl:w-[90%]">
            <img src={`${API_BASE}/img/interface/home_01.png`} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#080b19]/95 via-[#0b1020]/75 to-transparent" />
            <div className="relative flex min-h-[240px] max-w-xl flex-col justify-center p-6 sm:px-10 sm:py-7">
              <h1 className="font-brutal text-[24px] leading-tight sm:text-[32px]">{isGuest ? "Bienvenue sur Synapz" : `Bonjour ${displayName} !`}</h1>
              <p className="mt-1 bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-[18px] font-bold text-transparent sm:text-[24px]">Prêt à tester tes connaissances ?</p>
              <p className="mt-3 max-w-md font-inter text-white/80 text-[14px]">Rejoins tes amis avec un code d’invitation ou crée ta propre partie en quelques secondes.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link to="/private/join" className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-[13px] font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:bg-violet-500">Rejoindre une partie <ArrowRight size={17} /></Link>
                <Link to="/rooms/new" className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-[13px] font-semibold text-white backdrop-blur transition hover:bg-white/10">Créer une partie <Plus size={17} /></Link>
              </div>
            </div>
          </section>

          <section className="xl:w-[90%]" aria-labelledby="multiplayer-title">
            <h2 id="multiplayer-title" className="mb-4 font-brandUpright text-[22px] uppercase leading-none tracking-[0.05em] text-white/95">Parties multijoueurs</h2>
            {loading && <div className="rounded-xl border border-white/10 bg-white/[.03] p-10 text-center text-sm text-white/60">Chargement des parties…</div>}
            {err && <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-5 text-sm text-red-300">{err}</div>}
            {!loading && !err && rooms.length === 0 && <div className="rounded-xl border border-dashed border-white/15 bg-white/[.02] p-10 text-center text-sm text-white/55">Aucune partie publique disponible pour le moment.</div>}
            {!loading && !err && rooms.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{rooms.map((room) => {
              const playerCount = Math.max(0, Number(room.playerCount) || 0);
              const visiblePlayers = room.players?.slice(0, 3) ?? [];
              const additionalPlayers = Math.max(0, playerCount - visiblePlayers.length);
              const difficultyLevel = difficulty(room.difficulty);
              const difficultyLabel = ["Facile", "Modérée", "Difficile", "Extrême"][difficultyLevel - 1];
              const roomName = room.name?.trim() || `Partie ${difficultyLabel}`;
              return <button key={room.id} type="button" onClick={() => openRoom(room.id)} aria-label={`Rejoindre ${roomName}`} className="group relative isolate aspect-[5/6] overflow-hidden rounded-[14px] border border-white/10 bg-[#07101e] text-left shadow-lg [backface-visibility:hidden] transform-gpu transition hover:-translate-y-1 hover:ring-2 hover:ring-white hover:shadow-cyan-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                {room.image && <img src={`${API_BASE}/img/interface/${room.image}.avif`} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
                <div className="absolute inset-0 bg-gradient-to-t from-[#030711] via-[#050a14]/75 to-black/5" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="flex items-start gap-2"><h3 className="break-words font-brand text-[23px] uppercase leading-none text-white">{roomName}</h3><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-lime-400" aria-label="Partie disponible" /></div>
                  <p className="mt-1 font-acuminMedium text-sm italic text-white/50">Classique · {difficultyLabel}</p>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center pl-1">
                      {visiblePlayers.map((player, index) => <img key={player.id} src={`${API_BASE}${player.img}`} alt={player.name} title={player.name} className={`h-7 w-7 rounded-full border-2 border-[#080c16] object-cover ${index > 0 ? "-ml-2.5" : ""}`} />)}
                      {additionalPlayers > 0 && <span className="ml-1 text-sm font-bold text-white">+{additionalPlayers}</span>}
                      {playerCount === 0 && <span className="text-xs text-white/45">Aucun joueur</span>}
                    </div>
                    <span className="shrink-0 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-cyan-50 transition group-hover:bg-white group-hover:text-black">Rejoindre</span>
                  </div>
                </div>
              </button>;
            })}</div>}
          </section>
        </div>

        <aside className="h-fit xl:sticky xl:top-20" aria-labelledby="daily-title">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="daily-title" className="font-brandUpright text-[22px] uppercase leading-none tracking-[0.05em] text-white/95">Défi du jour</h2>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-400" aria-label={`Temps restant : ${remainingLabel}`}><Clock3 size={17} aria-hidden="true" />{remainingLabel}</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#191c2c] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <button type="button" onClick={() => setWeekOffset((offset) => offset - 1)} aria-label="Semaine précédente" className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white"><ChevronLeft size={18} /></button>
              <p className="text-sm font-semibold text-white">{weekLabel}</p>
              <button type="button" onClick={() => setWeekOffset((offset) => offset + 1)} aria-label="Semaine suivante" className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white"><ChevronRight size={18} /></button>
            </div>
            <div className="grid grid-cols-7 gap-2">{weekDates.map((date, index) => {
              const key = isoDate(date); const item = challengeMap.get(key); const isToday = key === today;
              return <Link key={key} to={item ? `/solo/daily/${key}` : "/solo/daily"} className={`flex aspect-square min-w-0 flex-col items-center justify-center rounded-lg border text-center transition ${isToday ? "border-violet-400 bg-violet-600 font-bold text-white" : item?.completed ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : item ? "border-cyan-400/50 bg-cyan-400/5 text-cyan-300 hover:bg-cyan-400/10" : "border-white/10 bg-white/[.02] text-white/45 hover:bg-white/5"}`} aria-label={`${weekdays[index]} ${date.getDate()}${item?.completed ? ", défi terminé" : item ? ", défi disponible" : ""}`}><span className="text-[9px] uppercase">{weekdays[index]}</span><span className="mt-0.5 text-sm">{date.getDate()}</span></Link>;
            })}</div>
            <Link to="/solo/daily" className="mt-6 flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500">Jouer</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
