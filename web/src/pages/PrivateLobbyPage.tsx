// web/src/pages/PrivateLobbyPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";

// ✅ import de la couronne depuis /web/src/assets
import hostCrown from "@/assets/crown.png";
// si pas d’alias @, utiliser par ex. :
// import hostCrown from "../assets/crown.png";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");

// Ajuste si ta navbar est plus haute/basse
const NAVBAR_HEIGHT_PX = 52;

type RoomMeta = {
  id: string;
  code?: string | null;
  name?: string | null;
  visibility?: "PUBLIC" | "PRIVATE";
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

const fallbackAvatar = "/img/profiles/0.avif";

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
    "inline-flex items-center justify-center rounded-[6px] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] transition";
  const secondary =
    "border border-[#2A2D3C] bg-[#181A28] text-slate-200 hover:text-white hover:bg-[#1A1D2D]";
  const primary =
    "border border-transparent bg-[#6F5BD4] text-white hover:brightness-110 disabled:brightness-75";

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={[
        base,
        variant === "primary" ? primary : secondary,
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
        className || "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

type RightTab = "JOUEURS" | "PARAMETRES";

/**
 * Tabs :
 * - séparateur vertical gris
 * - focus ring uniquement clavier + inset (pas de trait violet au centre)
 */
function Tabs({ value, onChange }: { value: RightTab; onChange: (v: RightTab) => void }) {
  const isLeft = value === "JOUEURS";

  const tabBtn =
    "relative z-10 flex h-10 items-center justify-center select-none px-5 text-[10px] font-semibold uppercase tracking-[0.38em] transition " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6F5BD4]/35";

  const underline = (
    <span aria-hidden className="absolute left-4 right-4 bottom-0 z-10 h-[3px] bg-[#6F5BD4]" />
  );

  return (
    <div
      role="tablist"
      aria-label="Panneau de droite"
      className="relative w-full max-w-[280px] overflow-hidden rounded-[3px] border border-[#2A2D3C] bg-[#1C1F2E]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 bottom-0 z-20 w-px bg-[#2A2D3C]"
      />

      <div className="grid grid-cols-2">
        <button
          type="button"
          role="tab"
          aria-selected={isLeft}
          onClick={() => onChange("JOUEURS")}
          className={[tabBtn, isLeft ? "text-white" : "text-slate-300 hover:text-slate-100"].join(
            " "
          )}
        >
          Joueurs
          {isLeft ? underline : null}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={!isLeft}
          onClick={() => onChange("PARAMETRES")}
          className={[
            tabBtn,
            !isLeft ? "text-white" : "text-slate-300 hover:text-slate-100",
          ].join(" ")}
        >
          Paramètres
          {!isLeft ? underline : null}
        </button>
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        "rounded-[10px] border border-[#2A2D3C] bg-[#1C1F2E] shadow-[0_30px_80px_rgba(0,0,0,0.45)]",
        className || "",
      ].join(" ")}
    >
      {children}
    </div>
  );
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

  // --- Auth user
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

  // --- Room meta
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

  // --- Socket
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

  // --- Join game
  useEffect(() => {
    if (!socket || !room) return;
    if (room.visibility === "PUBLIC" || !room.code) {
      socket.emit("join_game", { roomId: room.id });
    } else {
      socket.emit("join_game", { code: room.code });
    }
  }, [socket, room]);

  // --- Lobby state listeners
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

  // ✅ 1er slot = invite, + joueurs, puis placeholders
  const maxSlots = 8;
  const playersWithInviteCount = 1 + participantsCount(players, ownerData?.playerId);
  const baseEmpty = Math.max(0, maxSlots - playersWithInviteCount);

  // ✅ Tant qu'on n'a pas plus de 8 "cases" à montrer (invite + joueurs + vides),
  // on force exactement 2 lignes (8 cases) pour éviter la 3e ligne.
  const totalCellsToRender = Math.max(
    8,
    1 + participantsCount(players, ownerData?.playerId) + baseEmpty
  );
  const emptyCount = totalCellsToRender - (1 + participantsCount(players, ownerData?.playerId));

  function participantsCount(list: LobbyPlayer[], ownerPid?: string | null) {
    let c = 0;
    if (ownerPid) c += 1;
    for (const p of list) {
      if (ownerPid && p.id === ownerPid) continue;
      c += 1;
    }
    return c;
  }

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
    <div className="min-h-screen text-slate-50">
      <div aria-hidden className="fixed inset-0 bg-[#13141F]" />

      <main
        className="relative mx-auto w-full max-w-6xl px-6 pb-12"
        style={{ paddingTop: NAVBAR_HEIGHT_PX }}
      >
        {/* ✅ Conteneur de largeur "ancienne" + titre aligné avec le panneau */}
        <div className="mx-auto w-full max-w-[600px]">
          <header className="mb-10">
            <h1 className="text-4xl font-brand italic text-white">{title}</h1>
          </header>

          {/* ✅ 1 seul panneau (taille réduite, proche ancienne) */}
          <div className="w-full max-w-[980px]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <Tabs value={rightTab} onChange={setRightTab} />

              <Button
                variant="primary"
                disabled={!isOwner}
                onClick={handleStart}
                className="h-10 px-6 py-0 text-[12px] tracking-[0.22em]"
              >
                {loadingStart ? "Lancement…" : "Jouer"}
              </Button>
            </div>

            <Card>
              <div className="p-8">
                {rightTab === "JOUEURS" ? (
                  // ✅ centre verticalement le contenu dans une hauteur contrôlée (pas trop grande)
                  <div className="flex min-h-[220px] items-center justify-center">
                    <div className="grid grid-cols-4 justify-items-center gap-x-14 gap-y-10">
                      {/* INVITE : petit + centré verticalement */}
                      <button
                        type="button"
                        onClick={handleInvite}
                        className="group flex w-[92px] flex-col items-center gap-2"
                        aria-label="Inviter des joueurs"
                        title="Inviter"
                      >
                        <div className="flex h-14 w-14 items-center justify-center">
                          <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#6F5BD4] shadow-[0_10px_26px_rgba(0,0,0,0.35)] transition group-hover:brightness-110">
                            <span className="text-lg font-semibold text-white">+</span>
                          </div>
                        </div>
                        <span className="h-4" aria-hidden />
                      </button>

                      {/* joueurs */}
                      {participants.map((p) => (
                        <div key={p.id} className="flex w-[92px] flex-col items-center gap-2">
                          <div className="relative">
                            {p.role === "host" && (
                              <img
                                src={hostCrown}
                                alt="Hôte"
                                draggable={false}
                                className="pointer-events-none absolute -top-5 left-1/2 z-20 h-5 w-8 -translate-x-1/2 drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
                              />
                            )}
                            <Avatar
                              src={p.img}
                              alt={p.name}
                              className="h-14 w-14 rounded-[6px] object-cover shadow-[0_10px_26px_rgba(0,0,0,0.35)]"
                            />
                          </div>

                          <p className="w-full truncate text-center text-xs font-semibold text-slate-100">
                            {p.name}
                          </p>
                        </div>
                      ))}

                      {/* placeholders : carrés sans croix */}
                      {Array.from({ length: emptyCount }).map((_, idx) => (
                        <div key={`empty-${idx}`} className="flex w-[92px] flex-col items-center gap-2">
                          <div
                            className="h-14 w-14 rounded-[6px] border border-[#2A2D3C] bg-[#2A2C3E] shadow-[0_10px_26px_rgba(0,0,0,0.18)]"
                            aria-hidden
                          />
                          <span className="h-4" aria-hidden />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="rounded-[8px] border border-[#2A2D3C] bg-[#181A28] p-4">
                      <p className="text-sm font-semibold text-white">Paramètres</p>
                      <p className="mt-1 text-xs text-slate-400">
                        (UI locale) Tu peux brancher ces options à ton backend plus tard.
                      </p>
                    </div>

                    <div className="rounded-[8px] border border-[#2A2D3C] bg-[#181A28] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                        Visibilité
                      </p>
                      <p className="mt-2 text-sm text-slate-100">
                        {room?.visibility
                          ? room.visibility === "PRIVATE"
                            ? "Partie privée"
                            : "Partie publique"
                          : "—"}
                      </p>
                    </div>

                    <div className="rounded-[8px] border border-[#2A2D3C] bg-[#181A28] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                        Lien
                      </p>
                      <p className="mt-2 break-all text-sm text-slate-100">{link}</p>
                    </div>

                    <div className="rounded-[8px] border border-[#2A2D3C] bg-[#181A28] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                        Copier le lien
                      </p>
                      <div className="mt-3">
                        <Button onClick={handleCopyLink}>{copied ? "LIEN COPIÉ" : "COPIER"}</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
