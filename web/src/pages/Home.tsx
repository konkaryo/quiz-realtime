import { FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Clock3, LockKeyhole, Menu, Moon, Plus, Send, Sun, X } from "lucide-react";
import { io } from "socket.io-client";
import "./Home.css";

const API_BASE = import.meta.env.VITE_API_BASE as string;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? (typeof window !== "undefined" ? window.location.origin : "");
const PUBLIC_ROOMS_UPDATED_EVENT = "public_rooms_updated";

type RoomPlayer = { id: string; name: string; img: string };
type RoomListItem = { id: string; name?: string | null; image?: string | null; difficulty?: number; playerCount?: number; players?: RoomPlayer[] };
type RoomDetail = { id: string; code?: string | null };
type CalendarChallenge = { date: string; completed?: boolean | { score: number; completedAt: string } };
type ApiPayload = Record<string, unknown>;

const demoQuestions = [
  { category: "Sciences", prompt: "Quel élément chimique porte le symbole W ?", answers: ["tungstène", "tungsten"], label: "le tungstène" },
  { category: "Géographie", prompt: "Quelle est la capitale de l’Australie ?", answers: ["Canberra"], label: "Canberra" },
  { category: "Littérature", prompt: "Quel écrivain a créé le personnage de Meursault ?", answers: ["Albert Camus", "Camus"], label: "Albert Camus" },
  { category: "Histoire", prompt: "Quelle ville est tombée aux mains des Ottomans en 1453 ?", answers: ["Constantinople", "Istanbul"], label: "Constantinople" },
  { category: "Arts", prompt: "Qui a peint La Nuit étoilée ?", answers: ["Vincent van Gogh", "Van Gogh"], label: "Vincent van Gogh" },
];

const roomDescriptions = [
  "La culture générale dans sa version la plus accessible.",
  "Un niveau équilibré pour les joueurs avertis.",
  "Des questions exigeantes pour départager les meilleurs.",
  "Un défi extrême réservé aux esprits les plus affûtés.",
];

function normalizeAnswer(value: string) {
  return value.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "").replace(/-/g, " ").replace(/\s+/g, " ");
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function difficulty(value?: number) {
  const score = Number.isFinite(value) ? value! : 50;
  return score <= 25 ? 1 : score <= 50 ? 2 : score <= 75 ? 3 : 4;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "S";
}

