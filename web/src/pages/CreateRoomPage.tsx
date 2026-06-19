// web/src/pages/CreateRoomPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import hostCrown from "../assets/crown.png";
import Background from "../components/Background";
import { Edit3 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE as string;

const NAVBAR_HEIGHT_PX = 52;
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");

const THEME_OPTIONS = [
  { key: "AUDIOVISUEL", label: "Audiovisuel" },
  { key: "ARTS", label: "Arts" },
  { key: "CROYANCES", label: "Croyances" },
  { key: "DIVERS", label: "Divers" },
  { key: "GEOGRAPHIE", label: "Géographie" },
  { key: "HISTOIRE", label: "Histoire" },
  { key: "LITTERATURE", label: "Littérature" },
  { key: "MUSIQUE", label: "Musique" },
  { key: "NATURE", label: "Nature" },
  { key: "POP_CULTURE", label: "Pop culture" },
  { key: "SCIENCE", label: "Science" },
  { key: "SOCIETE", label: "Société" },
  { key: "SPORT", label: "Sport" },
  { key: "TRADITIONS", label: "Traditions" },
] as const;

const DIFFICULTY_OPTIONS = [
  { label: "Facile", value: 25 },
  { label: "Modéré", value: 45 },
  { label: "Difficile", value: 65 },
  { label: "Extrême", value: 85 },
] as const;

type ThemeKey = (typeof THEME_OPTIONS)[number]["key"];
type PanelKey = "settings" | "code" | "lobby";

type NavItem = {
  key: PanelKey;
  label: string;
};

type SettingRowProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  children: React.ReactNode;
};

type ApiError = Error & {
  status?: number;
  data?: unknown;
};

type NewCodeResponse = {
  code?: string;
};

type CreateRoomResponse = {
  result?: {
    id?: string;
    code?: string;
  };
};

type LobbyPlayer = {
  id: string;
  name: string;
  img?: string | null;
};

type LobbyStatePayload = {
  ok: boolean;
  owner?: { playerId?: string | null };
  players?: LobbyPlayer[];
};

type RoomSettingsResponse = {
  room?: {
    id?: string;
    code?: string | null;
    difficulty?: number;
    questionCount?: number;
    roundMs?: number;
    bannedThemes?: ThemeKey[];
    dynamicQuestionDisplay?: boolean;
  };
};

type RangeStyle = React.CSSProperties & Record<"--p", string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown, key: string) {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

function errorMessageFromData(data: unknown, fallback: string) {
  return stringField(data, "error") || stringField(data, "message") || fallback;
}

function rangeStyle(progress: string): RangeStyle {
  return { "--p": progress };
}

async function fetchJSON(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const data = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const msg = errorMessageFromData(data, `HTTP ${res.status}`);
    const err: ApiError = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function percent(value: number, min: number, max: number) {
  if (max <= min) return "0%";
  return `${clamp01((value - min) / (max - min)) * 100}%`;
}

function closestDifficulty(value: number) {
  return DIFFICULTY_OPTIONS.reduce((closest, option) =>
    Math.abs(option.value - value) < Math.abs(closest.value - value) ? option : closest,
  ).value;
}

function GamepadIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7.25 10.15h9.5c2.03 0 3.71 1.48 4.02 3.48l.46 2.93a2.54 2.54 0 0 1-4.4 2.15l-1.62-1.76H8.79l-1.62 1.76a2.54 2.54 0 0 1-4.4-2.15l.46-2.93a4.07 4.07 0 0 1 4.02-3.48Z"
        fill="currentColor"
      />
      <path d="M8.4 13.05v2.7M7.05 14.4h2.7" stroke="#0B1229" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M15.95 13.95h.02M18 15.45h.02" stroke="#0B1229" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function QuestionIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="currentColor" />
      <path
        d="M10.1 9.2A2.25 2.25 0 0 1 12.25 8c1.22 0 2.15.77 2.15 1.86 0 1.52-1.8 1.75-1.8 3.18M12.5 16h.01"
        stroke="#0B1229"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChartIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 17h3v3H4v-3Zm6-5h3v8h-3v-8Zm6-4h4v12h-4V8Z" fill="currentColor" />
    </svg>
  );
}

function TimerIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21a8 8 0 1 0-8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 13V8m0 5 3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 3h6M4 6l2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TilesIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="5" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="5" y="14" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="14" y="14" width="5" height="5" rx="1" fill="currentColor" />
    </svg>
  );
}

function UsersIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8.2 11.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.7 19.4c.4-3 2.44-5 5.5-5s5.1 2 5.5 5H2.7Zm7.6 0c.4-3 2.44-5 5.5-5s5.1 2 5.5 5h-11Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DynamicTextIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6h16M4 12h10M4 18h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 13l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="4" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
    </svg>
  );
}
function RefreshIcon(props: { className?: string }) {

  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingRow({ icon, label, value, children }: SettingRowProps) {
  return (
    <div className="grid min-h-[52px] grid-cols-[24px,minmax(112px,1fr),minmax(150px,230px)] items-center gap-5 bg-[#0B1229] px-4 py-3 max-sm:grid-cols-[24px,1fr] max-sm:gap-x-3 max-sm:gap-y-2">
      <div className="text-white">{icon}</div>
      <div className="font-brandUpright text-[18px] leading-none tracking-[0.02em] text-white">
        {label}
      </div>
      <div className="max-sm:col-span-2">{children}</div>
      <div className="sr-only">{value}</div>
    </div>
  );
}

export default function CreateRoomPage() {
  const nav = useNavigate();

  const { roomId: routeRoomId } = useParams<{ roomId?: string }>();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [difficulty, setDifficulty] = useState(45);
  const [questionCount, setQuestionCount] = useState(10);
  const [questionDuration, setQuestionDuration] = useState(20);
  const [maxPlayers, setMaxPlayers] = useState(50);
  const [dynamicQuestionDisplay, setDynamicQuestionDisplay] = useState(true);
  const [selectedThemes, setSelectedThemes] = useState<ThemeKey[]>(THEME_OPTIONS.map((theme) => theme.key));
  const [code, setCode] = useState("");
  const [activePanel, setActivePanel] = useState<PanelKey>("settings");
  const [themesOpen, setThemesOpen] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [ownerPlayerId, setOwnerPlayerId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [lobbySocket, setLobbySocket] = useState<Socket | null>(null);

  const copyResetTimeoutRef = useRef<number | null>(null);
  const questionDurationHoldTimeoutRef = useRef<number | null>(null);
  const questionDurationHoldIntervalRef = useRef<number | null>(null);

  const navItems: NavItem[] = useMemo(
    () => [
      { key: "settings", label: "Paramètres" },
      { key: "code", label: "Code" },
      { key: "lobby", label: "Lobby" },
    ],
    [],
  );

  const sortedThemes = useMemo(
    () => [...THEME_OPTIONS].sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" })),
    [],
  );

  const bannedThemes = useMemo(
    () => THEME_OPTIONS.filter((theme) => !selectedThemes.includes(theme.key)).map((theme) => theme.key),
    [selectedThemes],
  );

  const qcountP = percent(questionCount, 1, 50);
  const maxPlayersP = percent(maxPlayers, 1, 50);
  const selectedThemeCount = selectedThemes.length;
  const selectedDifficultyIndex = Math.max(
    0,
    DIFFICULTY_OPTIONS.findIndex((option) => option.value === difficulty),
  );
  const selectedDifficultyLabel = DIFFICULTY_OPTIONS[selectedDifficultyIndex]?.label ?? "Modéré";
  const orderedLobbyPlayers = useMemo(() => {
    if (!ownerPlayerId) return lobbyPlayers;
    return [...lobbyPlayers].sort((a, b) => {
      if (a.id === ownerPlayerId) return -1;
      if (b.id === ownerPlayerId) return 1;
      return 0;
    });
  }, [lobbyPlayers, ownerPlayerId]);

  function openPanel(panel: PanelKey) {
    if (panel === "lobby" && !createdRoomId) return;
    setActivePanel(panel);
    if (panel !== "settings") setThemesOpen(false);
  }

  function adjustDifficulty(delta: number) {
    const currentIndex = Math.max(
      0,
      DIFFICULTY_OPTIONS.findIndex((option) => option.value === difficulty),
    );
    const nextIndex = Math.max(0, Math.min(DIFFICULTY_OPTIONS.length - 1, currentIndex + delta));
    setDifficulty(DIFFICULTY_OPTIONS[nextIndex].value);
  }

  function adjustQuestionDuration(delta: number) {
    setQuestionDuration((seconds) => Math.max(3, Math.min(60, seconds + delta)));
  }

  function stopQuestionDurationHold() {
    if (questionDurationHoldTimeoutRef.current !== null) {
      window.clearTimeout(questionDurationHoldTimeoutRef.current);
      questionDurationHoldTimeoutRef.current = null;
    }

    if (questionDurationHoldIntervalRef.current !== null) {
      window.clearInterval(questionDurationHoldIntervalRef.current);
      questionDurationHoldIntervalRef.current = null;
    }
  }

  function startQuestionDurationHold(delta: number) {
    stopQuestionDurationHold();
    adjustQuestionDuration(delta);

    questionDurationHoldTimeoutRef.current = window.setTimeout(() => {
      questionDurationHoldTimeoutRef.current = null;
      questionDurationHoldIntervalRef.current = window.setInterval(() => {
        adjustQuestionDuration(delta);
      }, 85);
    }, 320);
  }

  function handleQuestionDurationKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, delta: number) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    adjustQuestionDuration(delta);
  }

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const data = (await fetchJSON("/rooms/new-code")) as NewCodeResponse;
        const nextCode = data.code;
        if (mounted) setCode(nextCode ?? "");
      } catch {
        if (mounted) setCode("");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      stopQuestionDurationHold();
    };
  }, []);

  useEffect(() => {
    if (!themesOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setThemesOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [themesOpen]);

  useEffect(() => {
    if (!createdRoomId || !code) {
      setLobbyPlayers([]);
      setOwnerPlayerId(null);
      return;
    }

    const socket = io(SOCKET_URL, {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    setLobbySocket(socket);

    const refreshLobby = () => {
      socket.emit("lobby_state", {}, (res: LobbyStatePayload) => {
        if (!res?.ok) return;
        setLobbyPlayers(res.players ?? []);
        setOwnerPlayerId(res.owner?.playerId ?? null);
      });
    };

    socket.on("connect", () => {
      socket.emit("join_game", { code });
      window.setTimeout(refreshLobby, 180);
    });
    socket.on("joined", refreshLobby);
    socket.on("lobby_update", refreshLobby);
    socket.on("game_started", () => {
      nav(`/room/${createdRoomId}`);
    });
    socket.on("error_msg", (message: string) => setErr(message));

    return () => {
      socket.off("connect");
      socket.off("joined", refreshLobby);
      socket.off("lobby_update", refreshLobby);
      socket.off("game_started");
      socket.off("error_msg");
      socket.close();
      setLobbySocket(null);
    };
  }, [code, createdRoomId, nav]);

  useEffect(() => {
    if (!routeRoomId) return;

    let cancelled = false;
    setLoading(true);
    setErr(null);

    fetchJSON(`/rooms/${routeRoomId}`)
      .then((data) => {
        if (cancelled) return;
        const room = (data as RoomSettingsResponse).room;
        if (!room?.id) throw new Error("Room introuvable");

        setCreatedRoomId(room.id);
        setCode(room.code ?? "");
        if (typeof room.difficulty === "number") setDifficulty(closestDifficulty(room.difficulty));
        if (typeof room.questionCount === "number") setQuestionCount(room.questionCount);
        if (typeof room.roundMs === "number") setQuestionDuration(Math.max(1, Math.round(room.roundMs / 1000)));
        if (Array.isArray(room.bannedThemes)) {
          setSelectedThemes(THEME_OPTIONS.filter((theme) => !room.bannedThemes?.includes(theme.key)).map((theme) => theme.key));
        }
        if (typeof room.dynamicQuestionDisplay === "boolean") {
          setDynamicQuestionDisplay(room.dynamicQuestionDisplay);
        }
        setActivePanel("lobby");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const apiError = e as ApiError;
        setErr(apiError.message || "Impossible de charger le lobby");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [routeRoomId]);

  function toggleTheme(themeKey: ThemeKey) {
    setSelectedThemes((prev) =>
      prev.includes(themeKey) ? prev.filter((key) => key !== themeKey) : [...prev, themeKey],
    );
  }

  function selectAllThemes() {
    setSelectedThemes(THEME_OPTIONS.map((theme) => theme.key));
  }

  function selectNoThemes() {
    setSelectedThemes([]);
  }

  async function copyCode() {
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);

      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }

      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copyResetTimeoutRef.current = null;
      }, 3000);
    } catch {
      setErr("Impossible de copier le code automatiquement.");
    }
  }

  async function refreshCodeFromServer() {
    try {
      const data = (await fetchJSON("/rooms/new-code")) as NewCodeResponse;
      const nextCode = data.code;
      setCode(nextCode ?? "");
      setCopied(false);
    } catch {
      setCode("");
      setCopied(false);
      setErr("Impossible de générer un nouveau code.");
    }
  }

  async function createRoom() {
    if (!code) {
      setErr("Code indisponible. Réessaie.");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const data = (await fetchJSON("/rooms", {
        method: "POST",
        body: JSON.stringify({
          code,
          difficulty,
          questionCount,
          roundSeconds: questionDuration,
          maxPlayers,
          dynamicQuestionDisplay,
          bannedThemes,
        }),
      })) as CreateRoomResponse;

      const id = data.result?.id;
      const finalCode = data.result?.code;

      if (!id) throw new Error("Création: id manquant");

      if (finalCode && finalCode !== code) setCode(finalCode);
      setCreatedRoomId(id);
      setActivePanel("lobby");
    } catch (e: unknown) {
      const apiError = e as ApiError;
      if (apiError.status === 409) {
        setErr("Le code vient d’être pris. Nouveau code généré.");
        await refreshCodeFromServer();
      } else {
        setErr(apiError.message || "Impossible de créer la room");
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!createdRoomId) return;
    setLoading(true);
    setErr(null);
    setSaveStatus(null);

    try {
      await fetchJSON(`/rooms/${createdRoomId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          difficulty,
          questionCount,
          roundSeconds: questionDuration,
          dynamicQuestionDisplay,
          bannedThemes,
        }),
      });
      setSaveStatus("Paramètres sauvegardés.");
    } catch (e: unknown) {
      const apiError = e as ApiError;
      setErr(apiError.message || "Impossible de sauvegarder les paramètres");
    } finally {
      setLoading(false);
    }
  }

  function launchGame() {
    if (!createdRoomId) {
      void createRoom();
      return;
    }
    lobbySocket?.emit("start_game");
  }

  return (
    <div className="relative min-h-full overflow-hidden text-slate-50">
      <Background />

      <style>{`
        .create-room-scroll {
          scrollbar-width: thin;
          scrollbar-color: #eef1ff rgba(255,255,255,0.08);
        }

        .create-room-scroll::-webkit-scrollbar { width: 10px; }
        .create-room-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.08); border-radius: 999px; }
        .create-room-scroll::-webkit-scrollbar-thumb {
          background: #eef1ff;
          border-radius: 999px;
          border: 3px solid rgba(6,10,25,0.35);
          background-clip: padding-box;
        }

        input[type="range"].create-room-range {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 18px;
          background: transparent;
          cursor: pointer;
          outline: none;
        }

        input[type="range"].create-room-range::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(#7C5CFF 0 0) 0 / var(--p) 100% no-repeat, #1c2748;
        }

        input[type="range"].create-room-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          margin-top: -5px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          background: #7C5CFF;
          box-shadow: 0 0 0 4px rgba(124,92,255,0.18);
        }

        input[type="range"].create-room-range::-moz-range-track {
          height: 6px;
          border-radius: 999px;
          background: #1c2748;
        }

        input[type="range"].create-room-range::-moz-range-progress {
          height: 6px;
          border-radius: 999px;
          background: #7C5CFF;
        }

        input[type="range"].create-room-range::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          background: #7C5CFF;
        }
      `}</style>

      <main
        className="create-room-scroll fixed bottom-0 left-0 right-0 z-10 overflow-y-auto"
        style={{ top: `${NAVBAR_HEIGHT_PX}px` }}
      >
        <div className="mx-auto grid min-h-full w-full max-w-[1240px] grid-cols-[260px,minmax(0,1fr)] items-start gap-24 xl:gap-32 px-5 py-16 max-md:grid-cols-1 max-md:gap-8 sm:px-8 lg:px-10">
          <aside className="pt-1 max-md:pt-0">
            <h1 className="font-brandUpright text-[42px] uppercase leading-[0.95] tracking-[0.01em] text-white drop-shadow-[0_10px_26px_rgba(0,0,0,0.4)] sm:text-[50px]">
              CRÉER UNE
              <br />
              PARTIE PRIVÉE
            </h1>

            <nav className="mt-14 w-[150px] max-md:mt-6 max-md:flex max-md:w-full" aria-label="Création de partie privée">
              {navItems.map((item) => {
                const active = item.key === activePanel;
                const disabled = item.key === "lobby" && !createdRoomId;

                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={active ? "step" : undefined}
                    disabled={disabled}
                    onClick={() => openPanel(item.key)}
                    className={[
                      "block h-[44px] w-full bg-[#10172D] px-3 text-center font-brandUpright text-[21px] uppercase leading-[44px] tracking-[0.04em] text-white transition max-md:h-12 max-md:flex-1 max-md:leading-[48px]",
                      active ? "bg-[#24304F]" : "hover:bg-[#18213D]",
                      disabled ? "cursor-not-allowed opacity-35 hover:bg-[#10172D]" : "",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={createdRoomId ? launchGame : createRoom}
              disabled={loading || !code || (createdRoomId !== null && !lobbySocket)}
              className={[
                "mt-36 h-[40px] w-[250px] rounded-[7px] bg-gradient-to-r from-[#7E5CFF] to-[#6C3DDE] px-6 text-center font-sans text-[15px] font-bold text-slate-50 transition hover:brightness-110 max-md:mt-8 max-md:w-full",
                loading || !code ? "cursor-not-allowed opacity-50 hover:brightness-100" : "",
              ].join(" ")}
            >
              {loading ? "Création…" : createdRoomId ? "Lancer la partie" : "Créer la partie"}
            </button>
          </aside>

          <section className="rounded-[14px] bg-[#131930] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.36)] sm:p-5">
            <div className="mb-6 flex items-start justify-between gap-4 px-1">
              <div>
                <h2 className="font-brandUpright text-[24px] uppercase leading-none tracking-[0.05em] text-white">
                  {activePanel === "settings" ? "Paramètres" : activePanel === "code" ? "Code" : "Lobby"}
                </h2>
              </div>
              <div className="rounded bg-[#0B1229] px-3 py-2 font-mono text-sm font-black tracking-[0.18em] text-white/90">
                {code || "----"}
              </div>
            </div>
            {err && (
              <div className="mb-4 rounded-md border border-rose-300/40 bg-rose-950/45 px-4 py-3 text-sm text-rose-100">
                {err}
              </div>
            )}

            {activePanel === "settings" && (
              <div id="create-room-panel-settings" role="tabpanel" aria-label="Paramètres" className="space-y-4">
                <SettingRow
                  icon={<GamepadIcon className="h-6 w-6" />}
                  label="Mode de jeu"
                  value="Classique"
                >
                  <select
                    defaultValue="Classique"
                    className="h-[24px] w-full rounded-[3px] border-0 bg-white px-3 text-[11px] font-semibold text-[#111827] outline-none"
                  >
                    <option>Classique</option>
                  </select>
                </SettingRow>

                <SettingRow icon={<QuestionIcon className="h-5 w-5" />} label="Nombre de questions" value={`${questionCount}`}>
                  <div className="flex items-center gap-3">
                    <input
                      id="question-count"
                      type="range"
                      min={1}
                      max={50}
                      step={1}
                      value={questionCount}
                      onChange={(event) => setQuestionCount(Number(event.target.value))}
                      className="create-room-range"
                      style={rangeStyle(qcountP)}
                    />
                    <span className="w-8 text-right font-brandUpright text-[16px] leading-none text-white">{questionCount}</span>
                  </div>
                </SettingRow>

                <SettingRow icon={<ChartIcon className="h-6 w-6" />} label="Difficulté des questions" value={selectedDifficultyLabel}>
                  <div className="flex h-[32px] items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustDifficulty(-1)}
                      disabled={selectedDifficultyIndex <= 0}
                      aria-label="Réduire la difficulté des questions"
                      className="grid h-7 w-7 place-items-center rounded-[5px] bg-[#18213D] text-[15px] font-bold leading-none text-white/70 transition hover:bg-[#202A4A] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      −
                    </button>
                    <div className="flex h-full min-w-[82px] flex-1 items-center justify-center rounded-[5px] bg-[#0D1429] px-4 font-brandUpright text-[16px] leading-none text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      {selectedDifficultyLabel}
                    </div>
                    <button
                      type="button"
                      onClick={() => adjustDifficulty(1)}
                      disabled={selectedDifficultyIndex >= DIFFICULTY_OPTIONS.length - 1}
                      aria-label="Augmenter la difficulté des questions"
                      className="grid h-7 w-7 place-items-center rounded-[5px] bg-[#18213D] text-[15px] font-bold leading-none text-white/70 transition hover:bg-[#202A4A] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      +
                    </button>
                  </div>
                </SettingRow>

                <SettingRow icon={<TimerIcon className="h-6 w-6" />} label="Temps pour répondre" value={`${questionDuration}s`}>
                  <div className="flex h-[32px] items-center justify-center gap-2">
                    <button
                      type="button"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        startQuestionDurationHold(-1);
                      }}
                      onPointerUp={stopQuestionDurationHold}
                      onPointerLeave={stopQuestionDurationHold}
                      onPointerCancel={stopQuestionDurationHold}
                      onBlur={stopQuestionDurationHold}
                      onKeyDown={(event) => handleQuestionDurationKeyDown(event, -1)}
                      disabled={questionDuration <= 3}
                      aria-label="Diminuer le temps pour répondre"
                      className="grid h-7 w-7 place-items-center rounded-[5px] bg-[#18213D] text-[15px] font-bold leading-none text-white/70 transition hover:bg-[#202A4A] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      −
                    </button>
                    <div className="flex h-full min-w-[82px] flex-1 items-center justify-center rounded-[5px] bg-[#0D1429] px-4 font-brandUpright text-[18px] leading-none text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      {questionDuration}
                    </div>
                    <button
                      type="button"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        startQuestionDurationHold(1);
                      }}
                      onPointerUp={stopQuestionDurationHold}
                      onPointerLeave={stopQuestionDurationHold}
                      onPointerCancel={stopQuestionDurationHold}
                      onBlur={stopQuestionDurationHold}
                      onKeyDown={(event) => handleQuestionDurationKeyDown(event, 1)}
                      disabled={questionDuration >= 60}
                      aria-label="Augmenter le temps pour répondre"
                      className="grid h-7 w-7 place-items-center rounded-[5px] bg-[#18213D] text-[15px] font-bold leading-none text-white/70 transition hover:bg-[#202A4A] disabled:cursor-not-allowed disabled:opacity-35"               >
                      +
                    </button>
                  </div>
                </SettingRow>

                <SettingRow icon={<TilesIcon className="h-6 w-6" />} label="Thèmes des questions" value={`${selectedThemeCount}/${THEME_OPTIONS.length}`}>
                  <button
                    type="button"
                    onClick={() => setThemesOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={themesOpen}
                    className="flex h-[28px] w-full items-center justify-between rounded-[3px] bg-white/90 px-3 text-left text-[11px] font-semibold text-[#111827] transition hover:bg-white"
                  >
                    <span>{selectedThemeCount}/{THEME_OPTIONS.length} thèmes actifs</span>
                    <span className="inline-flex items-center justify-center text-[#111827]/70" aria-hidden="true">
                      <Edit3 className="h-3 w-3" strokeWidth={2.4} />
                    </span>
                    <span className="sr-only">Modifier les thèmes</span>
                  </button>
                </SettingRow>

                <SettingRow icon={<UsersIcon className="h-6 w-6" />} label="Nombre de joueurs" value={`${maxPlayers}`}>
                  <div className="flex items-center gap-3">
                    <input
                      id="max-players"
                      type="range"
                      min={1}
                      max={50}
                      step={1}
                      value={maxPlayers}
                      onChange={(event) => setMaxPlayers(Number(event.target.value))}
                      className="create-room-range"
                      style={rangeStyle(maxPlayersP)}
                    />
                    <span className="w-8 text-right font-brandUpright text-[16px] leading-none text-white">{maxPlayers}</span>
                  </div>
                </SettingRow>

                <SettingRow
                  icon={<DynamicTextIcon className="h-6 w-6" />}
                  label="Affichage dynamique des questions"
                  value={dynamicQuestionDisplay ? "Activé" : "Désactivé"}
                >
                  <button
                    type="button"
                    onClick={() => setDynamicQuestionDisplay((enabled) => !enabled)}
                    aria-pressed={dynamicQuestionDisplay}
                    className={[
                      "flex h-[28px] w-full items-center justify-between rounded-[3px] px-3 text-left text-[11px] font-semibold transition",
                      dynamicQuestionDisplay
                        ? "bg-white/90 text-[#111827] hover:bg-white"
                        : "bg-[#1c2748] text-white/70 hover:bg-[#243154]",
                    ].join(" ")}
                  >
                    <span>{dynamicQuestionDisplay ? "Activé" : "Désactivé"}</span>
                    <span
                      aria-hidden
                      className={[
                        "relative h-4 w-8 rounded-full transition",
                        dynamicQuestionDisplay ? "bg-[#7C5CFF]" : "bg-white/20",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "absolute top-0.5 h-3 w-3 rounded-full bg-white transition",
                          dynamicQuestionDisplay ? "left-[18px]" : "left-0.5",
                        ].join(" ")}
                      />
                    </span>
                  </button>
                </SettingRow>
                {createdRoomId && (
                  <div className="flex flex-col items-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={saveSettings}
                      disabled={loading}
                      className="h-10 w-full max-w-[220px] rounded-[6px] bg-gradient-to-r from-[#7E5CFF] to-[#6C3DDE] px-5 text-[14px] font-extrabold text-white shadow-[0_10px_22px_rgba(92,54,221,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100"
                    >
                      Sauvegarder
                    </button>
                    {saveStatus && <p className="text-right text-xs font-semibold text-emerald-300">{saveStatus}</p>}
                  </div>
                )}
              </div>
            )}

            {activePanel === "code" && (
              <div id="create-room-panel-code" role="tabpanel" aria-label="Code" className="space-y-4">
                <div className="rounded-lg bg-[#0B1229] p-6 text-center">
                  <p className="font-brandUpright text-[18px] uppercase leading-none tracking-[0.05em] text-white/80">
                    Code de la partie
                  </p>
                  <div className="mt-5 rounded-md bg-white px-6 py-4 font-mono text-4xl font-black tracking-[0.32em] text-[#0B1229]">
                    {code || "----"}
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                    <button
                      type="button"
                      onClick={refreshCodeFromServer}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#24304F] text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#2d3b61]"
                    >
                      <RefreshIcon className="h-4 w-4" />
                      Régénérer
                    </button>
                    <button
                      type="button"
                      onClick={copyCode}
                      disabled={!code}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#7C5CFF] text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#8c70ff] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <CopyIcon className="h-4 w-4" />
                      {copied ? "Copié !" : "Copier"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activePanel === "lobby" && (
              <div id="create-room-panel-lobby" role="tabpanel" aria-label="Lobby" className="space-y-4">
                {createdRoomId ? (
                  <>
                    <div className="rounded-md bg-[#0B1229] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-brandUpright text-[18px] uppercase leading-none text-white">
                          Joueurs ({lobbyPlayers.length}/{maxPlayers})
                        </h3>
                        <span className="text-[11px] font-semibold text-white/40">En attente de joueurs…</span>
                      </div>
                      <div className="space-y-2">
                        {orderedLobbyPlayers.map((player) => {
                          const isOwner = player.id === ownerPlayerId;
                          return (
                            <div key={player.id} className="grid grid-cols-[32px,1fr,auto] items-center gap-3 rounded bg-[#131930] px-3 py-2">
                              <img
                                src={player.img || "/img/profiles/0.avif"}
                                alt=""
                                className="h-7 w-7 rounded-full object-cover"
                                draggable={false}
                              />
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate text-[13px] font-bold text-white">{player.name}</p>
                                {isOwner && (
                                  <img
                                    src={hostCrown}
                                    alt="Hôte"
                                    className="h-4 w-4 shrink-0 object-contain"
                                    draggable={false}
                                  />
                                )}
                              </div>
                              <span className="text-[11px] font-bold text-emerald-300">Prêt</span>
                            </div>
                          );
                        })}
                        {Array.from({ length: Math.max(0, Math.min(5, maxPlayers - lobbyPlayers.length)) }).map((_, index) => (
                          <div key={`empty-${index}`} className="rounded bg-[#10172D] px-3 py-2 text-[12px] font-semibold text-white/25">
                            En attente d'un joueur…
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            <div className="sr-only" aria-live="polite">
              {copied ? "Le code a été copié dans le presse-papiers." : ""}
              {bannedThemes.length === 0 ? "Tous les thèmes sont inclus." : `${bannedThemes.length} thème(s) exclu(s).`}
            </div>
          </section>
        </div>
      </main>
      {themesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/62 px-4 backdrop-blur-md"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setThemesOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="themes-dialog-title"
            className="w-full max-w-[660px] rounded-[18px] border border-white/10 bg-[#131930] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 id="themes-dialog-title" className="font-brandUpright text-[28px] uppercase leading-none text-white">
                  Thèmes des questions
                </h3>
                <p className="mt-2 text-[13px] font-semibold text-white/55">
                  {selectedThemeCount}/{THEME_OPTIONS.length} thèmes actifs
                </p>
              </div>
              <button
                type="button"
                onClick={() => setThemesOpen(false)}
                aria-label="Fermer la sélection des thèmes"
                className="grid h-9 w-9 place-items-center rounded-md bg-[#0B1229] text-lg font-black text-white/70 transition hover:bg-[#1b2544] hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllThemes}
                className="rounded-full bg-white px-4 py-2 text-[12px] font-black uppercase tracking-[0.06em] text-[#0B1229] transition hover:bg-white/90"
              >
                Tout sélectionner
              </button>
              <button
                type="button"
                onClick={selectNoThemes}
                className="rounded-full border border-white/12 bg-[#0B1229] px-4 py-2 text-[12px] font-black uppercase tracking-[0.06em] text-white/70 transition hover:border-white/25 hover:text-white"
              >
                Tout retirer
              </button>
            </div>

            <div className="flex max-h-[360px] flex-wrap gap-2 overflow-y-auto pr-1">
              {sortedThemes.map(({ key, label }) => {
                const active = selectedThemes.includes(key);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleTheme(key)}
                    aria-pressed={active}
                    className={[
                      "rounded-full border px-4 py-2 text-[13px] font-extrabold transition",
                      active
                        ? "border-[#8D72FF] bg-[#7C5CFF] text-white shadow-[0_8px_20px_rgba(124,92,255,0.24)]"
                        : "border-white/10 bg-[#0B1229] text-white/45 hover:border-white/25 hover:text-white/80",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setThemesOpen(false)}
                className="h-10 rounded-[6px] bg-gradient-to-r from-[#7E5CFF] to-[#6C3DDE] px-8 text-[14px] font-extrabold text-white shadow-[0_10px_22px_rgba(92,54,221,0.24)] transition hover:brightness-110"
              >
                Valider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}