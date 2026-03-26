// web/src/pages/PrivateLobbyPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";

import hostCrown from "@/assets/crown.png";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");

const NAVBAR_HEIGHT_PX = 52;

type RoomMeta = {
  id: string;
  code?: string | null;
  name?: string | null;
  visibility?: "PUBLIC" | "PRIVATE";
  difficulty?: number | null;
  questionCount?: number | null;
  roundMs?: number | null;
  bannedThemes?: string[] | null;
};

type LobbyOwner = {
  userId?: string | null;
  playerId?: string | null;
  name?: string | null;
  img?: string | null;
};

type LobbyPlayer = {
  id: string;
  name: string;
  img?: string | null;
};

type LobbyStatePayload = {
  room?: { id: string; name?: string | null };
  owner?: LobbyOwner;
  players?: LobbyPlayer[];
};

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

type RightTab = "JOUEURS" | "PARAMETRES";

const fallbackAvatar = "/img/profiles/0.avif";

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function percent(value: number, min: number, max: number) {
  if (max <= min) return "0%";
  const p = clamp01((value - min) / (max - min)) * 100;
  return `${p}%`;
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
    const msg = (data as any)?.error || (data as any)?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

function Avatar({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <img
      src={src || fallbackAvatar}
      alt={alt}
      className={className}
      onError={(event) => {
        (event.currentTarget as HTMLImageElement).src = fallbackAvatar;
      }}
      loading="lazy"
      draggable={false}
    />
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
  className,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "secondary" | "primary";
  className?: string;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center rounded-[4px] text-[10px] font-bold uppercase tracking-[0.12em] transition";
  const secondary =
    "bg-[#cfcfd2] text-[#232323] hover:bg-[#c4c4c9]";
  const primary =
    "bg-[#6b5ad6] text-white hover:bg-[#5f4fcb]";

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={[
        base,
        variant === "primary" ? primary : secondary,
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        className || "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        "rounded-[8px] border border-[#d5d5d8] bg-[#ececed] shadow-[0_10px_24px_rgba(0,0,0,0.14)]",
        className || "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function Tabs({ value, onChange }: { value: RightTab; onChange: (v: RightTab) => void }) {
  const isPlayers = value === "JOUEURS";

  const tabClass =
    "flex h-9 items-center justify-center text-[10px] font-bold uppercase tracking-[0.08em] transition";

  return (
    <div className="grid w-full max-w-[260px] grid-cols-2 rounded-[4px] bg-[#cfcfd2] p-[2px]">
      <button
        type="button"
        role="tab"
        aria-selected={isPlayers}
        onClick={() => onChange("JOUEURS")}
        className={[
          tabClass,
          isPlayers ? "rounded-[3px] bg-[#6b5ad6] text-white" : "text-[#232323] hover:bg-[#c4c4c9]",
        ].join(" ")}
      >
        Joueurs
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={!isPlayers}
        onClick={() => onChange("PARAMETRES")}
        className={[
          tabClass,
          !isPlayers ? "rounded-[3px] bg-[#6b5ad6] text-white" : "text-[#232323] hover:bg-[#c4c4c9]",
        ].join(" ")}
      >
        Paramètres
      </button>
    </div>
  );
}

function participantsCount(list: LobbyPlayer[], ownerPid?: string | null) {
  let count = 0;
  if (ownerPid) count += 1;
  for (const p of list) {
    if (ownerPid && p.id === ownerPid) continue;
    count += 1;
  }
  return count;
}

export default function PrivateLobbyPage() {
  const nav = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [owner, setOwner] = useState<LobbyOwner | null>(null);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [loadingStart, setLoadingStart] = useState(false);

  const [copied, setCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [me, setMe] = useState<{ userId?: string | null; playerId?: string | null } | null>(null);

  const [rightTab, setRightTab] = useState<RightTab>("JOUEURS");

  const themeOptionsSorted = useMemo(
    () =>
      [...THEME_OPTIONS].sort((a, b) =>
        a.label.localeCompare(b.label, "fr", { sensitivity: "base" }),
      ),
    [],
  );

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

    fetchJSON("/auth/me")
      .then((data) => {
        if (!mounted) return;
        setMe({ userId: data?.user?.id ?? null, playerId: data?.user?.playerId ?? null });
      })
      .catch(() => {
        if (mounted) setMe(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!roomId) return;

    let mounted = true;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/rooms/${roomId}`, { credentials: "include" });

        if (res.status === 410) {
          nav("/");
          return;
        }
        if (!res.ok) throw new Error("room_not_found");

        const data = (await res.json()) as { room: RoomMeta };
        if (mounted) setRoom(data.room);
      } catch {
        nav("/");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [roomId, nav]);

  useEffect(() => {
    const s = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    setSocket(s);

    return () => {
      s.close();
    };
  }, []);

  useEffect(() => {
    if (!socket || !room) return;

    if (room.visibility === "PUBLIC" || !room.code) {
      socket.emit("join_game", { roomId: room.id });
    } else {
      socket.emit("join_game", { code: room.code });
    }
  }, [socket, room]);

  useEffect(() => {
    if (!socket) return;

    const handleLobbyState = (payload: LobbyStatePayload) => {
      setOwner(payload.owner ?? null);
      setPlayers(payload.players ?? []);
    };

    const requestLobbyState = () => {
      socket.emit("lobby_state", {}, (res: { ok: boolean } & LobbyStatePayload) => {
        if (res?.ok) handleLobbyState(res);
      });
    };

    socket.on("joined", requestLobbyState);
    socket.on("lobby_update", requestLobbyState);
    socket.on("game_started", () => {
      const targetId = room?.id ?? roomId;
      if (targetId) nav(`/room/${targetId}`, { replace: true });
    });

    requestLobbyState();

    return () => {
      socket.off("joined", requestLobbyState);
      socket.off("lobby_update", requestLobbyState);
      socket.off("game_started");
    };
  }, [socket, nav, room?.id, roomId]);

  const ownerData = useMemo(() => {
    if (!owner) return null;
    const fallback = players.find((player) => player.id === owner.playerId);

    return {
      playerId: owner.playerId ?? fallback?.id ?? null,
      name: owner.name ?? fallback?.name ?? "Hôte",
      img: owner.img ?? fallback?.img ?? fallbackAvatar,
      userId: owner.userId ?? null,
    };
  }, [owner, players]);

  const isOwner = Boolean(ownerData?.userId && me?.userId === ownerData.userId);

  const link = useMemo(() => {
    const rid = room?.id ?? roomId;
    return `${window.location.origin}/rooms/${rid}/lobby`;
  }, [room?.id, roomId]);

  const inviteMessage = useMemo(() => {
    const name = ownerData?.name ? ownerData.name : "un ami";
    return `Rejoins ma partie privée (${name}) 👇\n${link}`;
  }, [ownerData?.name, link]);

  const title = useMemo(() => {
    if (ownerData?.name) return `PARTIE DE ${ownerData.name.toUpperCase()}`;
    if (room?.name) return `PARTIE DE ${room.name.toUpperCase()}`;
    return "PARTIE PRIVÉE";
  }, [ownerData?.name, room?.name]);

  const difficulty = Number.isFinite(room?.difficulty) ? Number(room?.difficulty) : 50;
  const questionCount = Number.isFinite(room?.questionCount) ? Number(room?.questionCount) : 10;
  const roundSeconds = Number.isFinite(room?.roundMs)
    ? Math.max(1, Math.round(Number(room?.roundMs) / 1000))
    : 10;

  const bannedThemeKeys = useMemo(
    () => new Set((room?.bannedThemes ?? []) as string[]),
    [room?.bannedThemes],
  );

  const selectedThemeKeys = useMemo(
    () => THEME_OPTIONS.map((t) => t.key).filter((key) => !bannedThemeKeys.has(key)),
    [bannedThemeKeys],
  );

  const difficultyP = percent(difficulty, 0, 100);
  const qcountP = percent(questionCount, 1, 50);
  const qdurP = percent(roundSeconds, 3, 60);

  const maxSlots = 8;
  const playersWithInviteCount = 1 + participantsCount(players, ownerData?.playerId);
  const baseEmpty = Math.max(0, maxSlots - playersWithInviteCount);
  const totalCellsToRender = Math.max(
    8,
    1 + participantsCount(players, ownerData?.playerId) + baseEmpty,
  );
  const emptyCount = totalCellsToRender - (1 + participantsCount(players, ownerData?.playerId));

  const participants = useMemo(() => {
    const list: { id: string; name: string; img?: string | null; role?: "host" | "player" }[] = [];

    if (ownerData?.playerId) {
      list.push({
        id: ownerData.playerId,
        name: ownerData.name ?? "Hôte",
        img: ownerData.img ?? fallbackAvatar,
        role: "host",
      });
    }

    for (const p of players) {
      if (ownerData?.playerId && p.id === ownerData.playerId) continue;
      list.push({ id: p.id, name: p.name, img: p.img ?? null, role: "player" });
    }

    return list;
  }, [players, ownerData?.playerId, ownerData?.name, ownerData?.img]);

  const handleStart = () => {
    if (!socket || loadingStart) return;
    setLoadingStart(true);
    socket.emit("start_game");
    window.setTimeout(() => setLoadingStart(false), 1500);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteMessage);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      setInviteCopied(false);
    }
  };

  return (
    <div className="relative text-slate-900">
      <div aria-hidden className="fixed inset-0 bg-[#13141F]" />

      <style>{`
        .lb-scroll {
          scrollbar-width: thin;
          scrollbar-color: #6f63b9 rgba(255,255,255,0.08);
        }

        .lb-scroll::-webkit-scrollbar { width: 10px; }

        .lb-scroll::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.08);
          border-radius: 999px;
        }

        .lb-scroll::-webkit-scrollbar-thumb {
          background: #6f63b9;
          border-radius: 999px;
          border: 2px solid rgba(0,0,0,0);
          background-clip: padding-box;
        }

        .lb-scroll::-webkit-scrollbar-thumb:hover {
          background: #7c70cb;
        }

        input[type="range"].syn-range {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          background: transparent;
          outline: none;
          cursor: default;
        }

        input[type="range"].syn-range::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 999px;
          background:
            linear-gradient(var(--fill) 0 0) 0 / var(--p) 100% no-repeat,
            var(--track);
        }

        input[type="range"].syn-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          margin-top: -6px;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #ffffff;
          border: none;
          box-shadow: 0 6px 16px rgba(18, 20, 38, 0.18);
        }

        input[type="range"].syn-range::-moz-range-track {
          height: 6px;
          border-radius: 999px;
          background: var(--track);
        }

        input[type="range"].syn-range::-moz-range-progress {
          height: 6px;
          border-radius: 999px;
          background: var(--fill);
        }

        input[type="range"].syn-range::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #ffffff;
          border: none;
          box-shadow: 0 6px 16px rgba(18, 20, 38, 0.18);
        }
      `}</style>

      <div
        className="fixed left-0 right-0 bottom-0 z-10 overflow-y-auto lb-scroll"
        style={{ top: `${NAVBAR_HEIGHT_PX}px` }}
      >
        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
          <div className="mx-auto max-w-3xl">
            <header className="mb-10 text-center">
              <h1 className="text-4xl font-brand italic text-white sm:text-5xl">{title}</h1>
            </header>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <Tabs value={rightTab} onChange={setRightTab} />

              <Button
                variant="primary"
                disabled={!isOwner}
                onClick={handleStart}
                className="h-10 min-w-[140px] px-5"
              >
                {loadingStart ? "Lancement…" : "Jouer"}
              </Button>
            </div>

            <Card>
              <div className="px-5 py-4">
                {rightTab === "JOUEURS" ? (
                  <div className="flex min-h-[280px] items-center justify-center">
                    <div className="grid grid-cols-4 justify-items-center gap-x-10 gap-y-8">
                      <button
                        type="button"
                        onClick={handleInvite}
                        className="group flex w-[84px] flex-col items-center gap-2"
                        aria-label="Inviter des joueurs"
                        title={inviteCopied ? "Invitation copiée" : "Inviter"}
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-[6px] bg-[#6b5ad6] shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition group-hover:bg-[#5f4fcb]">
                          <span className="text-lg font-semibold text-white">
                            {inviteCopied ? "✓" : "+"}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#444]">
                          Inviter
                        </span>
                      </button>

                      {participants.map((p) => (
                        <div key={p.id} className="flex w-[84px] flex-col items-center gap-2">
                          <div className="relative">
                            {p.role === "host" && (
                              <img
                                src={hostCrown}
                                alt="Hôte"
                                draggable={false}
                                className="pointer-events-none absolute -top-5 left-1/2 z-20 h-5 w-8 -translate-x-1/2 drop-shadow-[0_4px_10px_rgba(0,0,0,0.22)]"
                              />
                            )}

                            <Avatar
                              src={p.img}
                              alt={p.name}
                              className="h-14 w-14 rounded-[6px] object-cover shadow-[0_10px_24px_rgba(0,0,0,0.14)]"
                            />
                          </div>

                          <p className="w-full truncate text-center text-[11px] font-semibold text-[#232323]">
                            {p.name}
                          </p>
                        </div>
                      ))}

                      {Array.from({ length: emptyCount }).map((_, idx) => (
                        <div key={`empty-${idx}`} className="flex w-[84px] flex-col items-center gap-2">
                          <div
                            className="h-14 w-14 rounded-[6px] bg-[#d0d0d2] shadow-[0_8px_18px_rgba(0,0,0,0.08)]"
                            aria-hidden
                          />
                          <span className="h-4" aria-hidden />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-[5px] bg-[#d8d8d9] p-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-semibold text-[#191919]">Difficulté</span>
                        <span className="rounded-[4px] bg-[#c5c5c7] px-2 py-1 text-[11px] font-bold text-[#2c2c2c]">
                          {difficulty}%
                        </span>
                      </div>

                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={difficulty}
                        disabled
                        className="syn-range"
                        style={
                          {
                            ["--track" as any]: "#a9a9ac",
                            ["--fill" as any]: "#6b5ad6",
                            ["--p" as any]: difficultyP,
                          } as React.CSSProperties
                        }
                      />

                      <div className="mt-1 flex justify-between text-[9px] font-semibold uppercase tracking-[0.14em] text-[#666]">
                        <span>0</span>
                        <span>50</span>
                        <span>100</span>
                      </div>
                    </div>

                    <div className="rounded-[5px] bg-[#d8d8d9] p-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-semibold text-[#191919]">Questions</span>
                        <span className="rounded-[4px] bg-[#c5c5c7] px-2 py-1 text-[11px] font-bold text-[#2c2c2c]">
                          {questionCount}
                        </span>
                      </div>

                      <input
                        type="range"
                        min={1}
                        max={50}
                        step={1}
                        value={questionCount}
                        disabled
                        className="syn-range"
                        style={
                          {
                            ["--track" as any]: "#a9a9ac",
                            ["--fill" as any]: "#6b5ad6",
                            ["--p" as any]: qcountP,
                          } as React.CSSProperties
                        }
                      />

                      <div className="mt-1 flex justify-between text-[9px] font-semibold uppercase tracking-[0.14em] text-[#666]">
                        <span>1</span>
                        <span>25</span>
                        <span>50</span>
                      </div>
                    </div>

                    <div className="rounded-[5px] bg-[#d8d8d9] p-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-semibold text-[#191919]">
                          Durée / question
                        </span>
                        <span className="rounded-[4px] bg-[#c5c5c7] px-2 py-1 text-[11px] font-bold text-[#2c2c2c]">
                          {roundSeconds}
                          <span className="lowercase">s</span>
                        </span>
                      </div>

                      <input
                        type="range"
                        min={3}
                        max={60}
                        step={1}
                        value={roundSeconds}
                        disabled
                        className="syn-range"
                        style={
                          {
                            ["--track" as any]: "#a9a9ac",
                            ["--fill" as any]: "#6b5ad6",
                            ["--p" as any]: qdurP,
                          } as React.CSSProperties
                        }
                      />

                      <div className="mt-1 flex justify-between text-[9px] font-semibold uppercase tracking-[0.14em] text-[#666]">
                        <span>
                          3<span className="lowercase">s</span>
                        </span>
                        <span>
                          30<span className="lowercase">s</span>
                        </span>
                        <span>
                          60<span className="lowercase">s</span>
                        </span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-end justify-between gap-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#444]">
                          Thèmes{" "}
                          <span className="text-[#6c6c6c]">
                            ({selectedThemeKeys.length}/{THEME_OPTIONS.length})
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {themeOptionsSorted.map(({ key, label }) => {
                          const active = selectedThemeKeys.includes(key);

                          return (
                            <div
                              key={key}
                              className={[
                                "flex items-center justify-between gap-2 rounded-[4px] px-2.5 py-2 text-left text-[11px] font-semibold",
                                active
                                  ? "bg-[#7061d8] text-white"
                                  : "bg-[#d7d7da] text-[#222]",
                              ].join(" ")}
                            >
                              <span className="truncate">{label}</span>
                              <span
                                className={[
                                  "flex h-4 w-4 items-center justify-center rounded-[3px] text-[10px] leading-none",
                                  active ? "bg-white/20 text-white" : "bg-[#bebec2] text-[#555]",
                                ].join(" ")}
                                aria-hidden
                              >
                                {active ? "✓" : "—"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-[5px] bg-[#d8d8d9] p-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#444]">
                        Visibilité
                      </div>
                      <div className="mt-1 text-[12px] font-semibold text-[#232323]">
                        {room?.visibility
                          ? room.visibility === "PRIVATE"
                            ? "Partie privée"
                            : "Partie publique"
                          : "—"}
                      </div>
                    </div>

                    <div className="rounded-[5px] bg-[#d8d8d9] p-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#444]">
                        Lien
                      </div>
                      <div className="mt-1 break-all text-[12px] font-semibold text-[#232323]">
                        {link}
                      </div>
                    </div>

                    <div className="rounded-[5px] bg-[#d8d8d9] p-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#444]">
                        Copier le lien
                      </div>
                      <div className="mt-3">
                        <Button onClick={handleCopyLink} className="h-9 px-4">
                          {copied ? "Lien copié" : "Copier"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}