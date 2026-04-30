// web/src/pages/Home.tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import playerIcon from "../assets/player.png";
import cardsIcon from "../assets/cards.png";

const API_BASE = import.meta.env.VITE_API_BASE as string;
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");
const PUBLIC_ROOMS_UPDATED_EVENT = "public_rooms_updated";

type RoomListItem = {
  id: string;
  name?: string | null;
  image?: string | null;
  difficulty?: number;
  playerCount?: number;
  questionCount?: number;
  progressCount?: number;
};

type RoomDetail = { id: string; code?: string | null };

export default function Home() {
  const nav = useNavigate();

  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function fetchJSON(path: string, init?: RequestInit) {
    const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const data = isJson ? await res.json() : undefined;

    if (!res.ok) {
      throw new Error((data as any)?.error || (data as any)?.message || `HTTP ${res.status}`);
    }
    return data;
  }

  const loadRooms = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setErr(null);
    try {
      const data = await fetchJSON("/rooms");
      const list = Array.isArray((data as any).rooms) ? ((data as any).rooms as RoomListItem[]) : [];
      const sorted = [...list].sort((a, b) => {
        const aDiff = typeof a.difficulty === "number" ? a.difficulty : Number.POSITIVE_INFINITY;
        const bDiff = typeof b.difficulty === "number" ? b.difficulty : Number.POSITIVE_INFINITY;
        if (aDiff !== bDiff) return aDiff - bDiff;
        return a.id.localeCompare(b.id);
      });
      setRooms(sorted);
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRooms(true);
  }, [loadRooms]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    const refreshRooms = () => {
      void loadRooms(false);
    };

    socket.on("connect", refreshRooms);
    socket.on(PUBLIC_ROOMS_UPDATED_EVENT, refreshRooms);

    return () => {
      socket.off("connect", refreshRooms);
      socket.off(PUBLIC_ROOMS_UPDATED_EVENT, refreshRooms);
      socket.close();
    };
  }, [loadRooms]);

  async function openRoom(roomId: string) {
    try {
      const data = (await fetchJSON(`/rooms/${roomId}`)) as { room: RoomDetail };
      const code = (data.room?.code ?? "").trim();
      const goToRoom = (target: string) => {
        sessionStorage.setItem("join-loading", "1");
        nav(target);
      };

      if (!code) return goToRoom(`/room/${roomId}`);

      const userCode = (prompt("Cette room est privée. Entrez le code :") || "")
        .trim()
        .toUpperCase();

      if (!userCode) return;
      if (userCode === code.toUpperCase()) goToRoom(`/room/${roomId}`);
      else alert("Code invalide.");
    } catch (e: any) {
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("410") || msg.includes("room closed")) {
        alert("Cette room est fermée.");
        await loadRooms();
        return;
      }
      alert(e?.message || "Impossible d'ouvrir la room");
    }
  }

  return (
    <div className="relative min-h-full overflow-hidden text-slate-50">
      <div aria-hidden className="fixed inset-0 bg-[#060A19]" />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 py-12 sm:px-8 lg:px-10">
        <header className="text-center">
          <h1 className="text-4xl font-brand text-slate-50 sm:text-5xl">PARTIES MULTIJOUEURS</h1>
        </header>

        {loading && <div className="mt-6 text-center text-sm text-white/75">Chargement…</div>}
        {err && <div className="mt-6 text-center text-sm text-red-300">{err}</div>}

        {!loading && !err && rooms.length === 0 && (
          <div className="mt-16 text-center text-sm text-white/70">
            Aucun salon public disponible.
          </div>
        )}

        {!loading && !err && rooms.length > 0 && (
          <div className="mt-16 flex flex-wrap justify-center gap-8">
            {rooms.map((room) => {
              const imageUrl = room.image ? `${API_BASE}/img/interface/${room.image}.avif` : "";
              const label = room.name?.trim() || "Salon public";
              const players =
                typeof room.playerCount === "number" ? room.playerCount : null;
              const questionCount = Math.max(0, Number(room.questionCount) || 0);
              const progressCount = Math.max(
                0,
                Math.min(questionCount, Number(room.progressCount) || 0),
              );

              return (
                <div
                  key={room.id}
                  className="group flex w-full max-w-[240px] flex-col items-center transition-transform duration-200 hover:z-10 hover:scale-[1.05]"
                >
                  <button
                    type="button"
                    onClick={() => openRoom(room.id)}
                    aria-label={`Ouvrir ${label}`}
                    className="relative w-full overflow-hidden rounded-[6px] border-2 border-white/20 bg-white/5 shadow-[0_18px_40px_rgba(0,0,0,.45)] transition group-hover:border-white"
                  >
                    <div className="relative aspect-[5/6] w-full overflow-hidden">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={label}
                          className="h-full w-full object-cover transition duration-500"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900" />
                      )}

                      <div className="absolute inset-0 flex flex-col p-4 text-white">
                        <div className="text-center text-3xl font-brand leading-none drop-shadow-[0_3px_6px_rgba(0,0,0,.65)]">
                          {label}
                        </div>

                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <img
                            src={cardsIcon}
                            alt=""
                            className="h-28 w-28 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,.5)]"
                            draggable={false}
                          />
                        </div>

                        <div className="mt-auto flex flex-col items-center justify-end gap-3 pb-3 text-[20px] font-semibold leading-none drop-shadow-[0_3px_6px_rgba(0,0,0,.65)]">
                          <div className="flex items-center justify-center gap-2">
                            <span>{players ?? "—"}</span>
                            <img
                              src={playerIcon}
                              alt=""
                              className="h-5 w-5 object-contain"
                              draggable={false}
                            />
                          </div>
                          <div
                            className="flex w-full items-center justify-center gap-[2px] px-3"
                            aria-label={`Progression de la partie : ${progressCount} sur ${questionCount || 0} question${questionCount === 1 ? "" : "s"}`}
                          >
                            {questionCount > 0
                              ? Array.from({ length: questionCount }, (_, index) => {
                                  const isCompleted = index < progressCount;
                                  return (
                                    <span
                                      key={`${room.id}-progress-${index}`}
                                      className={[
                                        "h-5 flex-1 rounded-[1px] border border-black/15",
                                        isCompleted ? "bg-white" : "bg-[#7E718D]",
                                      ].join(" ")}
                                    />
                                  );
                                })
                              : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
