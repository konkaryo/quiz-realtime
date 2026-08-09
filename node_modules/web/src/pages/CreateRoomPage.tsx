// web/src/pages/CreateRoomPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import hostCrown from "../assets/crown.png";
import { Edit3 } from "lucide-react";
import { getLevelFromExperience } from "../utils/experience";

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
  label: string;
  description: string;
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

type OwnedRoomResponse = {
  room?: { id?: string | null } | null;
};

type MeResponse = {
  user?: { id?: string | null } | null;
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
  experience?: number;
};

type LobbyStatePayload = {
  ok: boolean;
  owner?: { userId?: string | null; playerId?: string | null };
  players?: LobbyPlayer[];
};

type RoomSettingsResponse = {
  room?: {
    id?: string;
    code?: string | null;
    ownerId?: string | null;
    difficulty?: number;
    questionCount?: number;
    roundMs?: number;
    bannedThemes?: ThemeKey[];
    dynamicQuestionDisplay?: boolean;
    manualQuestionLaunch?: boolean;
    speedBonusEnabled?: boolean;
  };
};

const LOBBY_PLAYERS_PER_PAGE = 5;

function LobbyLevelShield({ level }: { level: number }) {
  return (
    <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center text-white drop-shadow-[0_6px_14px_rgba(0,0,0,0.35)]">
      <svg viewBox="0 0 72 72" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true" focusable="false">
        <path d="M36 3 64.6 19.5v33L36 69 7.4 52.5v-33L36 3z" fill="#172033" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="relative z-10 font-inter text-[14px] font-black leading-none">{level}</span>
    </span>
  );
}

type RoomSettingsUpdatedPayload = {
  room?: RoomSettingsResponse["room"];
};

type RoomCodeUpdatedPayload = {
  roomId?: string;
  code?: string | null;
};

type RoomClosedPayload = {
  roomId?: string;
};

type RangeStyle = React.CSSProperties & Record<"--p", string>;

type SavedRoomSettings = {
  difficulty: number;
  questionCount: number;
  questionDuration: number;
  dynamicQuestionDisplay: boolean;
  manualQuestionLaunch: boolean;
  speedBonusEnabled: boolean;
  bannedThemes: ThemeKey[];
};

function areThemeListsEqual(left: ThemeKey[], right: ThemeKey[]) {
  return left.length === right.length && left.every((theme, index) => theme === right[index]);
}

function areRoomSettingsEqual(left: SavedRoomSettings, right: SavedRoomSettings) {
  return (
    left.difficulty === right.difficulty &&
    left.questionCount === right.questionCount &&
    left.questionDuration === right.questionDuration &&
    left.dynamicQuestionDisplay === right.dynamicQuestionDisplay &&
    left.manualQuestionLaunch === right.manualQuestionLaunch &&
    left.speedBonusEnabled === right.speedBonusEnabled &&
    areThemeListsEqual(left.bannedThemes, right.bannedThemes)
  );
}


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
  const hasBody = init?.body !== undefined && init.body !== null;
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { ...(hasBody ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) },
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

function SettingRow({ label, description, value, children }: SettingRowProps) {
  return (
    <div className="grid min-h-[71px] grid-cols-[minmax(123px,1fr),minmax(165px,253px)] items-center gap-5 rounded-[8px] border border-white/[0.06] bg-[#191c2c] px-4 py-3 max-sm:grid-cols-1 max-sm:gap-y-3">
      <div className="translate-y-[1px]">
        <div className="font-brandUpright text-[18px] uppercase leading-none tracking-[0.05em] text-white">
          {label}
        </div>
        <p className="mt-1.5 font-inter text-[12px] font-medium leading-none text-slate-400">{description}</p>
      </div>
      <div className="font-inter">{children}</div>
      <div className="sr-only">{value}</div>
    </div>
  );
}

