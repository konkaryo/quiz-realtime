// web/src/pages/CreateRoomPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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
type PanelKey = "settings" | "themes";

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

function CheckIcon(props: { className?: string }) {
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
        d="M5 12.5l4.2 4.2L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
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

type VerticalStepTabItem = {
  key: PanelKey;
  label: string;
  tabId: string;
  panelId: string;
};

function VerticalStepTabs(props: {
  items: VerticalStepTabItem[];
  activeKey: PanelKey;
  onChange: (key: PanelKey) => void;
}) {
  const { items, activeKey, onChange } = props;

  return (
    <div
      className="hidden md:block"
      role="tablist"
      aria-orientation="vertical"
      aria-label="Sections du panneau"
    >
      <div className="grid grid-cols-[92px_20px] items-start gap-x-3">
        {items.map((item, index) => {
          const active = item.key === activeKey;
          const isLast = index === items.length - 1;

          return (
            <React.Fragment key={item.key}>
              <button
                id={item.tabId}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={item.panelId}
                onClick={() => onChange(item.key)}
                className={[
                  "row-start-auto h-9 w-[92px] self-center rounded-[8px] px-2.5 text-center text-[13px] transition-colors",
                  active ? "bg-[#6a5ee0] text-white" : "text-[#b8bfd7] hover:text-[#dde4ff]",
                ].join(" ")}
              >
                {item.label}
              </button>

              <div className="flex items-center justify-center self-center">
                <span
                  aria-hidden
                  className={[
                    "block h-[16px] w-[16px] rounded-full transition-colors",
                    active ? "bg-[#6f63df]" : "bg-[#aeb3c7]",
                  ].join(" ")}
                />
              </div>

              {!isLast && (
                <>
                  <div aria-hidden className="h-[10px]" />
                  <div className="flex justify-center">
                    <span aria-hidden className="block h-[30px] w-px bg-white/35" />
                  </div>
                </>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default function CreateRoomPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyResetTimeoutRef = useRef<number | null>(null);

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
  const [activePanel, setActivePanel] = useState<PanelKey>("settings");

  const panelTabs: VerticalStepTabItem[] = useMemo(
    () => [
      {
        key: "settings",
        label: "Paramètres",
        tabId: "create-room-tab-settings",
        panelId: "create-room-panel-settings",
      },
      {
        key: "themes",
        label: "Thèmes",
        tabId: "create-room-tab-themes",
        panelId: "create-room-panel-themes",
      },
    ],
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

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
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
      setCopied(true);

      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }

      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copyResetTimeoutRef.current = null;
      }, 3000);
    } catch {
      // silencieux
    }
  }

  async function refreshCodeFromServer() {
    try {
      const data = await fetchJSON("/rooms/new-code");
      const c = (data as any)?.code as string | undefined;
      setCode(c ?? "");
      setCopied(false);
    } catch {
      setCode("");
      setCopied(false);
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
    <div className="relative text-slate-100">
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
            <h1 className="text-4xl font-brand italic text-[#f5f7ff] drop-shadow-[0_6px_20px_rgba(0,0,0,0.35)] sm:text-5xl">
              CRÉER UNE PARTIE PRIVÉE
            </h1>
          </header>

          <div className="mx-auto max-w-3xl">
            {err && (
              <div className="mb-5 rounded-[10px] border border-rose-300/50 bg-[#3f1f35]/80 px-4 py-3 text-sm text-rose-100 shadow-[0_12px_24px_rgba(0,0,0,0.25)]">
                {err}
              </div>
            )}

            <div className="grid items-start justify-center gap-8 md:grid-cols-[auto,320px]">
              {/* Colonne gauche : rail + panneau */}
              <div className="flex items-start gap-4">
                <div className="shrink-0">
                  <VerticalStepTabs
                    items={panelTabs}
                    activeKey={activePanel}
                    onChange={setActivePanel}
                  />
                </div>

                <div className="w-full md:w-[380px] md:min-w-[380px] md:max-w-[380px]">
                  <div className="mb-4 flex w-full gap-3 md:hidden">
                    <button
                      id="create-room-tab-settings-mobile"
                      type="button"
                      onClick={() => setActivePanel("settings")}
                      className={[
                        "h-10 flex-1 rounded-[10px] border border-transparent px-3 text-center text-sm transition-colors",
                        activePanel === "settings"
                          ? "bg-[#6a5ee0] text-white shadow-[0_8px_20px_rgba(76,63,177,0.42)]"
                          : "text-[#b8bfd7] hover:text-[#dde4ff]",
                      ].join(" ")}
                    >
                      Paramètres
                    </button>

                    <button
                      id="create-room-tab-themes-mobile"
                      type="button"
                      onClick={() => setActivePanel("themes")}
                      className={[
                        "h-10 flex-1 rounded-[10px] border border-transparent px-3 text-center text-sm transition-colors",
                        activePanel === "themes"
                          ? "bg-[#6a5ee0] text-white shadow-[0_8px_20px_rgba(76,63,177,0.42)]"
                          : "text-[#b8bfd7] hover:text-[#dde4ff]",
                      ].join(" ")}
                    >
                      Thèmes
                    </button>
                  </div>

                  <section className="w-full rounded-[8px] border border-[#3e446e] bg-[#2f3558] px-5 py-4 shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
                    <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[#eff1fb]">
                      {activePanel === "settings"
                        ? "Paramètres"
                        : `Thèmes (${selectedThemes.length}/${THEME_OPTIONS.length})`}
                    </div>

                    {activePanel === "settings" && (
                      <div
                        id="create-room-panel-settings"
                        role="tabpanel"
                        aria-labelledby="create-room-tab-settings"
                      >
                        <div className="rounded-[5px] bg-[#ccd2ea] p-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[12px] font-semibold text-[#191919]">
                              Difficulté
                            </span>
<span className="rounded-[4px] bg-[#BA1670] px-2 py-1 text-[11px] font-bold text-white">
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
["--fill" as any]: "#BA1670",
                                ["--p" as any]: difficultyP,
                              } as React.CSSProperties
                            }
                          />
                        </div>

                        <div className="mt-3 rounded-[5px] bg-[#ccd2ea] p-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[12px] font-semibold text-[#191919]">
                              Questions
                            </span>
<span className="rounded-[4px] bg-[#BA1670] px-2 py-1 text-[11px] font-bold text-white">
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
["--fill" as any]: "#BA1670",
                                ["--p" as any]: qcountP,
                              } as React.CSSProperties
                            }
                          />
                        </div>

                        <div className="mt-3 rounded-[5px] bg-[#ccd2ea] p-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[12px] font-semibold text-[#191919]">
                              Durée / question
                            </span>
<span className="rounded-[4px] bg-[#CE187C] px-2 py-1 text-[11px] font-bold text-white">
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
["--fill" as any]: "#BA1670",
                                ["--p" as any]: qdurP,
                              } as React.CSSProperties
                            }
                          />
                        </div>
                      </div>
                    )}

                    {activePanel === "themes" && (
                      <div
                        id="create-room-panel-themes"
                        role="tabpanel"
                        aria-labelledby="create-room-tab-themes"
                      >
                        <div className="mb-3 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={selectAll}
                            className="rounded-[4px] bg-[#d5d9ef] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#222] transition hover:bg-[#c8cde8]"
                          >
                            Tout
                          </button>
                          <button
                            type="button"
                            onClick={selectNone}
                            className="rounded-[4px] bg-[#d5d9ef] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#222] transition hover:bg-[#c8cde8]"
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
                                    ? "bg-[#059669] text-white"
                                    : "bg-[#d7dcef] text-[#222] hover:bg-[#cdd4ee]",
                                ].join(" ")}
                              >
                                <span className="truncate">{label}</span>
                                <span
                                  className={[
                                    "flex h-4 w-4 items-center justify-center rounded-[3px] text-[10px] leading-none",
                                    active
                                      ? "bg-white/25 text-white"
                                      : "bg-[#bcc4e4] text-[#555]",
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
              </div>

              {/* Panneau droit */}
              <aside className="rounded-[8px] border border-[#3e446e] bg-[#2f3558] px-5 py-4 shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
                <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[#eff1fb]">
                  Code de la partie
                </div>

                <div
                  className="flex h-[56px] items-center justify-center rounded-[4px] bg-[#d5d9ee] px-3 font-mono text-2xl font-extrabold tracking-[0.26em] text-[#252a49]"
                  aria-label="Code d'accès de la room"
                >
                  {code || "----"}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={refreshCodeFromServer}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-[4px] bg-[#d5d9ef] text-[10px] font-bold uppercase tracking-[0.08em] text-[#252a49] transition hover:bg-[#c7cee9]"
                  >
                    <RefreshIcon className="h-4 w-4" />
                    Régénérer
                  </button>

                  <button
                    type="button"
                    onClick={copyCode}
                    disabled={!code}
                    aria-live="polite"
                    className={[
                      "inline-flex h-9 items-center justify-center gap-2 rounded-[4px] text-[10px] font-bold uppercase tracking-[0.08em] transition",
                      copied
                        ? "bg-[#10B981] text-white"
                        : "bg-[#d5d9ef] text-[#252a49] hover:bg-[#c7cee9]",
                      !code ? "cursor-not-allowed opacity-45" : "",
                    ].join(" ")}
                  >
                    {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                    {copied ? "Copié !" : "Copier"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={createRoom}
                  disabled={loading || !code}
className={[
  "mt-4 inline-flex h-10 w-full items-center justify-center rounded-[4px] bg-[#6f63df] px-4 text-[15px] font-bold text-white transition hover:bg-[#5e52d2]",
  loading || !code ? "cursor-not-allowed opacity-45 hover:bg-[#6f63df]" : "",
].join(" ")}
                >
                  {loading ? "Création…" : "Créer la partie"}
                </button>

                <div className="sr-only">
                  {copied ? "Le code a été copié dans le presse-papiers." : ""}
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