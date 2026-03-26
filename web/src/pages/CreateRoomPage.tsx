// web/src/pages/CreateRoomPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE as string;

// Ajuste si ta navbar est plus haute/basse
const NAVBAR_HEIGHT_PX = 52;

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
    const err: any = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// mêmes clés que l'enum Prisma Theme
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

type ThemeKey = (typeof THEME_OPTIONS)[number]["key"];

function RefreshIcon(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M20 12a8 8 0 1 1-2.35-5.65"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M20 4v6h-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect
        x="3"
        y="3"
        width="12"
        height="12"
        rx="2"
        stroke="currentColor"
        opacity="0.55"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function percent(value: number, min: number, max: number) {
  if (max <= min) return "0%";
  const p = clamp01((value - min) / (max - min)) * 100;
  return `${p}%`;
}

export default function CreateRoomPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [difficulty, setDifficulty] = useState<number>(50);
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [questionDuration, setQuestionDuration] = useState<number>(20);

  const themeOptionsSorted = useMemo(
    () =>
      [...THEME_OPTIONS].sort((a, b) =>
        a.label.localeCompare(b.label, "fr", { sensitivity: "base" }),
      ),
    [],
  );

  const [selectedThemes, setSelectedThemes] = useState<ThemeKey[]>(
    THEME_OPTIONS.map((t) => t.key),
  );

  const bannedThemes = useMemo(
    () => THEME_OPTIONS.filter((t) => !selectedThemes.includes(t.key)).map((t) => t.key),
    [selectedThemes],
  );

  const [code, setCode] = useState<string>("");
  const [activePanel, setActivePanel] = useState<"settings" | "themes">("settings");

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
    (async () => {
      try {
        const data = await fetchJSON("/rooms/new-code");
        const c = (data as any)?.code as string | undefined;
        if (mounted) setCode(c ?? "");
      } catch {
        if (mounted) setCode("");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleTheme = (k: ThemeKey) => {
    setSelectedThemes((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  const selectAll = () => setSelectedThemes(THEME_OPTIONS.map((t) => t.key));
  const selectNone = () => setSelectedThemes([]);

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // silencieux
    }
  }

  async function refreshCodeFromServer() {
    try {
      const data = await fetchJSON("/rooms/new-code");
      const c = (data as any)?.code as string | undefined;
      setCode(c ?? "");
    } catch {
      setCode("");
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
      const payload = {
        code,
        difficulty,
        questionCount,
        roundSeconds: questionDuration,
        bannedThemes,
      };

      const data = await fetchJSON("/rooms", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const id = (data as any)?.result?.id as string | undefined;
      const finalCode = (data as any)?.result?.code as string | undefined;

      if (!id) throw new Error("Création: id manquant");

      if (finalCode && finalCode !== code) setCode(finalCode);
      nav(`/rooms/${id}/lobby`);
    } catch (e: any) {
      if (e?.status === 409) {
        setErr("Le code vient d’être pris. Nouveau code généré.");
        await refreshCodeFromServer();
      } else {
        setErr(e?.message || "Impossible de créer la room");
      }
    } finally {
      setLoading(false);
    }
  }

  const difficultyP = percent(difficulty, 0, 100);
  const qcountP = percent(questionCount, 1, 50);
  const qdurP = percent(questionDuration, 3, 60);

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
          cursor: pointer;
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
          border: none  ;
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
          border: 2px solid rgba(111, 91, 212, 0.28);
          box-shadow: 0 6px 16px rgba(18, 20, 38, 0.18);
        }
      `}</style>

      <div
        className="fixed left-0 right-0 bottom-0 z-10 overflow-y-auto lb-scroll"
        style={{ top: `${NAVBAR_HEIGHT_PX}px` }}
      >
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
          <header className="mb-10 text-center">
            <h1 className="text-4xl font-brand italic text-white sm:text-5xl">
              CRÉER UNE PARTIE PRIVÉE
            </h1>
          </header>

          <div className="mx-auto max-w-3xl">
            {err && (
              <div className="mb-5 rounded-[10px] border border-rose-300/70 bg-[#f7e9ec] px-4 py-3 text-sm text-rose-700 shadow-[0_12px_24px_rgba(0,0,0,0.12)]">
                {err}
              </div>
            )}

            <div className="grid items-start justify-center gap-8 md:grid-cols-[380px,320px]">
              {/* Onglets + panneau gauche */}
              <div className="relative">
                <div
                  className="mb-4 flex w-full max-w-[380px] gap-3 md:absolute md:-left-[132px] md:top-4 md:mb-0 md:w-[108px] md:max-w-none md:flex-col md:gap-2"
                  role="tablist"
                  aria-orientation="vertical"
                  aria-label="Sections du panneau"
                >
                  <button
                    id="create-room-tab-settings"
                    type="button"
                    role="tab"
                    aria-selected={activePanel === "settings"}
                    aria-controls="create-room-panel-settings"
                    onClick={() => setActivePanel("settings")}
                    className={[
                      "h-10 flex-1 border-b px-2 text-right text-[28px] leading-none transition-colors md:flex-none",
                      activePanel === "settings"
                        ? "border-[#6b5ad6] text-[#6b5ad6]"
                        : "border-[#8e8d96] text-white hover:text-[#cbc7ef]",
                    ].join(" ")}
                  >
                    <span className="text-sm tracking-[0.02em]">Paramètres</span>
                  </button>
                  <button
                    id="create-room-tab-themes"
                    type="button"
                    role="tab"
                    aria-selected={activePanel === "themes"}
                    aria-controls="create-room-panel-themes"
                    onClick={() => setActivePanel("themes")}
                    className={[
                      "h-10 flex-1 border-b px-2 text-right text-[28px] leading-none transition-colors md:mt-2 md:flex-none",
                      activePanel === "themes"
                        ? "border-[#6b5ad6] text-[#6b5ad6]"
                        : "border-[#8e8d96] text-white hover:text-[#cbc7ef]",
                    ].join(" ")}
                  >
                    <span className="text-sm tracking-[0.02em]">Thèmes</span>
                  </button>
                </div>

                <section className="w-full max-w-[380px] rounded-[8px] border border-[#d5d5d8] bg-[#ececed] px-5 py-4 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
                  <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[#171717]">
                    {activePanel === "settings"
                      ? "Paramètres"
                      : `Thèmes (${selectedThemes.length}/${THEME_OPTIONS.length})`}
                  </div>
                  {activePanel === "settings" && (
                    <div id="create-room-panel-settings" role="tabpanel" aria-labelledby="create-room-tab-settings">
                      {/* Difficulté */}
                      <div className="rounded-[5px] bg-[#6F5BD4] p-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[12px] font-semibold text-[#ffffff]">Difficulté</span>
                          <span className="rounded-[4px] bg-[#c5c5c7] px-2 py-1 text-[11px] font-bold text-[#2c2c2c]">
                            {difficulty}%
                          </span>
                        </div>

                        <input
                          id="difficulty"
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={difficulty}
                          onChange={(e) => setDifficulty(Number(e.target.value))}
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

                      {/* Questions */}
                      <div className="mt-2 rounded-[5px] bg-[#d8d8d9] p-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[12px] font-semibold text-[#191919]">Questions</span>
                          <span className="rounded-[4px] bg-[#c5c5c7] px-2 py-1 text-[11px] font-bold text-[#2c2c2c]">
                            {questionCount}
                          </span>
                        </div>

                        <input
                          id="qcount"
                          type="range"
                          min={1}
                          max={50}
                          step={1}
                          value={questionCount}
                          onChange={(e) => setQuestionCount(Number(e.target.value))}
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

                      {/* Durée */}
                      <div className="mt-2 rounded-[5px] bg-[#d8d8d9] p-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[12px] font-semibold text-[#191919]">
                            Durée / question
                          </span>
                          <span className="rounded-[4px] bg-[#c5c5c7] px-2 py-1 text-[11px] font-bold text-[#2c2c2c]">
                            {questionDuration}
                            <span className="lowercase">s</span>
                          </span>
                        </div>

                        <input
                          id="qdur"
                          type="range"
                          min={3}
                          max={60}
                          step={1}
                          value={questionDuration}
                          onChange={(e) => setQuestionDuration(Number(e.target.value))}
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
                    </div>
                  )}

                  {activePanel === "themes" && (
                    <div id="create-room-panel-themes" role="tabpanel" aria-labelledby="create-room-tab-themes">
                      <div className="mb-3 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={selectAll}
                          className="rounded-[4px] bg-[#c8c8cb] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#222] transition hover:bg-[#bebec2]"
                        >
                          Tout
                        </button>
                        <button
                          type="button"
                          onClick={selectNone}
                          className="rounded-[4px] bg-[#c8c8cb] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#222] transition hover:bg-[#bebec2]"
                        >
                          Aucun
                        </button>
                      </div>

                      <div className="grid gap-1.5 pr-1 sm:grid-cols-2">
                        {themeOptionsSorted.map(({ key, label }) => {
                          const active = selectedThemes.includes(key);

                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => toggleTheme(key)}
                              aria-pressed={active}
                              className={[
                                "flex items-center justify-between gap-2 rounded-[4px] px-2.5 py-2 text-left text-[11px] font-semibold transition",
                                active
                                  ? "bg-[#7061d8] text-white"
                                  : "bg-[#d7d7da] text-[#222] hover:bg-[#cdcdf1]",
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
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              </div>

              {/* Panneau droit */}
              <aside className="rounded-[8px] border border-[#d5d5d8] bg-[#ececed] px-5 py-4 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
                <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[#171717]">
                  Code de la partie
                </div>

                <div
                  className="flex h-[56px] items-center justify-center rounded-[4px] bg-[#d0d0d2] px-3 font-mono text-2xl font-extrabold tracking-[0.26em] text-[#232326]"
                  aria-label="Code d'accès de la room"
                >
                  {code || "----"}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={refreshCodeFromServer}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-[4px] bg-[#cfcfd2] text-[10px] font-bold uppercase tracking-[0.08em] text-[#232323] transition hover:bg-[#c4c4c9]"
                  >
                    <RefreshIcon className="h-4 w-4" />
                    Régénérer
                  </button>

                  <button
                    type="button"
                    onClick={copyCode}
                    disabled={!code}
                    className={[
                      "inline-flex h-9 items-center justify-center gap-2 rounded-[4px] bg-[#cfcfd2] text-[10px] font-bold uppercase tracking-[0.08em] text-[#232323] transition hover:bg-[#c4c4c9]",
                      !code ? "cursor-not-allowed opacity-45 hover:bg-[#cfcfd2]" : "",
                    ].join(" ")}
                  >
                    <CopyIcon className="h-4 w-4" />
                    Copier
                  </button>
                </div>

                <button
                  type="button"
                  onClick={createRoom}
                  disabled={loading || !code}
                  className={[
                    "mt-4 inline-flex h-10 w-full items-center justify-center rounded-[4px] bg-[#6b5ad6] text-[10px] font-bold   tracking-[0.12em] text-white transition hover:bg-[#5f4fcb]",
                    loading || !code ? "cursor-not-allowed opacity-45 hover:bg-[#6b5ad6]" : "",
                  ].join(" ")}
                >
                  {loading ? "Création…" : "Créer la partie"}
                </button>

                <div className="sr-only">
                  {bannedThemes.length === 0
                    ? "Tous les thèmes sont inclus."
                    : `${bannedThemes.length} thème(s) exclu(s).`}
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}