export default function CreateRoomPageCorrected() {
  const nav = useNavigate();

  const { roomId: routeRoomId } = useParams<{ roomId?: string }>();
  const [loading, setLoading] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [difficulty, setDifficulty] = useState(45);
  const [questionCount, setQuestionCount] = useState(10);
  const [questionDuration, setQuestionDuration] = useState(20);
  const [maxPlayers, setMaxPlayers] = useState(50);
  const [dynamicQuestionDisplay, setDynamicQuestionDisplay] = useState(true);
  const [manualQuestionLaunch, setManualQuestionLaunch] = useState(false);
  const [speedBonusEnabled, setSpeedBonusEnabled] = useState(true);
  const [selectedThemes, setSelectedThemes] = useState<ThemeKey[]>(THEME_OPTIONS.map((theme) => theme.key));
  const [code, setCode] = useState("");
  const [activePanel, setActivePanel] = useState<PanelKey>("settings");
  const [themesOpen, setThemesOpen] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [ownerPlayerId, setOwnerPlayerId] = useState<string | null>(null);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [createdByCurrentUser, setCreatedByCurrentUser] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [savedSettings, setSavedSettings] = useState<SavedRoomSettings | null>(null);
  const [lobbySocket, setLobbySocket] = useState<Socket | null>(null);
  const [lobbyPlayerPage, setLobbyPlayerPage] = useState(0);

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
  const currentSettings = useMemo<SavedRoomSettings>(
    () => ({
      difficulty,
      questionCount,
      questionDuration,
      dynamicQuestionDisplay,
      manualQuestionLaunch,
      speedBonusEnabled,
      bannedThemes,
    }),
    [bannedThemes, difficulty, dynamicQuestionDisplay, manualQuestionLaunch, questionCount, questionDuration, speedBonusEnabled],
  );
  const hasUnsavedSettings = savedSettings !== null && !areRoomSettingsEqual(currentSettings, savedSettings);
  const canManageRoom = !createdRoomId || createdByCurrentUser || (!!currentUserId && ownerUserId === currentUserId);
  const orderedLobbyPlayers = useMemo(() => {
    if (!ownerPlayerId) return lobbyPlayers;
    return [...lobbyPlayers].sort((a, b) => {
      if (a.id === ownerPlayerId) return -1;
      if (b.id === ownerPlayerId) return 1;
      return 0;
    });
  }, [lobbyPlayers, ownerPlayerId]);
  const lobbyPlayerPageCount = Math.max(1, Math.ceil(orderedLobbyPlayers.length / LOBBY_PLAYERS_PER_PAGE));
  const visibleLobbyPlayers = useMemo(
    () => orderedLobbyPlayers.slice(lobbyPlayerPage * LOBBY_PLAYERS_PER_PAGE, (lobbyPlayerPage + 1) * LOBBY_PLAYERS_PER_PAGE),
    [lobbyPlayerPage, orderedLobbyPlayers],
  );

  useEffect(() => {
    setLobbyPlayerPage((page) => Math.min(page, lobbyPlayerPageCount - 1));
  }, [lobbyPlayerPageCount]);

  function openPanel(panel: PanelKey) {
    if ((panel === "code" || panel === "lobby") && !createdRoomId) return;
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
    let cancelled = false;

    fetchJSON("/auth/me")
      .then((data) => {
        if (cancelled) return;
        setCurrentUserId((data as MeResponse).user?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setCurrentUserId(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (routeRoomId) return;

    let cancelled = false;

    fetchJSON("/rooms/owned/open")
      .then((data) => {
        if (cancelled) return;
        const roomId = (data as OwnedRoomResponse).room?.id;
        if (roomId) nav(`/rooms/${roomId}/lobby`, { replace: true });
      })
      .catch(() => {
        // No owned room or not authenticated: keep normal creation flow.
      });

    return () => {
      cancelled = true;
    };
  }, [nav, routeRoomId]);


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
    if (routeRoomId) return;
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
  }, [routeRoomId]);

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
      setOwnerUserId(null);
      setCreatedByCurrentUser(false);
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
        setOwnerUserId(res.owner?.userId ?? null);
      });
    };

    socket.on("connect", () => {
      socket.emit("join_game", { code });
      window.setTimeout(refreshLobby, 180);
    });
    socket.on("joined", refreshLobby);
    socket.on("lobby_update", refreshLobby);
    const handleSettingsUpdated = (payload: RoomSettingsUpdatedPayload) => {
      const room = payload.room;
      if (!room) return;

      const nextDifficulty = typeof room.difficulty === "number" ? closestDifficulty(room.difficulty) : 45;
      const nextQuestionCount = typeof room.questionCount === "number" ? room.questionCount : 10;
      const nextQuestionDuration =
        typeof room.roundMs === "number" ? Math.max(1, Math.round(room.roundMs / 1000)) : 20;
      const nextBannedThemes = Array.isArray(room.bannedThemes)
        ? THEME_OPTIONS.filter((theme) => room.bannedThemes?.includes(theme.key)).map((theme) => theme.key)
        : [];
      const nextDynamicQuestionDisplay =
        typeof room.dynamicQuestionDisplay === "boolean" ? room.dynamicQuestionDisplay : true;
      const nextManualQuestionLaunch =
        typeof room.manualQuestionLaunch === "boolean" ? room.manualQuestionLaunch : false;
      const nextSpeedBonusEnabled =
        typeof room.speedBonusEnabled === "boolean" ? room.speedBonusEnabled : true;

      setDifficulty(nextDifficulty);
      setQuestionCount(nextQuestionCount);
      setQuestionDuration(nextQuestionDuration);
      setSelectedThemes(
        THEME_OPTIONS.filter((theme) => !nextBannedThemes.includes(theme.key)).map((theme) => theme.key),
      );
      setDynamicQuestionDisplay(nextDynamicQuestionDisplay);
      setManualQuestionLaunch(nextManualQuestionLaunch);
      setSpeedBonusEnabled(nextSpeedBonusEnabled);
      setSavedSettings({
        difficulty: nextDifficulty,
        questionCount: nextQuestionCount,
        questionDuration: nextQuestionDuration,
        dynamicQuestionDisplay: nextDynamicQuestionDisplay,
        manualQuestionLaunch: nextManualQuestionLaunch,
        speedBonusEnabled: nextSpeedBonusEnabled,
        bannedThemes: nextBannedThemes,
      });
    };

    const handleCodeUpdated = (payload: RoomCodeUpdatedPayload) => {
      if (payload.roomId && payload.roomId !== createdRoomId) return;
      setCode(payload.code ?? "");
      setCopied(false);
    };

    const handleRoomClosed = (payload: RoomClosedPayload) => {
      if (payload.roomId && payload.roomId !== createdRoomId) return;
      nav("/");
    };

    socket.on("game_started", () => {
      nav(`/room/${createdRoomId}`);
    });
    socket.on("room_settings_updated", handleSettingsUpdated);
    socket.on("room_code_updated", handleCodeUpdated);
    socket.on("room_closed", handleRoomClosed);
    socket.on("error_msg", (message: string) => setErr(message));

    return () => {
      socket.off("connect");
      socket.off("joined", refreshLobby);
      socket.off("lobby_update", refreshLobby);
      socket.off("game_started");
      socket.off("room_settings_updated", handleSettingsUpdated);
      socket.off("room_code_updated", handleCodeUpdated);
      socket.off("room_closed", handleRoomClosed);
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
        setOwnerUserId(room.ownerId ?? null);
        setCreatedByCurrentUser(false);
        setCode(room.code ?? "");
        const loadedDifficulty = typeof room.difficulty === "number" ? closestDifficulty(room.difficulty) : 45;
        const loadedQuestionCount = typeof room.questionCount === "number" ? room.questionCount : 10;
        const loadedQuestionDuration = typeof room.roundMs === "number" ? Math.max(1, Math.round(room.roundMs / 1000)) : 20;
        const loadedBannedThemes = Array.isArray(room.bannedThemes)
          ? THEME_OPTIONS.filter((theme) => room.bannedThemes?.includes(theme.key)).map((theme) => theme.key)
          : [];
        const loadedDynamicQuestionDisplay =
          typeof room.dynamicQuestionDisplay === "boolean" ? room.dynamicQuestionDisplay : true;
        const loadedManualQuestionLaunch =
          typeof room.manualQuestionLaunch === "boolean" ? room.manualQuestionLaunch : false;
        const loadedSpeedBonusEnabled =
          typeof room.speedBonusEnabled === "boolean" ? room.speedBonusEnabled : true;

        setDifficulty(loadedDifficulty);
        setQuestionCount(loadedQuestionCount);
        setQuestionDuration(loadedQuestionDuration);
        setSelectedThemes(THEME_OPTIONS.filter((theme) => !loadedBannedThemes.includes(theme.key)).map((theme) => theme.key));
        setDynamicQuestionDisplay(loadedDynamicQuestionDisplay);
        setManualQuestionLaunch(loadedManualQuestionLaunch);
        setSpeedBonusEnabled(loadedSpeedBonusEnabled);
        setSavedSettings({
          difficulty: loadedDifficulty,
          questionCount: loadedQuestionCount,
          questionDuration: loadedQuestionDuration,
          dynamicQuestionDisplay: loadedDynamicQuestionDisplay,
          manualQuestionLaunch: loadedManualQuestionLaunch,
          speedBonusEnabled: loadedSpeedBonusEnabled,
          bannedThemes: loadedBannedThemes,
        });
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
    if (!canManageRoom) return;
    setSelectedThemes((prev) =>
      prev.includes(themeKey) ? prev.filter((key) => key !== themeKey) : [...prev, themeKey],
    );
  }

  function selectAllThemes() {
    if (!canManageRoom) return;
    setSelectedThemes(THEME_OPTIONS.map((theme) => theme.key));
  }

  function selectNoThemes() {
    if (!canManageRoom) return;
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
    if (!canManageRoom) return;
    try {
      const data = (await fetchJSON(
        createdRoomId ? `/rooms/${createdRoomId}/code` : "/rooms/new-code",
        createdRoomId ? { method: "PATCH" } : undefined,
      )) as NewCodeResponse;
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
          manualQuestionLaunch,
          speedBonusEnabled,
          bannedThemes,
        }),
      })) as CreateRoomResponse;

      const id = data.result?.id;
      const finalCode = data.result?.code;

      if (!id) throw new Error("Création: id manquant");

      if (finalCode && finalCode !== code) setCode(finalCode);
      setCreatedRoomId(id);
      setOwnerUserId(currentUserId);
      setCreatedByCurrentUser(true);
      setSavedSettings(currentSettings);
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
    if (!createdRoomId || !canManageRoom) return;
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
          manualQuestionLaunch,
          speedBonusEnabled,
          bannedThemes,
        }),
      });
      setSavedSettings(currentSettings);
      setSaveStatus("Paramètres sauvegardés.");
    } catch (e: unknown) {
      const apiError = e as ApiError;
      setErr(apiError.message || "Impossible de sauvegarder les paramètres");
    } finally {
      setLoading(false);
    }
  }

  async function deleteRoom() {
    if (!createdRoomId || !canManageRoom || deletingRoom) return;

    setDeletingRoom(true);
    setErr(null);

    try {
      await fetchJSON(`/rooms/${createdRoomId}`, { method: "DELETE" });
      nav("/");
    } catch (e: unknown) {
      const apiError = e as ApiError;
      setErr(apiError.message || "Impossible de supprimer la partie");
    } finally {
      setDeletingRoom(false);
    }
  }

  function launchGame() {
    if (!canManageRoom) return;
    if (!createdRoomId) {
      void createRoom();
      return;
    }
    lobbySocket?.emit("start_game");
  }

  return (
    <div className="relative min-h-full overflow-hidden text-slate-50">
      <div aria-hidden className="fixed inset-0 z-0 bg-[#11131f]" style={{ backgroundColor: "#11131f" }} />

      <style>{`
        .create-room-scroll {
          scrollbar-width: thin;
          scrollbar-color: #eef1ff #191c2c;
        }

        .create-room-scroll::-webkit-scrollbar { width: 10px; }
        .create-room-scroll::-webkit-scrollbar-track { background: #191c2c; border-radius: 999px; }
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
          height: 20px;
          background: transparent;
          cursor: pointer;
          outline: none;
        }

        input[type="range"].create-room-range::-webkit-slider-runnable-track {
          height: 7px;
          border-radius: 999px;
          background: linear-gradient(#7C5CFF 0 0) 0 / var(--p) 100% no-repeat, #25293b;
        }

        input[type="range"].create-room-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 17px;
          height: 17px;
          margin-top: -5px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          background: #7C5CFF;
          box-shadow: none;
        }

        input[type="range"].create-room-range::-moz-range-track {
          height: 7px;
          border-radius: 999px;
          background: #25293b;
        }

        input[type="range"].create-room-range::-moz-range-progress {
          height: 7px;
          border-radius: 999px;
          background: #7C5CFF;
        }

        input[type="range"].create-room-range::-moz-range-thumb {
          width: 17px;
          height: 17px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          background: #7C5CFF;
        }
      `}</style>

      <main
        className="create-room-scroll fixed bottom-0 left-[84px] right-0 z-10 overflow-hidden max-md:left-0 max-md:overflow-y-auto"
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
                const disabled = (item.key === "code" || item.key === "lobby") && !createdRoomId;

                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={active ? "step" : undefined}
                    disabled={disabled}
                    onClick={() => openPanel(item.key)}
                    className={[
                      "block h-[44px] w-full bg-[#191c2c] px-3 text-center font-brandUpright text-[21px] uppercase leading-[44px] tracking-[0.04em] text-white transition max-md:h-12 max-md:flex-1 max-md:leading-[48px]",
                      active ? "bg-[#2b3044]" : "hover:bg-[#25293b]",
                      disabled ? "cursor-not-allowed opacity-35 hover:bg-[#191c2c]" : "",
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
              disabled={loading || deletingRoom || !code || !canManageRoom || (createdRoomId !== null && !lobbySocket)}
              className={[
                "mt-36 h-[40px] w-[250px] rounded-[7px] bg-gradient-to-r from-[#7E5CFF] to-[#6C3DDE] px-6 text-center font-inter text-[13px] font-extrabold text-slate-50 transition hover:brightness-110 max-md:mt-8 max-md:w-full",
                loading || deletingRoom || !code || !canManageRoom ? "cursor-not-allowed opacity-50 hover:brightness-100" : "",
              ].join(" ")}
            >
              {loading ? "Création…" : createdRoomId ? "Lancer la partie" : "Créer la partie"}
            </button>
            {createdRoomId && canManageRoom && (
              <button
                type="button"
                onClick={deleteRoom}
                disabled={deletingRoom}
                className="mt-3 h-[40px] w-[250px] rounded-[7px] bg-gradient-to-t from-[#B91C1C] to-[#EF4444] px-6 text-center font-inter text-[13px] font-extrabold text-slate-50 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 max-md:w-full"
              >
                {deletingRoom ? "Suppression…" : "Supprimer la partie"}
              </button>
            )}
          </aside>

          <div className="flex flex-col">
            <section>
            {err && (
              <div className="mb-4 rounded-md border border-rose-300/40 bg-rose-950/45 px-4 py-3 text-sm text-rose-100">
                {err}
              </div>
            )}

            {activePanel === "settings" && (
              <div id="create-room-panel-settings" role="tabpanel" aria-label="Paramètres" className="create-room-scroll max-h-[calc(100vh-310px)] space-y-4 overflow-y-auto pr-4">
                <fieldset disabled={!canManageRoom} className={!canManageRoom ? "space-y-4 opacity-60" : "space-y-4"}>
                <SettingRow
                  label="Mode de jeu"
                  description="Choisissez le mode de jeu"
                  value="Classique"
                >
                  <select
                    defaultValue="Classique"
                    disabled={!canManageRoom}
                    className="h-[26px] w-full rounded-[3px] border-0 bg-[#11131f] px-3 text-[12px] font-semibold text-white/95 outline-none disabled:cursor-not-allowed"
                  >
                    <option>Classique</option>
                  </select>
                </SettingRow>

                <SettingRow label="Nombre de questions" description="Définissez le nombre de questions" value={`${questionCount}`}>
                  <div className="flex items-center gap-3">
                    <input
                      id="question-count"
                      type="range"
                      min={1}
                      max={50}
                      step={1}
                      value={questionCount}
                      onChange={(event) => setQuestionCount(Number(event.target.value))}
                      disabled={!canManageRoom}
                      className="create-room-range disabled:cursor-not-allowed"
                      style={rangeStyle(qcountP)}
                    />
                    <span className="w-8 text-right font-inter text-[12px] font-semibold leading-none text-white">{questionCount}</span>
                  </div>
                </SettingRow>

                <SettingRow label="Difficulté des questions" description="Ajustez la difficulté des questions" value={selectedDifficultyLabel}>
                  <div className="flex h-[35px] items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustDifficulty(-1)}
                      disabled={!canManageRoom || selectedDifficultyIndex <= 0}
                      aria-label="Réduire la difficulté des questions"
                      className="grid h-[30px] w-[30px] place-items-center rounded-[5px] bg-[#25293b] text-[16px] font-bold leading-none text-white/70 transition hover:bg-[#30354a] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      −
                    </button>
                    <div className="flex h-full min-w-[90px] flex-1 items-center justify-center rounded-[5px] bg-[#11131f] px-4 font-inter text-[12px] font-semibold leading-none text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      {selectedDifficultyLabel}
                    </div>
                    <button
                      type="button"
                      onClick={() => adjustDifficulty(1)}
                      disabled={!canManageRoom || selectedDifficultyIndex >= DIFFICULTY_OPTIONS.length - 1}
                      aria-label="Augmenter la difficulté des questions"
                      className="grid h-[30px] w-[30px] place-items-center rounded-[5px] bg-[#25293b] text-[16px] font-bold leading-none text-white/70 transition hover:bg-[#30354a] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      +
                    </button>
                  </div>
                </SettingRow>

                <SettingRow label="Temps pour répondre" description="Temps disponible par question (secondes)" value={`${questionDuration}s`}>
                  <div className="flex h-[35px] items-center justify-center gap-2">
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
                      disabled={!canManageRoom || questionDuration <= 3}
                      aria-label="Diminuer le temps pour répondre"
                      className="grid h-[30px] w-[30px] place-items-center rounded-[5px] bg-[#25293b] text-[16px] font-bold leading-none text-white/70 transition hover:bg-[#30354a] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      −
                    </button>
                    <div className="flex h-full min-w-[90px] flex-1 items-center justify-center rounded-[5px] bg-[#11131f] px-4 font-inter text-[12px] font-semibold leading-none text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
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
                      disabled={!canManageRoom || questionDuration >= 60}
                      aria-label="Augmenter le temps pour répondre"
                      className="grid h-[30px] w-[30px] place-items-center rounded-[5px] bg-[#25293b] text-[16px] font-bold leading-none text-white/70 transition hover:bg-[#30354a] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      +
                    </button>
                  </div>
                </SettingRow>

                <SettingRow label="Thèmes des questions" description="Sélectionnez les thèmes de la partie" value={`${selectedThemeCount}/${THEME_OPTIONS.length}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (canManageRoom) setThemesOpen(true);
                    }}
                    disabled={!canManageRoom}
                    aria-haspopup="dialog"
                    aria-expanded={themesOpen}
                    className="flex h-[31px] w-full items-center justify-between rounded-[3px] bg-[#11131f] px-3 text-left text-[12px] font-semibold text-white/95 transition hover:bg-[#202435]"
                  >
                    <span>{selectedThemeCount}/{THEME_OPTIONS.length} thèmes actifs</span>
                    <span className="inline-flex items-center justify-center text-white/70" aria-hidden="true">
                      <Edit3 className="h-3 w-3" strokeWidth={2.4} />
                    </span>
                    <span className="sr-only">Modifier les thèmes</span>
                  </button>
                </SettingRow>

                <SettingRow label="Nombre de joueurs" description="Définissez le nombre de participants" value={`${maxPlayers}`}>
                  <div className="flex items-center gap-3">
                    <input
                      id="max-players"
                      type="range"
                      min={1}
                      max={50}
                      step={1}
                      value={maxPlayers}
                      onChange={(event) => setMaxPlayers(Number(event.target.value))}
                      disabled={!canManageRoom}
                      className="create-room-range disabled:cursor-not-allowed"
                      style={rangeStyle(maxPlayersP)}
                    />
                    <span className="w-8 text-right font-inter text-[12px] font-semibold leading-none text-white">{maxPlayers}</span>
                  </div>
                </SettingRow>

                <SettingRow
                  label="Affichage dynamique des questions"
                  description="Affiche les questions en temps réel"
                  value={dynamicQuestionDisplay ? "Activé" : "Désactivé"}
                >
                  <button
                    type="button"
                    onClick={() => setDynamicQuestionDisplay((enabled) => !enabled)}
                    disabled={!canManageRoom}
                    aria-pressed={dynamicQuestionDisplay}
                    className={[
                      "flex h-[31px] w-full items-center justify-between rounded-[3px] bg-[#11131f] px-3 text-left text-[12px] font-semibold text-white/95 transition hover:bg-[#202435]",
                    ].join(" ")}
                  >
                    <span>{dynamicQuestionDisplay ? "Activé" : "Désactivé"}</span>
                    <span
                      aria-hidden
                      className={[
                        "relative h-[18px] w-9 rounded-full transition",
                        dynamicQuestionDisplay ? "bg-[#7C5CFF]" : "bg-white/20",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition",
                          dynamicQuestionDisplay ? "left-[20px]" : "left-0.5",
                        ].join(" ")}
                      />
                    </span>
                  </button>
                </SettingRow>

                <SettingRow
                  label="Bonus de rapidité"
                  description="Récompense les réponses textuelles correctes les plus rapides"
                  value={speedBonusEnabled ? "Activé" : "Désactivé"}
                >
                  <button
                    type="button"
                    onClick={() => setSpeedBonusEnabled((enabled) => !enabled)}
                    disabled={!canManageRoom}
                    aria-pressed={speedBonusEnabled}
                    className={[
                      "flex h-[31px] w-full items-center justify-between rounded-[3px] bg-[#11131f] px-3 text-left text-[12px] font-semibold text-white/95 transition hover:bg-[#202435]",
                    ].join(" ")}
                  >
                    <span>{speedBonusEnabled ? "Activé" : "Désactivé"}</span>
                    <span
                      aria-hidden
                      className={[
                        "relative h-[18px] w-9 rounded-full transition",
                        speedBonusEnabled ? "bg-[#7C5CFF]" : "bg-white/20",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition",
                          speedBonusEnabled ? "left-[20px]" : "left-0.5",
                        ].join(" ")}
                      />
                    </span>
                  </button>
                </SettingRow>

                <SettingRow
                  label="Lancement manuel"
                  description="Lancez chaque question suivante manuellement"
                  value={manualQuestionLaunch ? "Activé" : "Désactivé"}
                >
                  <button
                    type="button"
                    onClick={() => setManualQuestionLaunch((enabled) => !enabled)}
                    disabled={!canManageRoom}
                    aria-pressed={manualQuestionLaunch}
                    className={[
                      "flex h-[31px] w-full items-center justify-between rounded-[3px] bg-[#11131f] px-3 text-left text-[12px] font-semibold text-white/95 transition hover:bg-[#202435]",
                    ].join(" ")}
                  >
                    <span>{manualQuestionLaunch ? "Activé" : "Désactivé"}</span>
                    <span
                      aria-hidden
                      className={[
                        "relative h-[18px] w-9 rounded-full transition",
                        manualQuestionLaunch ? "bg-[#7C5CFF]" : "bg-white/20",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition",
                          manualQuestionLaunch ? "left-[20px]" : "left-0.5",
                        ].join(" ")}
                      />
                    </span>
                  </button>
                </SettingRow>
                </fieldset>
              </div>
            )}

            {activePanel === "code" && (
              <div id="create-room-panel-code" role="tabpanel" aria-label="Code" className="space-y-4">
                <div className="mx-auto w-full max-w-[420px] rounded-[8px] border border-white/[0.06] bg-[#191c2c] p-6 text-center">
                  <p className="font-brandUpright text-[18px] uppercase leading-none tracking-[0.05em] text-white">
                    Code de la partie
                  </p>
                  <div className="mt-5 rounded-md bg-white px-6 py-4 font-mono text-4xl font-black tracking-[0.32em] text-[#0B1229]">
                    {code || "----"}
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                    <button
                      type="button"
                      onClick={refreshCodeFromServer}
                      disabled={!canManageRoom}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] bg-white/[0.055] font-inter text-[13px] font-extrabold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <RefreshIcon className="h-4 w-4" />
                      Régénérer
                    </button>
                    <button
                      type="button"
                      onClick={copyCode}
                      disabled={!code}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] bg-white/[0.055] font-inter text-[13px] font-extrabold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <CopyIcon className="h-4 w-4" />
                      {copied ? "Copié !" : "Copier"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activePanel === "lobby" && (
              <div id="create-room-panel-lobby" role="tabpanel" aria-label="Lobby">
                {createdRoomId ? (
                  <div className="flex min-h-[420px] flex-col items-center justify-center">
                    <div className="flex min-h-[180px] w-full max-w-[760px] flex-wrap items-start justify-center gap-5">
                      {visibleLobbyPlayers.map((player) => {
                        const level = getLevelFromExperience(player.experience ?? 0);
                        return (
                          <article key={player.id} className="relative h-[176px] w-[130px] rounded-[7px] p-px text-center" style={{ background: "linear-gradient(180deg, #7C5CFF 0%, #191C2C 42%)" }}>
                            <span className="pointer-events-none absolute inset-x-px bottom-[-4px] h-3 rounded-b-[7px] bg-[#7C5CFF]" aria-hidden="true" />
                            <div className="relative flex h-full w-full flex-col items-center rounded-[6px] bg-[linear-gradient(180deg,#292D45_0%,#181B2B_100%)] px-3 pb-4 pt-7">
                              <div className="h-[52px] w-[52px] overflow-hidden rounded-full border-2 border-[#8E63FF]">
                                <img src={player.img || "/img/profiles/0.avif"} alt="" className="h-full w-full rounded-full object-cover" draggable={false} loading="lazy" />
                              </div>
                              <div className="mt-3 w-full truncate font-inter text-[14px] font-extrabold leading-none text-white">{player.name}</div>
                              <div className="mt-auto" aria-label={`Niveau ${level}`}><LobbyLevelShield level={level} /></div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    {orderedLobbyPlayers.length === 0 ? <p className="text-[13px] font-semibold text-white/40">En attente de joueurs…</p> : null}
                    <div className="mt-16 flex h-3 items-center justify-center gap-2" aria-label={`Page ${lobbyPlayerPage + 1} sur ${lobbyPlayerPageCount}`}>
                      {Array.from({ length: lobbyPlayerPageCount }, (_, page) => (
                        <button key={page} type="button" onClick={() => setLobbyPlayerPage(page)} className={`h-2 w-2 rounded-[2px] transition-colors ${page === lobbyPlayerPage ? "bg-[#7C5CFF]" : "bg-slate-500/70"}`} aria-label={`Afficher la page ${page + 1}`} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div className="sr-only" aria-live="polite">
              {copied ? "Le code a été copié dans le presse-papiers." : ""}
              {bannedThemes.length === 0 ? "Tous les thèmes sont inclus." : `${bannedThemes.length} thème(s) exclu(s).`}
            </div>
            </section>
            {activePanel === "settings" && createdRoomId && canManageRoom && (
              <div className="mt-6 flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={loading || !hasUnsavedSettings}
                  className="h-10 w-full max-w-[220px] rounded-[6px] bg-gradient-to-r from-[#7E5CFF] to-[#6C3DDE] px-5 font-inter text-[13px] font-extrabold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100"
                >
                  Sauvegarder
                </button>
                {saveStatus && <p className="text-right text-xs font-semibold text-emerald-300">{saveStatus}</p>}
              </div>
            )}
          </div>
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
            className="w-full max-w-[660px] rounded-xl border border-white/10 bg-[#191c2c] p-5 sm:p-6"
          >
            <div className="mb-5">
              <h3 id="themes-dialog-title" className="font-brandUpright text-[28px] uppercase leading-none text-white">
                Thèmes des questions
              </h3>
              <p className="mt-2 text-[13px] font-semibold text-white/55">
                {selectedThemeCount}/{THEME_OPTIONS.length} thèmes actifs
              </p>
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-inter text-[12px] font-semibold">
              <button
                type="button"
                onClick={selectAllThemes}
                disabled={!canManageRoom}
                className="text-white/70 transition hover:text-white"
              >
                Tout sélectionner
              </button>
              <span className="h-3 w-px bg-white/15" aria-hidden="true" />
              <button
                type="button"
                onClick={selectNoThemes}
                disabled={!canManageRoom}
                className="text-white/55 transition hover:text-white"
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
                    disabled={!canManageRoom}
                    aria-pressed={active}
                    className={[
                      "rounded-[5px] border px-3 py-1.5 font-inter text-[12px] font-medium transition",
                      active
                        ? "border-emerald-400/70 bg-emerald-600 text-white"
                        : "border-white/10 bg-[#11131f] text-white/55 hover:border-white/25 hover:text-white/80",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="mt-10 flex justify-end">
              <button
                type="button"
                onClick={() => setThemesOpen(false)}
                className="h-9 rounded-[6px] border border-transparent bg-[#6250C7] px-6 font-inter text-[13px] font-extrabold text-white transition hover:bg-[#6F5BD4]"
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