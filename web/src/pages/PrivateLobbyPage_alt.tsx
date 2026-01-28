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

// Taille d’affichage (pure UI) : nombre de “slots” visibles dans le lobby
const UI_SLOTS = 6;

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

function Pill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "success" | "warn";
}) {
  const toneCls =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-400/20 bg-amber-500/10 text-amber-200"
        : "border-[#2A2D3C] bg-[#181A28] text-slate-300";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
        toneCls,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function IconCopy({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 9h10v10H9V9Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShare({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 16V4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7 8l5-5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
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
  const [shared, setShared] = useState(false);
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

  const title = useMemo(() => {
    const base =
      ownerData?.name?.trim()
        ? `PARTIE DE ${ownerData.name.toUpperCase()}`
        : room?.name?.trim()
          ? `PARTIE DE ${room.name.toUpperCase()}`
          : "PARTIE PRIVÉE";
    return base;
  }, [ownerData?.name, room?.name]);

  const lobbyLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/rooms/${roomId}/lobby`;
  }, [roomId]);

  const playersCount = useMemo(() => {
    // players inclut l’hôte (la plupart du temps)
    return players?.length ?? 0;
  }, [players]);

  const visibleSlots = useMemo(() => {
    const n = Math.max(UI_SLOTS, 4);
    const empties = Math.max(0, n - 1 - otherPlayers.length); // -1 pour l’hôte
    return { total: n, empties };
  }, [otherPlayers.length]);

  const handleStart = () => {
    if (!socket || loadingStart) return;
    setLoadingStart(true);
    socket.emit("start_game");
    window.setTimeout(() => setLoadingStart(false), 1500);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(lobbyLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleInvite = async () => {
    // Web Share si dispo, sinon fallback = copier
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({
          title: "Invitation — Synapz",
          text: "Rejoins ma partie privée sur Synapz :",
          url: lobbyLink,
        });
        setShared(true);
        window.setTimeout(() => setShared(false), 1800);
        return;
      }
      await handleCopyLink();
    } catch {
      // si l’utilisateur annule le share, pas d’erreur bloquante
    }
  };

  return (
    <div className="relative min-h-screen text-slate-50">
      {/* background */}
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

      {/* page content (scrollable area under navbar) */}
      <div
        className="fixed left-0 right-0 bottom-0 z-10 lb-scroll overflow-y-auto"
        style={{ top: `${NAVBAR_HEIGHT_PX}px` }}
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-8 lg:px-10">
          {/* Header */}
          <header className="mb-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 className="truncate text-3xl font-brand text-white sm:text-4xl">{title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Pill tone="muted">{room?.visibility === "PRIVATE" ? "Salon privé" : "Salon"}</Pill>
                  <Pill tone={playersCount >= 2 ? "success" : "warn"}>
                    {playersCount} joueur{playersCount > 1 ? "s" : ""} connecté{playersCount > 1 ? "s" : ""}
                  </Pill>
                  {room?.code ? <Pill tone="muted">Code: {room.code}</Pill> : null}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:items-end">
                {isOwner ? (
                  <Pill tone="success">Vous êtes l’hôte</Pill>
                ) : (
                  <Pill tone="muted">En attente de l’hôte</Pill>
                )}
              </div>
            </div>
          </header>

          {/* Main layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left column: actions + host card */}
            <div className="lg:col-span-5">
              <div className="rounded-[10px] border border-[#2A2D3C] bg-[#1C1F2E] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div
                      aria-hidden
                      className="absolute -inset-2 rounded-[12px] opacity-40"
                      style={{
                        background:
                          "radial-gradient(140px 80px at 50% 50%, rgba(111,91,212,0.45) 0%, rgba(111,91,212,0) 70%)",
                      }}
                    />
                    <Avatar
                      src={ownerData?.img}
                      alt={ownerData?.name ?? "Hôte"}
                      className="relative h-14 w-14 rounded-[8px] object-cover shadow-[0_14px_32px_rgba(0,0,0,0.45)]"
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-white">
                      {ownerData?.name ?? "Hôte"}
                      <span className="ml-2 text-sm font-semibold text-slate-300">(hôte)</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      Invitez vos amis, puis lancez la partie quand tout le monde est prêt.
                    </p>
                  </div>
                </div>

                {/* Share / Invite */}
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Lien de la partie
                  </p>

                  <div className="mt-2 flex flex-col gap-3">
                    <div className="flex items-stretch gap-2">
                      <div className="flex-1">
                        <input
                          value={lobbyLink}
                          readOnly
                          onFocus={(e) => e.currentTarget.select()}
                          className="w-full rounded-[8px] border border-[#2A2D3C] bg-[#181A28] px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-[#6F5BD4]/60"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#2A2D3C] bg-[#181A28] px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-[#6F5BD4]/40 hover:text-white"
                        title="Copier le lien"
                      >
                        <IconCopy className="opacity-90" />
                        <span className="hidden sm:inline">{copied ? "Copié" : "Copier"}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleInvite}
                        className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#2A2D3C] bg-[#181A28] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-[#6F5BD4]/40 hover:text-white"
                      >
                        <IconShare className="opacity-90" />
                        {shared ? "Partagé" : "Inviter"}
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#2A2D3C] bg-[#181A28] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-[#6F5BD4]/40 hover:text-white"
                      >
                        <IconCopy className="opacity-90" />
                        {copied ? "Lien copié" : "Copier le lien"}
                      </button>
                    </div>

                    <div className="text-xs text-slate-400">
                      Astuce : clique dans le champ pour sélectionner le lien rapidement.
                    </div>
                  </div>
                </div>

                {/* Start */}
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={!isOwner}
                    className={[
                      "w-full rounded-[10px] px-4 py-3 text-base font-bold transition",
                      "shadow-[0_14px_28px_rgba(0,0,0,0.35)]",
                      isOwner
                        ? "bg-[#6F5BD4] text-white hover:brightness-110 active:brightness-95"
                        : "cursor-not-allowed bg-[#6F5BD4]/60 text-white/90",
                    ].join(" ")}
                  >
                    {loadingStart ? "Lancement…" : "Jouer"}
                  </button>

                  {!isOwner ? (
                    <p className="mt-3 text-center text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                      En attente du lancement de l&apos;hôte
                    </p>
                  ) : (
                    <p className="mt-3 text-center text-xs text-slate-400">
                      Lance la partie quand tout le monde est connecté.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Right column: players grid */}
            <div className="lg:col-span-7">
              <div className="rounded-[10px] border border-[#2A2D3C] bg-[#1C1F2E] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Joueurs dans le lobby
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      L’hôte apparaît en premier. Les autres joueurs remplissent les slots.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Pill tone={playersCount >= 2 ? "success" : "warn"}>
                      {playersCount}/{visibleSlots.total} en ligne
                    </Pill>
                  </div>
                </div>

                {/* Grid */}
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                  {/* Host slot */}
                  <div className="group relative overflow-hidden rounded-[10px] border border-[#2A2D3C] bg-[#181A28] p-4">
                    <div
                      aria-hidden
                      className="absolute -inset-12 opacity-0 transition group-hover:opacity-100"
                      style={{
                        background:
                          "radial-gradient(180px 120px at 50% 30%, rgba(111,91,212,0.35) 0%, rgba(111,91,212,0) 70%)",
                      }}
                    />
                    <div className="relative flex items-center gap-3">
                      <Avatar
                        src={ownerData?.img}
                        alt={ownerData?.name ?? "Hôte"}
                        className="h-12 w-12 rounded-[8px] object-cover shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {ownerData?.name ?? "Hôte"}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          hôte
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Other players */}
                  {otherPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="group relative overflow-hidden rounded-[10px] border border-[#2A2D3C] bg-[#181A28] p-4"
                    >
                      <div
                        aria-hidden
                        className="absolute -inset-12 opacity-0 transition group-hover:opacity-100"
                        style={{
                          background:
                            "radial-gradient(180px 120px at 50% 30%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%)",
                        }}
                      />
                      <div className="relative flex items-center gap-3">
                        <Avatar
                          src={player.img}
                          alt={player.name}
                          className="h-12 w-12 rounded-[8px] object-cover shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-100">{player.name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">connecté</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Empty slots */}
                  {Array.from({ length: visibleSlots.empties }).map((_, idx) => (
                    <div
                      key={`empty-${idx}`}
                      className="flex items-center gap-3 rounded-[10px] border border-[#2A2D3C] bg-[#2A2C3E] p-4"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-[8px] border border-[#2A2D3C] bg-[#181A28] text-lg font-bold text-slate-300">
                        +
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200">Slot libre</p>
                        <p className="mt-0.5 text-xs text-slate-400">Invite un joueur</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer hint */}
                <div className="mt-6 rounded-[10px] border border-[#2A2D3C] bg-[#181A28] px-4 py-3 text-sm text-slate-300">
                  <span className="font-semibold text-white">Objectif :</span> attendre la connexion des joueurs,
                  puis lancer la partie.
                </div>
              </div>
            </div>
          </div>

          {/* Spacer */}
          <div className="h-10" />
        </div>
      </div>
    </div>
  );
}
