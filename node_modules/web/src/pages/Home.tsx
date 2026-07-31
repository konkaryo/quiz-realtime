// web/src/pages/Home.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Clock3, Plus } from "lucide-react";
import { io } from "socket.io-client";
import playerIcon from "../assets/player.png";
import cardsIcon from "../assets/cards.png";

const API_BASE = import.meta.env.VITE_API_BASE as string;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? (typeof window !== "undefined" ? window.location.origin : "");
const PUBLIC_ROOMS_UPDATED_EVENT = "public_rooms_updated";

type RoomListItem = { id: string; name?: string | null; image?: string | null; difficulty?: number; playerCount?: number; questionCount?: number; progressCount?: number };
type RoomDetail = { id: string; code?: string | null };
type CalendarChallenge = { date: string; completed?: boolean };
type ApiPayload = Record<string, unknown>;

const weekdays = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function difficulty(value?: number) {
  const score = Number.isFinite(value) ? value! : 50;
  return score <= 25 ? 1 : score <= 50 ? 2 : score <= 75 ? 3 : 4;
}

export default function Home() {
  const nav = useNavigate();

  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("utilisateur");
  const [isGuest, setIsGuest] = useState(true);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [clock, setClock] = useState(() => Date.now());
  const [challenges, setChallenges] = useState<CalendarChallenge[]>([]);
  const today = useMemo(() => isoDate(new Date()), []);

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
    const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    fetchJSON(`/daily/calendar?month=${monthKey}`).then((data) => setChallenges(Array.isArray(data.challenges) ? data.challenges as CalendarChallenge[] : [])).catch(() => setChallenges([]));
  }, [month]);

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

  const firstWeekday = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const challengeMap = new Map(challenges.map((challenge) => [challenge.date, challenge]));
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(month);
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
              <h1 className="font-brutal text-3xl leading-tight sm:text-4xl">{isGuest ? "Bienvenue sur Synapz" : `Bonjour ${displayName} !`}</h1>
              <p className="mt-2 bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-xl font-bold text-transparent sm:text-2xl">Prêt à tester tes connaissances ?</p>
              <p className="mt-3 max-w-md text-base leading-relaxed text-slate-300">Rejoins tes amis avec un code d’invitation ou crée ta propre partie en quelques secondes.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link to="/private/join" className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:bg-violet-500">Rejoindre une partie <ArrowRight size={17} /></Link>
                <Link to="/rooms/new" className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10">Créer une partie <Plus size={17} /></Link>
              </div>
            </div>
          </section>

          <section className="xl:w-[90%]" aria-labelledby="multiplayer-title">
            <h2 id="multiplayer-title" className="mb-4 font-brandUpright text-[22px] uppercase leading-none tracking-[0.05em] text-white/95">Parties multijoueurs</h2>
            {loading && <div className="rounded-xl border border-white/10 bg-white/[.03] p-10 text-center text-sm text-white/60">Chargement des parties…</div>}
            {err && <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-5 text-sm text-red-300">{err}</div>}
            {!loading && !err && rooms.length === 0 && <div className="rounded-xl border border-dashed border-white/15 bg-white/[.02] p-10 text-center text-sm text-white/55">Aucune partie publique disponible pour le moment.</div>}
            {!loading && !err && rooms.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{rooms.map((room) => {
              const count = Math.max(0, Number(room.questionCount) || 0);
              const progress = Math.min(count, Math.max(0, Number(room.progressCount) || 0));
              return <button key={room.id} type="button" onClick={() => openRoom(room.id)} className="group overflow-hidden rounded-xl border border-white/10 bg-[#191c2c] text-left transition hover:-translate-y-1 hover:border-violet-500/60 hover:shadow-xl hover:shadow-violet-950/20">
                <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-violet-950 to-slate-900">
                  {room.image && <img src={`${API_BASE}/img/interface/${room.image}.avif`} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs backdrop-blur">{progress}/{count || "—"}</span>
                  <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs backdrop-blur">{room.playerCount ?? "—"}<img src={playerIcon} alt="" className="h-3.5 w-3.5" /></span>
                  <img src={cardsIcon} alt="" className="absolute left-1/2 top-1/2 w-16 -translate-x-1/2 -translate-y-1/2 drop-shadow-xl" />
                </div>
                <div className="p-4"><h3 className="truncate font-semibold">{room.name?.trim() || "Salon public"}</h3><div className="mt-2 flex text-xs text-amber-300" aria-label={`Difficulté ${difficulty(room.difficulty)} sur 4`}>{[0,1,2,3].map((star) => <span key={star} className={star < difficulty(room.difficulty) ? "" : "text-white/15"}>★</span>)}</div></div>
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
            <div className="flex items-center justify-between"><button aria-label="Mois précédent" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg p-2 text-white/55 hover:bg-white/5 hover:text-white"><ChevronLeft size={18} /></button><p className="text-sm font-semibold capitalize">{monthLabel}</p><button aria-label="Mois suivant" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg p-2 text-white/55 hover:bg-white/5 hover:text-white"><ChevronRight size={18} /></button></div>
            <div className="mt-4 grid grid-cols-7 gap-y-2 text-center">{weekdays.map((day) => <span key={day} className="text-[10px] font-semibold text-white/35">{day}</span>)}{Array.from({ length: firstWeekday }, (_, i) => <span key={`empty-${i}`} />)}{Array.from({ length: days }, (_, i) => {
              const date = new Date(month.getFullYear(), month.getMonth(), i + 1); const key = isoDate(date); const item = challengeMap.get(key); const isToday = key === today;
              return <Link key={key} to={item ? `/solo/daily/${key}` : "/solo/daily"} className={`mx-auto grid h-8 w-8 place-items-center rounded-full text-xs transition ${isToday ? "bg-violet-600 font-bold text-white" : item?.completed ? "bg-emerald-400/15 text-emerald-300" : item ? "text-cyan-300 ring-1 ring-cyan-400/45 hover:bg-cyan-400/10" : "text-white/45 hover:bg-white/5"}`} aria-label={`${i + 1} ${monthLabel}${item?.completed ? ", défi terminé" : item ? ", défi disponible" : ""}`}>{i + 1}</Link>;
            })}</div>
            <Link to="/solo/daily" className="mt-6 flex w-full items-center justify-center rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500">Jouer</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
