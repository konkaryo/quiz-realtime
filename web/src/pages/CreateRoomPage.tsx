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
  { key: "CINEMA_SERIES", label: "Cinéma & Séries" },
  { key: "ARTS_CULTURE", label: "Arts & Culture" },
  { key: "JEUX_BD", label: "Jeux & BD" },
  { key: "GEOGRAPHIE", label: "Géographie" },
  { key: "LANGUES_LITTERATURE", label: "Langues & Littérature" },
  { key: "ECONOMIE_POLITIQUE", label: "Économie & Politique" },
  { key: "GASTRONOMIE", label: "Gastronomie" },
  { key: "CROYANCES", label: "Croyances" },
  { key: "SPORT", label: "Sport" },
  { key: "HISTOIRE", label: "Histoire" },
  { key: "DIVERS", label: "Divers" },
  { key: "SCIENCES_NATURELLES", label: "Sciences naturelles" },
  { key: "SCIENCES_TECHNIQUES", label: "Sciences & Techniques" },
  { key: "MUSIQUE", label: "Musique" },
  { key: "ACTUALITES_MEDIAS", label: "Actualités & Médias" },
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
  const [questionCount, setQuestionCount] = useState<number>(10); // 1–50
  const [questionDuration, setQuestionDuration] = useState<number>(20); // 3–60

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
      // pas d'affichage de message
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
    <div className="relative text-slate-50">
      <div aria-hidden className="fixed inset-0 bg-[#13141F]" />

      <style>{`
        /* ✅ Scrollbar style appliqué au conteneur scroll (lb-scroll) */
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

        /* ✅ Sliders: track discret + angles peu arrondis */
        input[type="range"].syn-range{
          -webkit-appearance:none;
          appearance:none;
          width:100%;
          background:transparent;
          outline:none;
          cursor:pointer;
        }
        input[type="range"].syn-range::-webkit-slider-runnable-track{
          height:6px;
          border-radius:2px;
          background:
            linear-gradient(var(--fill) 0 0) 0/var(--p) 100% no-repeat,
            var(--track);
        }
        input[type="range"].syn-range::-webkit-slider-thumb{
          -webkit-appearance:none;
          appearance:none;
          margin-top:-7px;
          width:18px;
          height:18px;
          border-radius:999px;
          background:#ffffff;
          border:2px solid rgba(255,255,255,0.12);
          box-shadow:0 8px 18px rgba(0,0,0,0.45);
        }
        input[type="range"].syn-range::-moz-range-track{
          height:6px;
          border-radius:2px;
          background: var(--track);
        }
        input[type="range"].syn-range::-moz-range-progress{
          height:6px;
          border-radius:2px;
          background: var(--fill);
        }
        input[type="range"].syn-range::-moz-range-thumb{
          width:18px;
          height:18px;
          border-radius:999px;
          background:#ffffff;
          border:2px solid rgba(255,255,255,0.12);
          box-shadow:0 8px 18px rgba(0,0,0,0.45);
        }
      `}</style>

      {/* ✅ Zone scrollable: top = navbar, bottom = 0 => scrollbar touche le bas et ne chevauche pas la navbar */}
      <div
        className="fixed left-0 right-0 bottom-0 z-10 lb-scroll overflow-y-auto"
        style={{ top: `${NAVBAR_HEIGHT_PX}px` }}
      >
        <div className="mx-auto flex max-w-6xl flex-col px-4 py-10 sm:px-8 lg:px-10">
          <header className="mb-12 text-center">
            <h1 className="text-5xl font-brand text-slate-50">CRÉER UN SALON PRIVÉ</h1>
          </header>

          <div className="origin-top scale-[0.88]">
            {err && (
              <div className="mb-6 rounded-[6px] border border-rose-800/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-200 shadow-[0_18px_40px_rgba(0,0,0,0.25)]">
                {err}
              </div>
            )}

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr),360px]">
              {/* COLONNE GAUCHE : paramètres */}
              <section className="rounded-[6px] border border-[#2A2D3C] bg-[#1C1F2E] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                <div className="mb-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                    Paramètres
                  </div>
                </div>

                {/* Difficulté */}
                <div className="rounded-[6px] border border-[#2A2D3C] bg-[#181A28] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-100">Difficulté</div>
                    <div className="rounded-full bg-[#141625] px-3 py-1 text-xs font-semibold text-slate-100">
                      {difficulty}%
                    </div>
                  </div>

                  <input
                    id="difficulty"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={difficulty}
                    onChange={(e) => setDifficulty(Number(e.target.value))}
                    className="syn-range mt-3"
                    style={
                      {
                        ["--track" as any]: "rgba(148,163,184,0.18)",
                        ["--fill" as any]: "#2D7CFF",
                        ["--p" as any]: difficultyP,
                      } as React.CSSProperties
                    }
                  />

                  <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    <span>0</span>
                    <span>50</span>
                    <span>100</span>
                  </div>
                </div>

                {/* Questions */}
                <div className="mt-4 rounded-[6px] border border-[#2A2D3C] bg-[#181A28] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-100">Questions</div>
                    <div className="rounded-full bg-[#141625] px-3 py-1 text-xs font-semibold text-slate-100">
                      {questionCount}
                    </div>
                  </div>

                  <input
                    id="qcount"
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="syn-range mt-3"
                    style={
                      {
                        ["--track" as any]: "rgba(148,163,184,0.18)",
                        ["--fill" as any]: "#0FACF3",
                        ["--p" as any]: qcountP,
                      } as React.CSSProperties
                    }
                  />

                  <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    <span>1</span>
                    <span>25</span>
                    <span>50</span>
                  </div>
                </div>

                {/* Durée */}
                <div className="mt-4 rounded-[6px] border border-[#2A2D3C] bg-[#181A28] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-100">Durée / question</div>
                    <div className="rounded-full bg-[#141625] px-3 py-1 text-xs font-semibold text-slate-100">
                      {questionDuration}
                      <span className="lowercase">s</span>
                    </div>
                  </div>

                  <input
                    id="qdur"
                    type="range"
                    min={3}
                    max={60}
                    step={1}
                    value={questionDuration}
                    onChange={(e) => setQuestionDuration(Number(e.target.value))}
                    className="syn-range mt-3"
                    style={
                      {
                        ["--track" as any]: "rgba(148,163,184,0.18)",
                        ["--fill" as any]: "#FACC15",
                        ["--p" as any]: qdurP,
                      } as React.CSSProperties
                    }
                  />

                  {/* ✅ "s" collé au chiffre + forcé en minuscule même si parent est en uppercase */}
                  <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
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

                {/* Thèmes */}
                <div className="mt-6">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                        Thèmes{" "}
                        <span className="text-slate-300/80">
                          ({selectedThemes.length}/{THEME_OPTIONS.length})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAll}
                        className="rounded-[6px] border border-[#2A2D3C] bg-[#181A28] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:text-white"
                      >
                        Tout
                      </button>
                      <button
                        type="button"
                        onClick={selectNone}
                        className="rounded-[6px] border border-[#2A2D3C] bg-[#181A28] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:text-white"
                      >
                        Aucun
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {themeOptionsSorted.map(({ key, label }) => {
                      const active = selectedThemes.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleTheme(key)}
                          aria-pressed={active}
                          title={active ? "Sélectionné (inclus)" : "Désélectionné (banni)"}
                          className={[
                            "flex items-center justify-between gap-3 rounded-[6px] border px-3 py-2 text-left text-[13px] font-semibold transition",
                            active
                              ? "border-[#2D7CFF]/60 bg-[#27314E] text-slate-50 hover:bg-[#284783]"
                              : "border-[#2A2D3C] bg-[#181A28] text-slate-300 hover:text-white",
                          ].join(" ")}
                        >
                          <span className="truncate">{label}</span>
                          <span
                            className={[
                              "flex h-5 w-5 items-center justify-center rounded-[6px] text-[12px] leading-none",
                              active ? "bg-[#2D7CFF] text-white" : "bg-[#141625] text-slate-500",
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
              </section>

              {/* COLONNE DROITE : code */}
              <aside className="self-start rounded-[6px] border border-[#2A2D3C] bg-[#1C1F2E] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                <div className="flex flex-col">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                    Code du salon
                  </div>

                  <div
                    className={[
                      "mt-6 flex items-center justify-center rounded-[10px] border border-[#2A2D3C]",
                      "bg-[#181A28] px-4 py-8",
                      "font-mono text-4xl font-extrabold tracking-[0.42em] text-slate-50",
                    ].join(" ")}
                    aria-label="Code d'accès de la room"
                  >
                    {code || "----"}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={refreshCodeFromServer}
                      className={[
                        "inline-flex h-12 items-center justify-center gap-2 rounded-[6px]",
                        "border border-[#2A2D3C] bg-[#181A28]",
                        "text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200",
                        "transition hover:text-white",
                      ].join(" ")}
                    >
                      <RefreshIcon />
                      Régénérer
                    </button>

                    <button
                      type="button"
                      onClick={copyCode}
                      disabled={!code}
                      className={[
                        "inline-flex h-12 items-center justify-center gap-2 rounded-[6px]",
                        "border border-[#2A2D3C] bg-[#181A28]",
                        "text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200",
                        "transition hover:text-white",
                        !code ? "cursor-not-allowed opacity-40 hover:text-slate-200" : "",
                      ].join(" ")}
                    >
                      <CopyIcon />
                      Copier
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={createRoom}
                    disabled={loading || !code}
                    className={[
                      "mt-8 inline-flex items-center justify-center rounded-[6px] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] transition",
                      "border border-transparent bg-[#2D7CFF] text-slate-50 hover:bg-[#1F65DB]",
                      loading || !code ? "cursor-not-allowed opacity-40 hover:bg-[#2D7CFF]" : "",
                    ].join(" ")}
                  >
                    {loading ? "Création…" : "Créer la room"}
                  </button>

                  <div className="sr-only">
                    {bannedThemes.length === 0
                      ? "Tous les thèmes sont inclus."
                      : `${bannedThemes.length} thème(s) exclu(s).`}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
