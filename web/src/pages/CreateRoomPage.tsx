// web/src/pages/CreateRoomPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { Check, LogOut, Play, Save, Settings, Trash2 } from "lucide-react";
import { getLevelFromExperience } from "../utils/experience";
import ShapeGrid from "../components/ShapeGrid";
import { PreviewSlider } from "../components/react-bits/preview-slider";
import { PreviewMultiSelect, PreviewSelect } from "../components/react-bits/preview-select";
import { PreviewSwitch } from "../components/react-bits/preview-switch";
import "./RoomPage.css";
import "./CreateRoomPage.css";

const API_BASE = import.meta.env.VITE_API_BASE as string;

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");

const THEME_OPTIONS = [
  { key: "CULTURE_CLASSIQUE", label: "Culture classique" },
  { key: "CULTURE_GENERALE", label: "Culture générale" },
  { key: "CULTURE_MODERNE", label: "Culture moderne" },
  { key: "GEOGRAPHIE", label: "Géographie" },
  { key: "HISTOIRE", label: "Histoire" },
  { key: "MUSIQUE", label: "Musique" },
  { key: "NATURE", label: "Nature" },
  { key: "SCIENCE", label: "Science" },
  { key: "SPORT", label: "Sport" },
  { key: "TRADITION", label: "Tradition" },
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

  const navItems: NavItem[] = useMemo(
    () => [
      { key: "settings", label: "Paramètres" },
      { key: "code", label: "Code" },
      { key: "lobby", label: "Lobby" },
    ],
    [],
  );

  const bannedThemes = useMemo(
    () => THEME_OPTIONS.filter((theme) => !selectedThemes.includes(theme.key)).map((theme) => theme.key),
    [selectedThemes],
  );

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
    };
  }, []);

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
    <div className="create-room-shell room-game-shell">
      <div className="room-game-grid" aria-hidden="true">
        <ShapeGrid borderColor="#2f293a" hoverFillColor="#222222" shape="hexagon" direction="diagonal" squareSize={28} speed={0.1} hoverTrailAmount={0} />
      </div>
      <header className="room-game-header">
        <div className="room-game-header-main">
          <button className="room-game-brand" type="button" onClick={() => nav("/")} aria-label="Retour à l’accueil">
            <img src="/landing/logo-dark.png" alt="" /><span>SYNAPZ</span>
          </button>
          <span className="room-game-header-divider" aria-hidden="true">/</span>
          <div className="room-game-room create-room-header-title"><i /><strong>Nouvelle partie</strong></div>
          <button className="room-game-settings" type="button" onClick={() => nav("/me/account")} aria-label="Accéder aux paramètres"><Settings size={16} /></button>
        </div>
        <div className="room-game-actions">
          {createdRoomId && canManageRoom && (
            <button className="create-room-delete-header" type="button" onClick={deleteRoom} disabled={deletingRoom}>
              <Trash2 size={15} /> {deletingRoom ? "Suppression…" : "Supprimer"}
            </button>
          )}
          <button className="room-game-quit" type="button" onClick={() => nav("/")}>Quitter <LogOut size={15} /></button>
        </div>
      </header>

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

      <main className="create-room-layout">
          <aside className="create-room-sidebar">
            <h1 className="font-brandUpright text-[42px] uppercase leading-[0.95] tracking-[0.01em] text-white drop-shadow-[0_10px_26px_rgba(0,0,0,0.4)] sm:text-[50px]">
              CRÉER UNE
              <br />
              PARTIE PRIVÉE
            </h1>

            <nav className="create-room-steps" aria-label="Progression de la création">
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
                      "create-room-step",
                      active ? "is-active" : "",
                      disabled ? "is-disabled" : "",
                    ].join(" ")}
                  >
                    <span className="create-room-step-index">{item.key === "settings" ? (createdRoomId ? <Check size={13} /> : "01") : item.key === "code" ? "02" : "03"}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={createdRoomId ? launchGame : createRoom}
              disabled={loading || deletingRoom || !code || !canManageRoom || (createdRoomId !== null && !lobbySocket)}
              className="create-room-launch-action"
            >
              <span>{loading ? "Création…" : createdRoomId ? "Lancer la partie" : "Créer la partie"}</span>
              <Play size={15} fill="currentColor" />
            </button>
          </aside>

          <div className="create-room-content">
            <div className="create-room-heading"><h2>{activePanel === "settings" ? "Paramètres" : activePanel === "code" ? "Code d’accès" : "Lobby"}</h2></div>
            <section className={`create-room-panel${activePanel === "settings" ? " create-room-panel--settings" : activePanel === "lobby" ? " create-room-panel--lobby" : ""}`}>
            {err && (
              <div className="mb-4 rounded-md border border-rose-300/40 bg-rose-950/45 px-4 py-3 text-sm text-rose-100">
                {err}
              </div>
            )}

            {activePanel === "settings" && (
              <div id="create-room-panel-settings" role="tabpanel" aria-label="Paramètres" className="create-room-scroll create-settings-view">
                <fieldset disabled={!canManageRoom} className="create-parameter-groups">
                  <div className="preview-options preview-options--mode">
                    <PreviewSelect title="Mode de jeu" options={[{ value: "classique", label: "Classique" }]} value="classique" isDisabled={!canManageRoom} />
                  </div>
                  <div className="preview-options preview-options--primary">
                    <PreviewSlider title="Nombre de questions" min={1} max={50} step={1} value={questionCount} onChange={setQuestionCount} isDisabled={!canManageRoom} />
                    <PreviewSelect title="Difficulté" options={DIFFICULTY_OPTIONS.map((option) => ({ value: String(option.value), label: option.label }))} value={String(difficulty)} onChange={(value) => setDifficulty(Number(value))} isDisabled={!canManageRoom} />
                    <PreviewSlider title="Temps de réponse" min={3} max={60} step={1} value={questionDuration} valueUnit="s" onChange={setQuestionDuration} isDisabled={!canManageRoom} />
                    <PreviewMultiSelect title="Thèmes sélectionnés" options={THEME_OPTIONS.map((theme) => ({ value: theme.key, label: theme.label }))} value={selectedThemes} onChange={(value) => setSelectedThemes(value as ThemeKey[])} isDisabled={!canManageRoom} />
                  </div>
                  <div className="preview-options preview-options--secondary">
                    <PreviewSlider title="Nombre de joueurs" min={1} max={50} step={1} value={maxPlayers} onChange={setMaxPlayers} isDisabled={!canManageRoom} />
                    <PreviewSwitch title="Lecture dynamique" isChecked={dynamicQuestionDisplay} onChange={setDynamicQuestionDisplay} isDisabled={!canManageRoom} />
                    <PreviewSwitch title="Bonus de rapidité" isChecked={speedBonusEnabled} onChange={setSpeedBonusEnabled} isDisabled={!canManageRoom} />
                    <PreviewSwitch title="Démarrage manuel" isChecked={manualQuestionLaunch} onChange={setManualQuestionLaunch} isDisabled={!canManageRoom} />
                  </div>
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
                  <div className="create-room-lobby">
                    <div className="room-countdown-players create-room-lobby-players">
                      {visibleLobbyPlayers.map((player) => (
                        <div key={player.id}>
                          <img src={player.img || "/img/profiles/0.avif"} alt="" draggable={false} loading="lazy" />
                          <strong>{player.name}</strong>
                          <small>Niveau {getLevelFromExperience(player.experience ?? 0)}</small>
                        </div>
                      ))}
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
              <div className="create-room-save-area">
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={loading || !hasUnsavedSettings}
                  className="create-room-save-action"
                >
                  <Save size={15} /> Sauvegarder
                </button>
                {saveStatus && <p className="text-right text-xs font-semibold text-emerald-300">{saveStatus}</p>}
              </div>
            )}
          </div>
      </main>
    </div>
  );
}