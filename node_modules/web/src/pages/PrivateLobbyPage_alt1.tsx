// web/src/pages/PrivateLobbyPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";

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

export default function PrivateLobbyPage() {
  const nav = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [owner, setOwner] = useState<LobbyOwner | null>(null);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [loadingStart, setLoadingStart] = useState(false);
  const [copied, setCopied] = useState(false);
  const [me, setMe] = useState<{ userId?: string | null; playerId?: string | null } | null>(null);

  // ✅ Empêcher le scroll global (sinon 2 scrollbars)
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

  const otherPlayers = useMemo(() => {
    if (!ownerData?.playerId) return players;
    return players.filter((player) => player.id !== ownerData.playerId);
  }, [players, ownerData?.playerId]);

  const isOwner = Boolean(ownerData?.userId && me?.userId === ownerData.userId);

  const handleStart = () => {
    if (!socket || loadingStart) return;
    setLoadingStart(true);
    socket.emit("start_game");
    window.setTimeout(() => setLoadingStart(false), 1500);
  };

  const handleCopyLink = async () => {
    const link = `${window.location.origin}/rooms/${roomId}/lobby`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="relative min-h-screen text-slate-50">
      <div aria-hidden className="fixed inset-0 bg-[#13141F]" />

      <style>{`
        .lb-scroll {
          scrollbar-width: thin;
          scrollbar-color: #4A4B56 #1E1F28;
        }
        .lb-scroll::-webkit-scrollbar { width: 12px; }
        .lb-scroll::-webkit-scrollbar-track {
          background: #1E1F28;
          border-radius: 999px;
        }
        .lb-scroll::-webkit-scrollbar-button {
          background-color: #4A4B56;
          height: 12px;
        }
        .lb-scroll::-webkit-scrollbar-thumb {
          background: #4A4B56;
          border-radius: 999px;
          border: 3px solid rgba(0,0,0,0);
          background-clip: padding-box;
        }
        .lb-scroll::-webkit-scrollbar-thumb:hover {
          background: #4A4B56;
          border: 3px solid rgba(0,0,0,0);
          background-clip: padding-box;
        }
      `}</style>

      <div
        className="fixed left-0 right-0 bottom-0 z-10 lb-scroll overflow-y-auto"
        style={{ top: `${NAVBAR_HEIGHT_PX}px` }}
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-10 sm:px-8 lg:px-10">
          <header className="mb-12 text-center">
            <h1 className="text-4xl font-brand text-white sm:text-5xl">
              {ownerData?.name
                ? `PARTIE DE ${ownerData.name.toUpperCase()}`
                : room?.name
                  ? `PARTIE DE ${room.name.toUpperCase()}`
                  : "PARTIE PRIVÉE"}
            </h1>
          </header>

          <div className="flex w-full flex-col items-center gap-10 pb-10">
            <div className="flex flex-col items-center gap-3">
              <Avatar
                src={ownerData?.img}
                alt={ownerData?.name ?? "Hôte"}
                className="h-16 w-16 rounded-[6px] object-cover shadow-[0_14px_32px_rgba(0,0,0,0.45)]"
              />
              <div className="text-center">
                <p className="text-lg font-semibold text-white">
                  {ownerData?.name ?? "Hôte"} <span className="text-slate-300">(hôte)</span>
                </p>
              </div>
            </div>

            <div className="flex w-full max-w-3xl flex-col gap-4">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  className="rounded-[6px] border border-[#2A2D3C] bg-[#181A28] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:text-white"
                >
                  Inviter
                </button>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="rounded-[6px] border border-[#2A2D3C] bg-[#181A28] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:text-white"
                >
                  {copied ? "Lien copié" : "Copier le lien"}
                </button>
              </div>

              <div className="rounded-[6px] border border-[#2A2D3C] bg-[#1C1F2E] px-6 py-6">
                {otherPlayers.length ? (
                  <div className="flex flex-wrap items-center justify-center gap-10">
                    {otherPlayers.map((player) => (
                      <div key={player.id} className="flex flex-col items-center gap-2">
                        <div className="relative">
                          <Avatar
                            src={player.img}
                            alt={player.name}
                            className="h-20 w-20 rounded-[6px] object-cover shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                          />
                        </div>
                        <p className="text-sm font-semibold text-slate-100">{player.name}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`empty-${index}`}
                        // ✅ Fond demandé: #2A2C3E (et on garde border/text "LoginPage-like")
                        className="flex h-14 w-14 items-center justify-center rounded-[6px] border border-[#2A2D3C] bg-[#2A2C3E] text-xl font-semibold text-slate-300"
                      >
                        +
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleStart}
              disabled={!isOwner}
              style={{
                width: "100%",
                maxWidth: 320,
                marginTop: 6,
                padding: "12px 16px",
                borderRadius: 8,
                border: "none",
                background: "#6F5BD4",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 18,
                cursor: isOwner ? "pointer" : "not-allowed",
                opacity: isOwner ? 1 : 0.5,
              }}
            >
              {loadingStart ? "Lancement…" : "Jouer"}
            </button>

            {!isOwner && (
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                En attente du lancement de l&apos;hôte
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
