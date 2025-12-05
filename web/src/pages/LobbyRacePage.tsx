// web/src/pages/LobbyRacePage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");

export type RaceLobbyPlayer = { id: string; name: string };

type LobbyStatus = "idle" | "connecting" | "connected" | "error";

export default function LobbyRacePage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [players, setPlayers] = useState<RaceLobbyPlayer[]>([]);
  const [status, setStatus] = useState<LobbyStatus>("idle");
  const [starting, setStarting] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const s = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
    });
    setSocket(s);
    setStatus("connecting");

    s.on("connect", () => {
      setStatus("connected");
      s.emit(
        "race_lobby_join",
        {},
        (res: { ok: boolean; players?: RaceLobbyPlayer[] }) => {
          if (res?.ok) {
            setPlayers(res.players ?? []);
          } else {
            setStatus("error");
          }
        },
      );
    });

    s.on("connect_error", () => setStatus("error"));
    s.on("race_lobby_update", (payload: { players?: RaceLobbyPlayer[] }) => {
      setPlayers(payload.players ?? []);
    });
    s.on("race_lobby_started", () => {
      navigate("/multi/race/play", { replace: true });
    });

    return () => {
      s.close();
    };
  }, [navigate]);

  const handleStart = () => {
    if (!socket) return;
    setStarting(true);
    socket.emit("race_lobby_start", {}, (res: { ok: boolean }) => {
      if (!res?.ok) setStarting(false);
    });
  };

  const statusLabel = useMemo(() => {
    switch (status) {
      case "connecting":
        return "Connexion en cours…";
      case "connected":
        return `Joueurs connectés : ${players.length}`;
      case "error":
        return "Impossible de se connecter au lobby";
      default:
        return "";
    }
  }, [status, players.length]);

  const canStart = status === "connected" && players.length > 0 && !starting;

  return (
    <div className="relative text-slate-50">
      {/* 🔴 FOND IDENTIQUE À DailyChallengePlayPage.tsx */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-gradient-to-br from-[#050816] via-[#050014] to-[#1b0308]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_top,rgba(248,113,113,0.15),transparent_60%),radial-gradient(circle_at_top,rgba(15,23,42,0.95),#020617)]"
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        {[...Array(18)].map((_, i) => (
          <div
            key={i}
            className="absolute h-[3px] w-[3px] rounded-full bg-rose-200/40"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: 0.55,
            }}
          />
        ))}
      </div>
      {/* 🔴 FIN DU COPIER-COLLER DU FOND */}

      {/* Wrapper aligné sur DailyChallengePlayPage */}
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 pb-16 pt-8 sm:px-8 lg:px-10">
        {/* Header dans le même esprit que DailyChallengePlayPage */}
        <header className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-600 to-rose-400 shadow-[0_0_12px_rgba(248,113,113,0.7)]">
              <span className="text-lg font-black tracking-tight">🏁</span>
            </div>
            <div className="leading-tight">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">
                Mode course
              </div>
              <div className="text-sm font-semibold text-slate-100">
                Lobby multijoueur
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-200">
            <span className="text-[10px] text-slate-400">Joueurs</span>
            <span className="mt-1 text-sm tabular-nums text-rose-300">
              {players.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-2 rounded-[12px] border border-slate-800/80 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),rgba(15,23,42,0.99)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.9),#020617)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-100 transition hover:border-rose-400 hover:text-white"
            >
              <span className="text-xs">←</span>
              <span>Quitter</span>
            </button>

            <button
              type="button"
              onClick={handleStart}
              disabled={!canStart}
              className="inline-flex items-center gap-2 rounded-[12px] border border-emerald-400/70 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),rgba(5,46,22,0.95)),radial-gradient(circle_at_bottom,_rgba(16,185,129,0.95),#022c22)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-50 shadow-[0_0_24px_rgba(16,185,129,0.7)] transition hover:border-emerald-300 hover:text-white disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900/60 disabled:text-slate-400 disabled:shadow-none"
            >
              {starting ? "Lancement…" : "Lancer la course"}
            </button>
          </div>
        </header>

        {/* Carte principale alignée avec le bloc résultats du Daily */}
        <section className="rounded-[34px] border border-slate-800/80 bg-black/80 p-6 shadow-[0_32px_90px_rgba(0,0,0,0.95)] backdrop-blur-2xl sm:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
                Salle d&apos;attente
              </h2>
              <p className="mt-2 text-sm text-slate-300/90">
                Attendez que tout le monde rejoigne la salle, puis lancez la
                course pour démarrer la partie en même temps.
              </p>
            </div>
            <div className="flex flex-col items-end text-right text-xs uppercase tracking-[0.3em]">
              <span className="text-[10px] text-slate-400">Statut</span>
              <span className="mt-1 text-[11px] font-semibold text-slate-200">
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">
              <span>Joueurs connectés</span>
              <span className="text-slate-500">
                {players.length > 0
                  ? `${players.length} joueur${players.length > 1 ? "s" : ""}`
                  : "En attente…"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {players.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-slate-800/80 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),rgba(15,23,42,0.98)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.65),#020617)] px-4 py-3 text-sm shadow-inner shadow-black/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-300/60 bg-rose-500/20 text-sm font-semibold uppercase tracking-wide text-rose-100">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-50">
                        {p.name}
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/90">
                        Prêt
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {!players.length && (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-700/80 bg-slate-900/60 py-10 text-center text-sm text-slate-400">
                  <div className="text-lg">⏳</div>
                  <p className="mt-2 text-slate-300">
                    En attente des joueurs…
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Partagez le lien ou invitez vos amis à rejoindre cette
                    salle de course.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
