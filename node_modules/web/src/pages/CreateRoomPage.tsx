// web/src/pages/CreateRoomPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { Copy, LogOut, MoreHorizontal, Play, RefreshCw, Save, Settings, Trash2, UserMinus, Users } from "lucide-react";
import { getLevelFromExperience } from "../utils/experience";
import ShapeGrid from "../components/ShapeGrid";
import { PreviewSlider } from "../components/react-bits/preview-slider";
import { PreviewMultiSelect, PreviewSelect } from "../components/react-bits/preview-select";
import { PreviewSwitch } from "../components/react-bits/preview-switch";
import { useToast } from "../hooks/use-toast";
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
type PanelKey = "settings" | "lobby";

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
    name?: string | null;
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
  room?: { id?: string; name?: string | null };
  owner?: { userId?: string | null; playerId?: string | null };
  players?: LobbyPlayer[];
};

type RoomSettingsResponse = {
  room?: {
    id?: string;
    code?: string | null;
    name?: string | null;
    ownerId?: string | null;
    difficulty?: number;
    questionCount?: number;
    answerAttempts?: number;
    qcmUses?: number;
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
  answerAttempts: number;
  qcmUses: number;
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
    left.answerAttempts === right.answerAttempts &&
    left.qcmUses === right.qcmUses &&
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

export default function CreateRoomPageCorrected() {
  const nav = useNavigate();
  const { toast } = useToast();

  const { roomId: routeRoomId } = useParams<{ roomId?: string }>();
  const [loading, setLoading] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [difficulty, setDifficulty] = useState(45);
  const [questionCount, setQuestionCount] = useState(10);
  const [answerAttempts, setAnswerAttempts] = useState(3);
  const [qcmUses, setQcmUses] = useState(3);
  const [questionDuration, setQuestionDuration] = useState(20);
  const [maxPlayers, setMaxPlayers] = useState(50);
  const [dynamicQuestionDisplay, setDynamicQuestionDisplay] = useState(true);
  const [manualQuestionLaunch, setManualQuestionLaunch] = useState(false);
  const [speedBonusEnabled, setSpeedBonusEnabled] = useState(true);
  const [selectedThemes, setSelectedThemes] = useState<ThemeKey[]>(THEME_OPTIONS.map((theme) => theme.key));
  const [code, setCode] = useState("");
  const [isCodeHidden, setIsCodeHidden] = useState(false);
  const [roomName, setRoomName] = useState("");
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
  const [selectedLobbyPlayerId, setSelectedLobbyPlayerId] = useState<string | null>(null);
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);

  const copyResetTimeoutRef = useRef<number | null>(null);

  const navItems: NavItem[] = useMemo(
    () => [
      { key: "settings", label: "Paramètres" },
      { key: "lobby", label: roomName || "Salon" },
    ],
    [roomName],
  );

  const bannedThemes = useMemo(
    () => THEME_OPTIONS.filter((theme) => !selectedThemes.includes(theme.key)).map((theme) => theme.key),
    [selectedThemes],
  );

  const currentSettings = useMemo<SavedRoomSettings>(
    () => ({
      difficulty,
      questionCount,
      answerAttempts,
      qcmUses,
      questionDuration,
      dynamicQuestionDisplay,
      manualQuestionLaunch,
      speedBonusEnabled,
      bannedThemes,
    }),
    [answerAttempts, bannedThemes, difficulty, dynamicQuestionDisplay, manualQuestionLaunch, qcmUses, questionCount, questionDuration, speedBonusEnabled],
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

  useEffect(() => {
    setQcmUses((value) => Math.min(value, questionCount));
  }, [questionCount]);

  useEffect(() => {
    if (!selectedLobbyPlayerId) return;
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("[data-lobby-player-card]")) setSelectedLobbyPlayerId(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [selectedLobbyPlayerId]);

  function openPanel(panel: PanelKey) {
    if (panel === "lobby" && !createdRoomId) return;
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
        if (res.room?.name) setRoomName(res.room.name);
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
      const nextAnswerAttempts = typeof room.answerAttempts === "number" ? room.answerAttempts : 3;
      const nextQcmUses = typeof room.qcmUses === "number" ? Math.min(room.qcmUses, nextQuestionCount) : 3;
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
      setAnswerAttempts(nextAnswerAttempts);
      setQcmUses(nextQcmUses);
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
        answerAttempts: nextAnswerAttempts,
        qcmUses: nextQcmUses,
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
    socket.on("removed_from_room", (payload: { reason?: "removed-by-owner" | "temporarily-banned"; bannedUntil?: number }) => {
      const isReconnectAttempt = payload?.reason === "temporarily-banned";
      nav("/");
      window.setTimeout(() => {
        toast({
          title: isReconnectAttempt ? "Accès temporairement bloqué" : "Vous avez été exclu du salon",
          description: isReconnectAttempt
            ? "Vous pourrez rejoindre ce salon dans quelques minutes."
            : "Le propriétaire vous a retiré de la partie. Vous pourrez revenir dans 5 minutes.",
          variant: "destructive",
        });
      }, 0);
    });
    socket.on("error_msg", (message: string) => setErr(message));

    return () => {
      socket.off("connect");
      socket.off("joined", refreshLobby);
      socket.off("lobby_update", refreshLobby);
      socket.off("game_started");
      socket.off("room_settings_updated", handleSettingsUpdated);
      socket.off("room_code_updated", handleCodeUpdated);
      socket.off("room_closed", handleRoomClosed);
      socket.off("removed_from_room");
      socket.off("error_msg");
      socket.close();
      setLobbySocket(null);
    };
  }, [code, createdRoomId, nav, toast]);

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
        setRoomName(room.name?.trim() || "Salon privé");
        setOwnerUserId(room.ownerId ?? null);
        setCreatedByCurrentUser(false);
        setCode(room.code ?? "");
        const loadedDifficulty = typeof room.difficulty === "number" ? closestDifficulty(room.difficulty) : 45;
        const loadedQuestionCount = typeof room.questionCount === "number" ? room.questionCount : 10;
        const loadedAnswerAttempts = typeof room.answerAttempts === "number" ? room.answerAttempts : 3;
        const loadedQcmUses = typeof room.qcmUses === "number" ? Math.min(room.qcmUses, loadedQuestionCount) : 3;
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
        setAnswerAttempts(loadedAnswerAttempts);
        setQcmUses(loadedQcmUses);
        setQuestionDuration(loadedQuestionDuration);
        setSelectedThemes(THEME_OPTIONS.filter((theme) => !loadedBannedThemes.includes(theme.key)).map((theme) => theme.key));
        setDynamicQuestionDisplay(loadedDynamicQuestionDisplay);
        setManualQuestionLaunch(loadedManualQuestionLaunch);
        setSpeedBonusEnabled(loadedSpeedBonusEnabled);
        setSavedSettings({
          difficulty: loadedDifficulty,
          questionCount: loadedQuestionCount,
          answerAttempts: loadedAnswerAttempts,
          qcmUses: loadedQcmUses,
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
    if (!canManageRoom || refreshingCode) return;
    setRefreshingCode(true);
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
    } finally {
      window.setTimeout(() => setRefreshingCode(false), 600);
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
          answerAttempts,
          qcmUses,
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
      const finalRoomName = data.result?.name;

      if (!id) throw new Error("Création: id manquant");

      if (finalCode && finalCode !== code) setCode(finalCode);
      setRoomName(finalRoomName?.trim() || "Salon privé");
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
          answerAttempts,
          qcmUses,
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

  function removeLobbyPlayer(playerId: string) {
    if (!lobbySocket || !canManageRoom || playerId === ownerPlayerId || removingPlayerId) return;
    setRemovingPlayerId(playerId);
    setErr(null);
    lobbySocket.emit("remove_lobby_player", { playerId }, (response: { ok: boolean; reason?: string }) => {
      setRemovingPlayerId(null);
      setSelectedLobbyPlayerId(null);
      if (!response?.ok) setErr("Impossible de supprimer ce joueur du salon.");
    });
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

            <nav className="create-room-steps" aria-label="Progression de la création">
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
                      "create-room-step",
                      active ? "is-active" : "",
                      disabled ? "is-disabled" : "",
                    ].join(" ")}
                  >
                    <span className="create-room-step-index">
                      {item.key === "settings" ? <Settings size={15} /> : <Users size={15} />}
                    </span>
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
            {activePanel === "lobby" && <div className="create-room-heading"><h2>{roomName || "Salon privé"}</h2></div>}
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
                    <PreviewSlider title="Nombre de vies" min={1} max={4} step={1} value={answerAttempts} onChange={setAnswerAttempts} isDisabled={!canManageRoom} />
                    <PreviewSlider title="Nombre de QCM possibles" min={0} max={questionCount} step={1} value={qcmUses} displayValue={(value) => value === questionCount ? "Pas de limite" : String(value)} onChange={setQcmUses} isDisabled={!canManageRoom} />
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

            {activePanel === "lobby" && (
              <div id="create-room-panel-lobby" role="tabpanel" aria-label="Lobby">
                {createdRoomId ? (
                  <div className="create-room-lobby">
                    <section className="create-room-access" aria-label="Code d’accès au salon">
                      <div className="create-room-access-controls">
                        <button type="button" className="create-room-access-code" onClick={() => setIsCodeHidden((hidden) => !hidden)} aria-label={isCodeHidden ? "Afficher le code de la partie" : "Masquer le code de la partie"} aria-pressed={isCodeHidden}>
                          {(isCodeHidden ? "*".repeat(code.length || 4) : code || "----").split("").map((character, index) => <span key={`${character}-${index}`} aria-hidden="true">{character}</span>)}
                        </button>
                        <div className="create-room-access-actions">
                          <button type="button" onClick={copyCode} disabled={!code} className={`create-room-code-action create-room-code-action--copy${copied ? " is-success" : ""}`} aria-label={copied ? "Code copié" : "Copier le code"} title={copied ? "Code copié" : "Copier le code"}>
                            <Copy size={15} />
                          </button>
                          <button type="button" onClick={refreshCodeFromServer} disabled={!canManageRoom || refreshingCode} className={`create-room-code-action create-room-code-action--refresh${refreshingCode ? " is-refreshing" : ""}`} aria-label="Renouveler le code" title="Renouveler le code">
                            <RefreshCw size={15} />
                          </button>
                        </div>
                      </div>
                    </section>
                    <div className="create-room-lobby-heading">
                      <div><span>Joueurs</span><strong>{orderedLobbyPlayers.length}</strong></div>
                      {orderedLobbyPlayers.length === 0 && <p>En attente de joueurs…</p>}
                    </div>
                    <div className="room-countdown-players create-room-lobby-players">
                      {visibleLobbyPlayers.map((player) => {
                        const canRemovePlayer = canManageRoom && player.id !== ownerPlayerId;
                        const menuOpen = selectedLobbyPlayerId === player.id;
                        return (
                        <div key={player.id} className={canRemovePlayer ? "create-room-player-card--interactive" : undefined} data-lobby-player-card={canRemovePlayer ? "" : undefined} role={canRemovePlayer ? "button" : undefined} tabIndex={canRemovePlayer ? 0 : undefined} aria-expanded={canRemovePlayer ? menuOpen : undefined} onClick={() => canRemovePlayer && setSelectedLobbyPlayerId(menuOpen ? null : player.id)} onKeyDown={(event) => { if (canRemovePlayer && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedLobbyPlayerId(menuOpen ? null : player.id); } }}>
                          <img src={player.img || "/img/profiles/0.avif"} alt="" draggable={false} loading="lazy" />
                          <strong>{player.name}</strong>
                          <small>Niveau {getLevelFromExperience(player.experience ?? 0)}</small>
                          {canRemovePlayer && <span className="create-room-player-menu-trigger" aria-hidden="true"><MoreHorizontal size={14} /></span>}
                          {menuOpen && (
                            <div className="create-room-player-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                              <button type="button" role="menuitem" disabled={removingPlayerId === player.id} onClick={() => removeLobbyPlayer(player.id)}>
                                <UserMinus size={14} /> {removingPlayerId === player.id ? "Suppression…" : "Supprimer le joueur"}
                              </button>
                            </div>
                          )}
                        </div>
                      );})}
                    </div>
                    <div className="create-room-lobby-pagination" aria-label={`Page ${lobbyPlayerPage + 1} sur ${lobbyPlayerPageCount}`}>
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