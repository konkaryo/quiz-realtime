// web/src/pages/Home.tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import playerIcon from "../assets/player.png";

const API_BASE = import.meta.env.VITE_API_BASE as string;
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");
const PUBLIC_ROOMS_UPDATED_EVENT = "public_rooms_updated";

function roomDifficultyLabel(value?: number | null): string {
  const difficulty = typeof value === "number" && Number.isFinite(value) ? value : 50;

  if (difficulty <= 25) return "FACILE";
  if (difficulty <= 50) return "MODÉRÉ";
  if (difficulty <= 75) return "DIFFICILE";
  return "EXTRÊME";
}

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
      <div
        aria-hidden
        className="fixed inset-0 bg-[radial-gradient(ellipse_at_16%_38%,rgba(24,36,74,0.42),transparent_46%),radial-gradient(ellipse_at_82%_44%,rgba(22,34,70,0.36),transparent_50%)]"
      />
      <svg
        aria-hidden="true"
        className="fixed inset-0 h-full w-full opacity-70"
        preserveAspectRatio="none"
        viewBox="0 0 1440 900"
      >
        <defs>
          <linearGradient id="homeWaveA" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#0A132E" stopOpacity="0.06" />
            <stop offset="45%" stopColor="#1C2A52" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#0A132E" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="homeWaveB" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#071028" stopOpacity="0.02" />
            <stop offset="52%" stopColor="#22315A" stopOpacity="0.36" />
            <stop offset="100%" stopColor="#071028" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path
          d="M-120 220 C 180 105 390 270 650 175 C 900 85 1110 175 1560 70 L1560 0 L-120 0 Z"
          fill="url(#homeWaveA)"
        />
        <path
          d="M-120 500 C 180 390 410 545 700 440 C 980 340 1160 420 1560 330 L1560 170 C 1130 265 970 185 690 290 C 410 395 170 250 -120 350 Z"
          fill="url(#homeWaveB)"
        />
        <path
          d="M-120 760 C 210 650 430 785 720 690 C 1010 595 1190 675 1560 575 L1560 430 C 1160 535 990 455 715 550 C 425 650 210 520 -120 620 Z"
          fill="url(#homeWaveA)"
          opacity="0.66"
        />
        <path
          d="M-120 350 C 170 250 410 395 690 290 C 970 185 1130 265 1560 170"
          fill="none"
          stroke="#314474"
          strokeOpacity="0.14"
          strokeWidth="2"
        />
        <path
          d="M-120 620 C 210 520 425 650 715 550 C 990 455 1160 535 1560 430"
          fill="none"
          stroke="#2A3B68"
          strokeOpacity="0.12"
          strokeWidth="2"
        />
      </svg>
      <div
        aria-hidden
        className="fixed inset-0 bg-[linear-gradient(180deg,rgba(6,10,25,0)_0%,rgba(6,10,25,0.16)_58%,#060A19_100%)]"
      />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 py-12 sm:px-8 lg:px-10">
        <header className="text-center">
          <h1 className="font-brandUpright text-[46px] uppercase leading-[0.9] tracking-[0.01em] text-slate-50 sm:text-[56px]">
            PARTIES MULTIJOUEURS
          </h1>
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
              const difficultyLabel = roomDifficultyLabel(room.difficulty);
              const isRoomInProgress = progressCount > 0;
              const progressDotClass = isRoomInProgress ? "bg-emerald-400" : "bg-yellow-300";
              const badgeClass = "inline-flex items-center gap-1.5 rounded-[6px] bg-black/45 px-3 py-2 font-brand text-[18px] italic leading-none text-white shadow-[0_8px_18px_rgba(0,0,0,0.35)] backdrop-blur-sm";

              return (
                <div
                  key={room.id}
                  className="group flex w-full max-w-[240px] flex-col items-center transition-transform duration-200 hover:z-10 hover:scale-[1.05]"
                >
                  <button
                    type="button"
                    onClick={() => openRoom(room.id)}
                    aria-label={`Ouvrir ${label}`}
                    className="relative w-full bg-transparent transition"
                  >
                    <div className="relative aspect-[5/7] w-full overflow-hidden border-0 bg-[#0b1332] ring-0 transition duration-200 group-hover:ring-4 group-hover:ring-white/90">
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

                      <div className="absolute inset-0 flex flex-col px-3 py-4 text-white">
                        {questionCount > 0 ? (
                          <div className={`absolute left-3 top-3 ${badgeClass}`}>
                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 rounded-full ${progressDotClass}`}
                            />
                            <span>{progressCount}/{questionCount}</span>
                          </div>
                        ) : null}

                        <div className={`absolute right-3 top-3 ${badgeClass}`}>
                          <span>{players ?? "—"}</span>
                          <img src={playerIcon} alt="" className="h-4 w-4 object-contain" draggable={false} />
                        </div>

                        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 justify-center gap-2">
                          <span className={badgeClass}>ARÈNE</span>
                          <span className={badgeClass}>{difficultyLabel}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 border border-transparent bg-transparent px-4 py-2 text-center text-[1.35rem] font-brandUpright uppercase leading-none text-white transition-colors duration-200 group-hover:border-white/90 group-hover:bg-white group-hover:text-black">
                      <span className="inline-block translate-y-[1px]">{label}</span>
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