export default function Home() {
  const nav = useNavigate();
  const roomsRef = useRef<HTMLElement>(null);
  const privateCodeInputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("utilisateur");
  const [isGuest, setIsGuest] = useState(true);
  const [landingLoaded, setLandingLoaded] = useState(false);
  const [landingLoaderHiding, setLandingLoaderHiding] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => window.localStorage.getItem("synapz-theme") === "dark");
  const [demoAnswer, setDemoAnswer] = useState("");
  const [demoResult, setDemoResult] = useState<"idle" | "correct" | "wrong">("idle");
  const [demoQuestionIndex, setDemoQuestionIndex] = useState(0);
  const [demoTransitioning, setDemoTransitioning] = useState(false);
  const [demoInputFocused, setDemoInputFocused] = useState(false);
  const [privateCode, setPrivateCode] = useState(["", "", "", ""]);
  const [privateError, setPrivateError] = useState<string | null>(null);
  const [joiningPrivate, setJoiningPrivate] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [challenges, setChallenges] = useState<CalendarChallenge[]>([]);
  const demoQuestion = demoQuestions[demoQuestionIndex];
  const today = isoDate(new Date(clock));
  const todayChallenge = challenges.find((challenge) => challenge.date === today);
  const remainingMinutes = Math.max(0, Math.ceil((new Date(new Date(clock).setHours(24, 0, 0, 0)).getTime() - clock) / 60_000));
  const remainingLabel = `${Math.floor(remainingMinutes / 60)}h ${String(remainingMinutes % 60).padStart(2, "0")}m`;

  async function fetchJSON(path: string, init?: RequestInit): Promise<ApiPayload> {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: init?.body ? { "Content-Type": "application/json", ...(init.headers || {}) } : init?.headers,
      ...init,
    });
    const data: ApiPayload = (res.headers.get("content-type") || "").includes("application/json") ? await res.json() : {};
    if (!res.ok) throw new Error(String(data.error || data.message || `HTTP ${res.status}`));
    return data;
  }

  const loadRooms = useCallback(async (spinner = true) => {
    if (spinner) setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/rooms`, { credentials: "include" });
      const data: ApiPayload = (res.headers.get("content-type") || "").includes("application/json") ? await res.json() : {};
      if (!res.ok) throw new Error(String(data.error || data.message || `HTTP ${res.status}`));
      setRooms((Array.isArray(data.rooms) ? data.rooms as RoomListItem[] : []).sort((a, b) => (a.difficulty ?? 999) - (b.difficulty ?? 999)));
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : "Impossible de charger les parties");
    } finally {
      if (spinner) setLoading(false);
    }
  }, []);

  useLayoutEffect(() => {
    if (landingLoaded) return;
    const previousRootOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [landingLoaded]);

  useEffect(() => {
    const startedAt = Date.now();
    let completeTimer: number | undefined;
    const revealTimer = window.setTimeout(() => {
      setLandingLoaderHiding(true);
      completeTimer = window.setTimeout(() => setLandingLoaded(true), 600);
    }, Math.max(0, 700 - (Date.now() - startedAt)));
    return () => { window.clearTimeout(revealTimer); if (completeTimer) window.clearTimeout(completeTimer); };
  }, []);

  useEffect(() => {
    void loadRooms();
    fetchJSON("/auth/me").then((data) => {
      const user = data.user as { displayName?: string; guest?: boolean } | undefined;
      setDisplayName(user?.displayName?.trim() || "utilisateur");
      setIsGuest(user?.guest ?? true);
    }).catch(() => undefined);
    fetchJSON(`/daily/calendar?month=${today.slice(0, 7)}`).then((data) => {
      setChallenges(Array.isArray(data.challenges) ? data.challenges as CalendarChallenge[] : []);
    }).catch(() => setChallenges([]));
  }, [loadRooms, today]);

  useEffect(() => {
    const socket = io(SOCKET_URL, { path: "/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    const refresh = () => void loadRooms(false);
    socket.on("connect", refresh);
    socket.on(PUBLIC_ROOMS_UPDATED_EVENT, refresh);
    return () => { socket.off("connect", refresh); socket.off(PUBLIC_ROOMS_UPDATED_EVENT, refresh); socket.close(); };
  }, [loadRooms]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateNavbar = () => setNavScrolled(window.scrollY > 50);
    updateNavbar();
    window.addEventListener("scroll", updateNavbar, { passive: true });
    return () => window.removeEventListener("scroll", updateNavbar);
  }, []);

  useEffect(() => {
    if (demoInputFocused) { setDemoTransitioning(false); return; }
    let transitionTimer: number | undefined;
    const rotationTimer = window.setTimeout(() => {
      setDemoTransitioning(true);
      transitionTimer = window.setTimeout(() => {
        setDemoQuestionIndex((current) => (current + 1) % demoQuestions.length);
        setDemoAnswer(""); setDemoResult("idle"); setDemoTransitioning(false);
      }, 280);
    }, demoResult === "idle" ? 6500 : 1800);
    return () => { window.clearTimeout(rotationTimer); if (transitionTimer) window.clearTimeout(transitionTimer); };
  }, [demoInputFocused, demoQuestionIndex, demoResult]);

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

  function submitDemoAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeAnswer(demoAnswer);
    if (!normalized) return;
    setDemoResult(demoQuestion.answers.some((answer) => normalizeAnswer(answer) === normalized) ? "correct" : "wrong");
  }

  function updatePrivateCode(startIndex: number, rawValue: string) {
    const characters = rawValue.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4 - startIndex).split("");
    setPrivateError(null);
    setPrivateCode((current) => {
      const next = [...current];
      if (!characters.length) next[startIndex] = "";
      characters.forEach((character, offset) => { next[startIndex + offset] = character; });
      return next;
    });
    if (characters.length) window.requestAnimationFrame(() => privateCodeInputsRef.current[Math.min(startIndex + characters.length, 3)]?.focus());
  }

  function handlePrivateKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Backspace" && !privateCode[index] && index > 0) {
      event.preventDefault();
      setPrivateCode((current) => current.map((item, itemIndex) => itemIndex === index - 1 ? "" : item));
      privateCodeInputsRef.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) privateCodeInputsRef.current[index - 1]?.focus();
    else if (event.key === "ArrowRight" && index < 3) privateCodeInputsRef.current[index + 1]?.focus();
  }

  async function joinPrivateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = privateCode.join("");
    if (code.length !== 4) return;
    setJoiningPrivate(true); setPrivateError(null);
    try {
      let roomId: string | undefined;
      try {
        const data = await fetchJSON("/rooms/resolve", { method: "POST", body: JSON.stringify({ code }) }) as { roomId?: string; room?: { id: string } };
        roomId = data.roomId ?? data.room?.id;
      } catch {
        const data = await fetchJSON(`/rooms/by-code/${encodeURIComponent(code)}`) as { room?: { id: string } };
        roomId = data.room?.id;
      }
      if (!roomId) throw new Error("Code invalide ou introuvable.");
      nav(`/rooms/${roomId}/lobby`);
    } catch (error: unknown) {
      setPrivateError(error instanceof Error && error.message !== "Not found" ? error.message : "Code invalide ou introuvable.");
    } finally { setJoiningPrivate(false); }
  }

  function toggleTheme() {
    setIsDark((current) => {
      window.localStorage.setItem("synapz-theme", current ? "light" : "dark");
      return !current;
    });
  }

  const totalPlayers = useMemo(() => rooms.reduce((total, room) => total + Math.max(0, Number(room.playerCount) || 0), 0), [rooms]);

  return (
    <div className={`synapz-landing${isDark ? " is-dark" : ""}`}>
      {!landingLoaded && <div className={`landing-loader${landingLoaderHiding ? " hiding" : ""}`} role="status" aria-label="Chargement du site"><img src={isDark ? "/landing/loader-mark-white.png" : "/landing/loader-mark-black.png"} alt="" /></div>}
      <main className={`landing${landingLoaded ? " landing-loaded" : " landing-loading"}`}>
        <section className="hero" aria-labelledby="hero-title">
          <header className={`site-header${navScrolled ? " site-header-scrolled" : ""}${mobileMenuOpen ? " menu-open" : ""}`}>
            <div className="site-header-inner">
              <div className="site-header-left">
                <a className="brand" href="#top" onClick={() => setMobileMenuOpen(false)}><img src={isDark ? "/landing/logo-dark.png" : "/landing/logo-light.png"} alt="" /><span>SYNAPZ</span></a>
                <span className="nav-divider" aria-hidden="true">/</span>
                <nav className="site-nav" aria-label="Navigation principale"><a href="#salons">Salons ouverts</a><Link to="/multi/ranking">Classement</Link><a href="#defi">Défi du jour</a></nav>
              </div>
              <div className="header-actions">
                <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={isDark ? "Activer le mode clair" : "Activer le mode sombre"}>{isDark ? <Sun size={15} /> : <Moon size={15} />}</button>
                <Link className="profile-button" to={isGuest ? "/login" : "/me/profile"} aria-label={isGuest ? "Se connecter" : "Ouvrir le profil"}>{isGuest ? "GO" : initials(displayName)}</Link>
                <button className="mobile-menu-button" type="button" aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}</button>
              </div>
              {mobileMenuOpen && <nav className="mobile-nav" aria-label="Navigation mobile"><a href="#salons" onClick={() => setMobileMenuOpen(false)}>Salons ouverts <ArrowUpRight size={15} /></a><Link to="/multi/ranking">Classement <ArrowUpRight size={15} /></Link><a href="#defi" onClick={() => setMobileMenuOpen(false)}>Défi du jour <ArrowUpRight size={15} /></a></nav>}
            </div>
          </header>
          <div className="hero-content" id="top">
            <h1 id="hero-title">Cultivez votre<br /><em>curiosité.</em></h1>
            <p className="hero-copy">Accédez à des milliers de questions de culture générale.<br />Rejoignez la communauté Synapz et jouez en direct.</p>
            <button className="primary-cta" onClick={() => roomsRef.current?.scrollIntoView({ behavior: "smooth" })}>Trouver une partie <ArrowDown size={17} /></button>
          </div>
          <div className="hero-question" aria-label="Exemple de question jouable">
            <div className="demo-question-body" aria-live="polite"><div className={`demo-question-slide${demoTransitioning ? " leaving" : ""}`} key={demoQuestionIndex}><p>{demoQuestion.category}</p><h2>{demoQuestion.prompt}</h2></div></div>
            <form className={`demo-answer ${demoResult}`} onSubmit={submitDemoAnswer}><input value={demoAnswer} onFocus={() => setDemoInputFocused(true)} onBlur={() => setDemoInputFocused(false)} onChange={(event) => { setDemoAnswer(event.target.value); if (demoResult !== "idle") setDemoResult("idle"); }} placeholder="Écrivez votre réponse…" aria-label="Réponse à la question d'exemple" /><button type="submit" aria-label="Valider la réponse"><Send size={18} /></button></form>
            <div className={`demo-feedback ${demoResult}`} aria-live="polite">{demoResult === "correct" ? <><Check size={15} /> Bonne réponse — {demoQuestion.label}.</> : demoResult === "wrong" ? <><X size={15} /> Pas tout à fait. Réessayez.</> : <><kbd>ENTRÉE</kbd> pour valider</>}</div>
          </div>
          <button className="scroll-hint" onClick={() => roomsRef.current?.scrollIntoView({ behavior: "smooth" })}><span>Explorer</span><ArrowDown size={15} /></button>
          <p className="hero-index">01 <span>/</span> 02</p>
        </section>

        <section className="rooms-section" id="salons" ref={roomsRef} aria-labelledby="rooms-title">
          <div className="rooms-heading"><p className="section-kicker">Salons ouverts</p><h2 id="rooms-title">Défiez d’autres joueurs.</h2></div>
          {loading && <div className="rooms-state">Chargement des parties…</div>}
          {err && <div className="rooms-state error">{err}</div>}
          {!loading && !err && rooms.length === 0 && <div className="rooms-state">Aucune partie publique disponible pour le moment.</div>}
          {!loading && !err && rooms.length > 0 && <div className="room-grid">{rooms.slice(0, 3).map((room) => {
            const level = difficulty(room.difficulty);
            const labels = ["Facile", "Intermédiaire", "Difficile", "Extrême"];
            const visiblePlayers = room.players?.slice(0, 3) ?? [];
            const count = Math.max(0, Number(room.playerCount) || 0);
            return <button className={`room-card difficulty-${level}`} type="button" onClick={() => void openRoom(room.id)} key={room.id}>
              <div className="room-visual" aria-hidden="true"><img className="room-fibers" src="/landing/room-fibers.png" alt="" /><img className="room-visual-mark" src="/landing/loader-mark-white.png" alt="" /></div>
              <div className="room-body"><h3>{room.name?.trim() || labels[level - 1]}</h3><span className="room-description">{roomDescriptions[level - 1]}</span></div>
              <div className="room-meta"><div className="room-players"><span className="room-avatars">{visiblePlayers.map((player) => <img src={`${API_BASE}${player.img}`} alt={player.name} key={player.id} />)}</span><strong>{count} joueur{count > 1 ? "s" : ""}</strong></div><span className="room-arrow"><ArrowRight size={20} /></span></div>
            </button>;
          })}</div>}

          <div className="private-actions-grid">
            <div className="private-action private-join" onClick={(event) => { if (!(event.target as HTMLElement).closest("input, button")) privateCodeInputsRef.current[privateCode.findIndex((character) => !character) === -1 ? 3 : privateCode.findIndex((character) => !character)]?.focus(); }}>
              <div className="private-access-copy"><span className="private-icon"><LockKeyhole size={18} /></span><div><h3>Rejoindre une partie</h3><p>{privateError || "Entrez le code du salon"}</p></div></div>
              <form className="private-code-form" onSubmit={joinPrivateRoom}><div className="private-code-entry"><div className="private-code-slots" role="group" aria-label="Code de la partie privée">{privateCode.map((character, index) => <input className="private-code-slot" key={index} ref={(element) => { privateCodeInputsRef.current[index] = element; }} value={character} onChange={(event) => updatePrivateCode(index, event.target.value)} onPaste={(event) => { event.preventDefault(); updatePrivateCode(index, event.clipboardData.getData("text")); }} onKeyDown={(event) => handlePrivateKeyDown(event, index)} aria-label={`Caractère ${index + 1} du code`} maxLength={1} autoCapitalize="characters" />)}</div><button type="submit" disabled={joiningPrivate || privateCode.some((character) => !character)} aria-label="Rejoindre la partie privée"><ArrowRight size={19} /></button></div></form>
            </div>
            <Link className="private-action private-create" to="/rooms/new"><div className="private-access-copy"><span className="private-icon"><Plus size={19} /></span><div><h3>Créer une partie</h3><p>Configurez votre salon privé</p></div></div><span className="private-action-arrow"><ArrowRight size={19} /></span></Link>
          </div>

          <div className="daily-card" id="defi"><div><p className="section-kicker">Défi du jour</p><h3>Une nouvelle série chaque jour.</h3><p>Revenez quotidiennement, mesurez vos connaissances et progressez dans le classement.</p></div><div className="daily-card-action"><span><Clock3 size={16} /> {remainingLabel}</span><button type="button" disabled={!todayChallenge || Boolean(todayChallenge.completed)} onClick={() => nav(`/solo/daily/${today}`)}>{todayChallenge?.completed ? "Défi terminé" : "Jouer maintenant"}<ArrowRight size={18} /></button></div></div>
          <div className="rooms-footer"><p><span className="pulse-dot" /> {totalPlayers} joueur{totalPlayers > 1 ? "s" : ""} en ligne</p><Link to="/multi/ranking">Voir le classement <ArrowUpRight size={14} /></Link></div>
        </section>
      </main>
    </div>
  );
}