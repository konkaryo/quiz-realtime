// web/src/pages/Home.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import playerIcon from "../assets/player.png";

const API_BASE = import.meta.env.VITE_API_BASE as string;

type RoomListItem = {
  id: string;
  name?: string | null;
  image?: string | null;
  difficulty?: number;
  playerCount?: number;
};

type RoomDetail = { id: string; code?: string | null };

function difficultyStars(difficulty?: number) {
  if (typeof difficulty !== "number") return "☆☆☆☆☆";
  if (difficulty <= 20) return "★☆☆☆☆";
  if (difficulty <= 40) return "★★☆☆☆";
  if (difficulty <= 60) return "★★★☆☆";
  if (difficulty <= 80) return "★★★★☆";
  return "★★★★★";
}

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

  async function loadRooms() {
    setLoading(true);
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
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRooms();
  }, []);

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
      <div aria-hidden className="fixed inset-0 bg-[#0A0B12]" />

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
              const stars = difficultyStars(room.difficulty);
              const players =
                typeof room.playerCount === "number" ? room.playerCount : null;

              return (
                <div
                  key={room.id}
                  className="group flex w-full max-w-[240px] flex-col items-center gap-3 transition-transform duration-200 hover:z-10 hover:scale-[1.05]"
                >
                  <div className="text-xl font-semibold tracking-wide text-amber-400">
                    {stars}
                  </div>
                  <button
                    type="button"
                    onClick={() => openRoom(room.id)}
                    aria-label={`Ouvrir ${label}`}
                    className="relative w-full overflow-hidden rounded-[6px] border-2 border-white/20 bg-white/5 shadow-[0_18px_40px_rgba(0,0,0,.45)] transition group-hover:border-white"
                  >
                    <div className="relative aspect-[5/7] w-full overflow-hidden">
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
                    </div>
                  </button>
                  <div className="w-full text-center">
                    <div className="flex min-h-[42px] items-center justify-center rounded-[6px] border-2 border-white/25 px-3 py-2 text-center text-m font-brand uppercase tracking-[0.12em] text-white transition group-hover:bg-white group-hover:text-slate-900">
                        <span className="text-center leading-none">{label}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-center gap-2 text-sm text-white">
                      <span>{players ?? "—"}</span>
                      <img
                        src={playerIcon}
                        alt=""
                        className="h-4 w-4 object-contain"
                        draggable={false}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
