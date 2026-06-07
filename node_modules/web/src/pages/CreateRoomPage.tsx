// web/src/pages/CreateRoomPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE as string;

const NAVBAR_HEIGHT_PX = 52;

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

const DIFFICULTY_OPTIONS = [
  { label: "Facile", value: 25 },
  { label: "Modéré", value: 45 },
  { label: "Difficile", value: 65 },
  { label: "Extrême", value: 85 },
] as const;

type ThemeKey = (typeof THEME_OPTIONS)[number]["key"];
type PanelKey = "settings" | "code" | "lobby";

type NavItem = {
  key: PanelKey;
  label: string;
};

type SettingRowProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  children: React.ReactNode;
};

type ApiError = Error & {
  status?: number;
  data?: unknown;
};

type NewCodeResponse = {
  code?: string;
};

type CreateRoomResponse = {
  result?: {
    id?: string;
    code?: string;
  };
};

type RangeStyle = React.CSSProperties & Record<"--p", string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown, key: string) {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

function errorMessageFromData(data: unknown, fallback: string) {
  return stringField(data, "error") || stringField(data, "message") || fallback;
}

function rangeStyle(progress: string): RangeStyle {
  return { "--p": progress };
}

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
    const msg = errorMessageFromData(data, `HTTP ${res.status}`);
    const err: ApiError = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function percent(value: number, min: number, max: number) {
  if (max <= min) return "0%";
  return `${clamp01((value - min) / (max - min)) * 100}%`;
}

function GamepadIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7.25 10.15h9.5c2.03 0 3.71 1.48 4.02 3.48l.46 2.93a2.54 2.54 0 0 1-4.4 2.15l-1.62-1.76H8.79l-1.62 1.76a2.54 2.54 0 0 1-4.4-2.15l.46-2.93a4.07 4.07 0 0 1 4.02-3.48Z"
        fill="currentColor"
      />
      <path d="M8.4 13.05v2.7M7.05 14.4h2.7" stroke="#0B1229" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M15.95 13.95h.02M18 15.45h.02" stroke="#0B1229" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function QuestionIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="currentColor" />
      <path
        d="M10.1 9.2A2.25 2.25 0 0 1 12.25 8c1.22 0 2.15.77 2.15 1.86 0 1.52-1.8 1.75-1.8 3.18M12.5 16h.01"
        stroke="#0B1229"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChartIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 17h3v3H4v-3Zm6-5h3v8h-3v-8Zm6-4h4v12h-4V8Z" fill="currentColor" />
    </svg>
  );
}

function TimerIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21a8 8 0 1 0-8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 13V8m0 5 3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 3h6M4 6l2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TilesIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="5" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="5" y="14" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="14" y="14" width="5" height="5" rx="1" fill="currentColor" />
    </svg>
  );
}

function UsersIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8.2 11.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.7 19.4c.4-3 2.44-5 5.5-5s5.1 2 5.5 5H2.7Zm7.6 0c.4-3 2.44-5 5.5-5s5.1 2 5.5 5h-11Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DynamicTextIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6h16M4 12h10M4 18h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 13l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="4" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
    </svg>
  );
}
function RefreshIcon(props: { className?: string }) {

  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingRow({ icon, label, value, children }: SettingRowProps) {
  return (
    <div className="grid min-h-[52px] grid-cols-[24px,minmax(112px,1fr),minmax(150px,230px)] items-center gap-5 bg-[#0B1229] px-4 py-3 max-sm:grid-cols-[24px,1fr] max-sm:gap-x-3 max-sm:gap-y-2">
      <div className="text-white">{icon}</div>
      <div className="font-brandUpright text-[18px] uppercase leading-none tracking-[0.05em] text-white">
        {label}
      </div>
      <div className="max-sm:col-span-2">{children}</div>
      <div className="sr-only">{value}</div>
    </div>
  );
}

function HomeBackground() {
  return (
    <>
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
          <linearGradient id="createRoomWaveA" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#0A132E" stopOpacity="0.06" />
            <stop offset="45%" stopColor="#1C2A52" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#0A132E" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="createRoomWaveB" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#071028" stopOpacity="0.02" />
            <stop offset="52%" stopColor="#22315A" stopOpacity="0.36" />
            <stop offset="100%" stopColor="#071028" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path
          d="M-120 220 C 180 105 390 270 650 175 C 900 85 1110 175 1560 70 L1560 0 L-120 0 Z"
          fill="url(#createRoomWaveA)"
        />
        <path
          d="M-120 500 C 180 390 410 545 700 440 C 980 340 1160 420 1560 330 L1560 170 C 1130 265 970 185 690 290 C 410 395 170 250 -120 350 Z"
          fill="url(#createRoomWaveB)"
        />
        <path
          d="M-120 760 C 210 650 430 785 720 690 C 1010 595 1190 675 1560 575 L1560 430 C 1160 535 990 455 715 550 C 425 650 210 520 -120 620 Z"
          fill="url(#createRoomWaveA)"
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
    </>
  );
}

export default function CreateRoomPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [difficulty, setDifficulty] = useState(50);
  const [questionCount, setQuestionCount] = useState(10);
  const [questionDuration, setQuestionDuration] = useState(20);
  const [maxPlayers, setMaxPlayers] = useState(50);
  const [dynamicQuestionDisplay, setDynamicQuestionDisplay] = useState(true);
  const [selectedThemes, setSelectedThemes] = useState<ThemeKey[]>(THEME_OPTIONS.map((theme) => theme.key));
  const [code, setCode] = useState("");
  const [activePanel, setActivePanel] = useState<PanelKey>("settings");
  const [themesOpen, setThemesOpen] = useState(false);

  const copyResetTimeoutRef = useRef<number | null>(null);
  const questionDurationHoldTimeoutRef = useRef<number | null>(null);
  const questionDurationHoldIntervalRef = useRef<number | null>(null);
  const themesDropdownRef = useRef<HTMLDivElement | null>(null);

  const navItems: NavItem[] = useMemo(
    () => [
      { key: "settings", label: "Paramètres" },
      { key: "code", label: "Code" },
      { key: "lobby", label: "Lobby" },
    ],
    [],
  );

  const sortedThemes = useMemo(
    () => [...THEME_OPTIONS].sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" })),
    [],
  );

  const bannedThemes = useMemo(
    () => THEME_OPTIONS.filter((theme) => !selectedThemes.includes(theme.key)).map((theme) => theme.key),
    [selectedThemes],
  );

  const qcountP = percent(questionCount, 1, 50);
  const maxPlayersP = percent(maxPlayers, 1, 50);
  const selectedThemeCount = selectedThemes.length;
  const selectedDifficultyIndex = Math.max(
    0,
    DIFFICULTY_OPTIONS.findIndex((option) => option.value === difficulty),
  );
  const selectedDifficultyLabel = DIFFICULTY_OPTIONS[selectedDifficultyIndex]?.label ?? "Modéré";

  function openPanel(panel: PanelKey) {
    setActivePanel(panel);
    if (panel !== "settings") setThemesOpen(false);
  }

  function adjustDifficulty(delta: number) {
    const currentIndex = Math.max(
      0,
      DIFFICULTY_OPTIONS.findIndex((option) => option.value === difficulty),
    );
    const nextIndex = Math.max(0, Math.min(DIFFICULTY_OPTIONS.length - 1, currentIndex + delta));
    setDifficulty(DIFFICULTY_OPTIONS[nextIndex].value);
  }

  function adjustQuestionDuration(delta: number) {
    setQuestionDuration((seconds) => Math.max(3, Math.min(60, seconds + delta)));
  }

  function stopQuestionDurationHold() {
    if (questionDurationHoldTimeoutRef.current !== null) {
      window.clearTimeout(questionDurationHoldTimeoutRef.current);
      questionDurationHoldTimeoutRef.current = null;
    }

    if (questionDurationHoldIntervalRef.current !== null) {
      window.clearInterval(questionDurationHoldIntervalRef.current);
      questionDurationHoldIntervalRef.current = null;
    }
  }

  function startQuestionDurationHold(delta: number) {
    stopQuestionDurationHold();
    adjustQuestionDuration(delta);

    questionDurationHoldTimeoutRef.current = window.setTimeout(() => {
      questionDurationHoldTimeoutRef.current = null;
      questionDurationHoldIntervalRef.current = window.setInterval(() => {
        adjustQuestionDuration(delta);
      }, 85);
    }, 320);
  }

  function handleQuestionDurationKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, delta: number) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    adjustQuestionDuration(delta);
  }

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
        const data = (await fetchJSON("/rooms/new-code")) as NewCodeResponse;
        const nextCode = data.code;
        if (mounted) setCode(nextCode ?? "");
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
      stopQuestionDurationHold();
    };
  }, []);

  useEffect(() => {
    if (!themesOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (themesDropdownRef.current?.contains(target)) return;
      setThemesOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [themesOpen]);

  function toggleTheme(themeKey: ThemeKey) {
    setSelectedThemes((prev) =>
      prev.includes(themeKey) ? prev.filter((key) => key !== themeKey) : [...prev, themeKey],
    );
  }

  function selectAllThemes() {
    setSelectedThemes(THEME_OPTIONS.map((theme) => theme.key));
  }

  function selectNoThemes() {
    setSelectedThemes([]);
  }

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
      setErr("Impossible de copier le code automatiquement.");
    }
  }

  async function refreshCodeFromServer() {
    try {
      const data = (await fetchJSON("/rooms/new-code")) as NewCodeResponse;
      const nextCode = data.code;
      setCode(nextCode ?? "");
      setCopied(false);
    } catch {
      setCode("");
      setCopied(false);
      setErr("Impossible de générer un nouveau code.");
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
      const data = (await fetchJSON("/rooms", {
        method: "POST",
        body: JSON.stringify({
          code,
          difficulty,
          questionCount,
          roundSeconds: questionDuration,
          maxPlayers,
          dynamicQuestionDisplay,
          bannedThemes,
        }),
      })) as CreateRoomResponse;

      const id = data.result?.id;
      const finalCode = data.result?.code;

      if (!id) throw new Error("Création: id manquant");

      if (finalCode && finalCode !== code) setCode(finalCode);
      nav(`/rooms/${id}/lobby`);
    } catch (e: unknown) {
      const apiError = e as ApiError;
      if (apiError.status === 409) {
        setErr("Le code vient d’être pris. Nouveau code généré.");
        await refreshCodeFromServer();
      } else {
        setErr(apiError.message || "Impossible de créer la room");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-full overflow-hidden text-slate-50">
      <HomeBackground />

      <style>{`
        .create-room-scroll {
          scrollbar-width: thin;
          scrollbar-color: #eef1ff rgba(255,255,255,0.08);
        }

        .create-room-scroll::-webkit-scrollbar { width: 10px; }
        .create-room-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.08); border-radius: 999px; }
        .create-room-scroll::-webkit-scrollbar-thumb {
          background: #eef1ff;
          border-radius: 999px;
          border: 3px solid rgba(6,10,25,0.35);
          background-clip: padding-box;
        }

        input[type="range"].create-room-range {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 18px;
          background: transparent;
          cursor: pointer;
          outline: none;
        }

        input[type="range"].create-room-range::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(#7C5CFF 0 0) 0 / var(--p) 100% no-repeat, #1c2748;
        }

        input[type="range"].create-room-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          margin-top: -5px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          background: #7C5CFF;
          box-shadow: 0 0 0 4px rgba(124,92,255,0.18);
        }

        input[type="range"].create-room-range::-moz-range-track {
          height: 6px;
          border-radius: 999px;
          background: #1c2748;
        }

        input[type="range"].create-room-range::-moz-range-progress {
          height: 6px;
          border-radius: 999px;
          background: #7C5CFF;
        }

        input[type="range"].create-room-range::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          background: #7C5CFF;
        }
      `}</style>

      <main
        className="create-room-scroll fixed bottom-0 left-0 right-0 z-10 overflow-y-auto"
        style={{ top: `${NAVBAR_HEIGHT_PX}px` }}
      >
        <div className="mx-auto grid min-h-full w-full max-w-[1240px] grid-cols-[260px,minmax(0,1fr)] items-start gap-24 xl:gap-32 px-5 py-16 max-md:grid-cols-1 max-md:gap-8 sm:px-8 lg:px-10">
          <aside className="pt-1 max-md:pt-0">
            <h1 className="font-brandUpright text-[42px] uppercase leading-[0.95] tracking-[0.01em] text-white drop-shadow-[0_10px_26px_rgba(0,0,0,0.4)] sm:text-[50px]">
              CRÉER UNE
              <br />
              PARTIE PRIVÉE
            </h1>

            <nav className="mt-14 w-[150px] max-md:mt-6 max-md:flex max-md:w-full" aria-label="Création de partie privée">
              {navItems.map((item) => {
                const active = item.key === activePanel;

                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={active ? "step" : undefined}
                    onClick={() => openPanel(item.key)}
                    className={[
                      "block h-[44px] w-full bg-[#10172D] px-3 text-center font-brandUpright text-[21px] uppercase leading-[44px] tracking-[0.04em] text-white transition max-md:h-12 max-md:flex-1 max-md:leading-[48px]",
                      active ? "bg-[#24304F]" : "hover:bg-[#18213D]",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={createRoom}
              disabled={loading || !code}
              className={[
                "mt-36 h-[40px] w-[250px] rounded-[7px] bg-gradient-to-r from-[#7E5CFF] to-[#6C3DDE] px-6 text-center font-sans text-[15px] font-bold text-slate-50 transition hover:brightness-110 max-md:mt-8 max-md:w-full",
                loading || !code ? "cursor-not-allowed opacity-50 hover:brightness-100" : "",
              ].join(" ")}
            >
              {loading ? "Création…" : "Créer la partie"}
            </button>
          </aside>

          <section className="rounded-[14px] bg-[#131930] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.36)] sm:p-5">
            <div className="mb-6 flex items-start justify-between gap-4 px-1">
              <div>
                <h2 className="font-brandUpright text-[24px] uppercase leading-none tracking-[0.05em] text-white">
                  {activePanel === "settings" ? "Paramètres" : activePanel === "code" ? "Code" : "Lobby"}
                </h2>
              </div>
              <div className="rounded bg-[#0B1229] px-3 py-2 font-mono text-sm font-black tracking-[0.18em] text-white/90">
                {code || "----"}
              </div>
            </div>
            {err && (
              <div className="mb-4 rounded-md border border-rose-300/40 bg-rose-950/45 px-4 py-3 text-sm text-rose-100">
                {err}
              </div>
            )}

            {activePanel === "settings" && (
              <div id="create-room-panel-settings" role="tabpanel" aria-label="Paramètres" className="space-y-4">
                <SettingRow
                  icon={<GamepadIcon className="h-6 w-6" />}
                  label="Mode de jeu"
                  value="Classique"
                >
                  <select
                    defaultValue="Classique"
                    className="h-[24px] w-full rounded-[3px] border-0 bg-white px-3 text-[11px] font-semibold text-[#111827] outline-none"
                  >
                    <option>Classique</option>
                  </select>
                </SettingRow>

                <SettingRow icon={<QuestionIcon className="h-5 w-5" />} label="Nombre de questions" value={`${questionCount}`}>
                  <div className="flex items-center gap-3">
                    <input
                      id="question-count"
                      type="range"
                      min={1}
                      max={50}
                      step={1}
                      value={questionCount}
                      onChange={(event) => setQuestionCount(Number(event.target.value))}
                      className="create-room-range"
                      style={rangeStyle(qcountP)}
                    />
                    <span className="w-8 text-right font-brandUpright text-[16px] leading-none text-white">{questionCount}</span>
                  </div>
                </SettingRow>

                <SettingRow icon={<ChartIcon className="h-6 w-6" />} label="Difficulté des questions" value={selectedDifficultyLabel}>
                  <div className="flex h-[32px] items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustDifficulty(-1)}
                      disabled={selectedDifficultyIndex <= 0}
                      aria-label="Réduire la difficulté des questions"
                      className="grid h-7 w-7 place-items-center rounded-[5px] bg-[#18213D] text-[15px] font-bold leading-none text-white/70 transition hover:bg-[#202A4A] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      −
                    </button>
                    <div className="flex h-full min-w-[82px] flex-1 items-center justify-center rounded-[5px] bg-[#0D1429] px-4 font-brandUpright text-[16px] leading-none text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      {selectedDifficultyLabel}
                    </div>
                    <button
                      type="button"
                      onClick={() => adjustDifficulty(1)}
                      disabled={selectedDifficultyIndex >= DIFFICULTY_OPTIONS.length - 1}
                      aria-label="Augmenter la difficulté des questions"
                      className="grid h-7 w-7 place-items-center rounded-[5px] bg-[#18213D] text-[15px] font-bold leading-none text-white/70 transition hover:bg-[#202A4A] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      +
                    </button>
                  </div>
                </SettingRow>

                <SettingRow icon={<TimerIcon className="h-6 w-6" />} label="Temps pour répondre" value={`${questionDuration}s`}>
                  <div className="flex h-[32px] items-center justify-center gap-2">
                    <button
                      type="button"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        startQuestionDurationHold(-1);
                      }}
                      onPointerUp={stopQuestionDurationHold}
                      onPointerLeave={stopQuestionDurationHold}
                      onPointerCancel={stopQuestionDurationHold}
                      onBlur={stopQuestionDurationHold}
                      onKeyDown={(event) => handleQuestionDurationKeyDown(event, -1)}
                      disabled={questionDuration <= 3}
                      aria-label="Diminuer le temps pour répondre"
                      className="grid h-7 w-7 place-items-center rounded-[5px] bg-[#18213D] text-[15px] font-bold leading-none text-white/70 transition hover:bg-[#202A4A] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      −
                    </button>
                    <div className="flex h-full min-w-[82px] flex-1 items-center justify-center rounded-[5px] bg-[#0D1429] px-4 font-brandUpright text-[18px] leading-none text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      {questionDuration}
                    </div>
                    <button
                      type="button"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        startQuestionDurationHold(1);
                      }}
                      onPointerUp={stopQuestionDurationHold}
                      onPointerLeave={stopQuestionDurationHold}
                      onPointerCancel={stopQuestionDurationHold}
                      onBlur={stopQuestionDurationHold}
                      onKeyDown={(event) => handleQuestionDurationKeyDown(event, 1)}
                      disabled={questionDuration >= 60}
                      aria-label="Augmenter le temps pour répondre"
                      className="grid h-7 w-7 place-items-center rounded-[5px] bg-[#18213D] text-[15px] font-bold leading-none text-white/70 transition hover:bg-[#202A4A] disabled:cursor-not-allowed disabled:opacity-35"               >
                      +
                    </button>
                  </div>
                </SettingRow>

                <SettingRow icon={<TilesIcon className="h-6 w-6" />} label="Thèmes des questions" value={`${selectedThemeCount}/${THEME_OPTIONS.length}`}>
                  <div ref={themesDropdownRef} className="relative z-20">
                    <button
                      type="button"
                      onClick={() => setThemesOpen((open) => !open)}
                      aria-expanded={themesOpen}
                      className="flex h-[28px] w-full items-center justify-between rounded-[3px] bg-white/90 px-3 text-left text-[11px] font-semibold text-[#111827] transition hover:bg-white"
                    >
                      <span>{selectedThemeCount}/{THEME_OPTIONS.length} thèmes actifs</span>
                      <span className="text-[12px]" aria-hidden>{themesOpen ? "▲" : "▼"}</span>
                    </button>

                    {themesOpen && (
                      <div className="absolute right-0 top-[38px] z-30 w-full min-w-[260px] rounded-md border border-white/10 bg-[#0B1229] p-3 shadow-[0_18px_42px_rgba(0,0,0,0.35)]">
                        <div className="mb-3 flex gap-2">
                          <button
                            type="button"
                            onClick={selectAllThemes}
                            className="rounded bg-white/90 px-3 py-1 text-[11px] font-black uppercase text-[#0B1229] transition hover:bg-white"
                          >
                            Tout
                          </button>
                          <button
                            type="button"
                            onClick={selectNoThemes}
                            className="rounded bg-white/90 px-3 py-1 text-[11px] font-black uppercase text-[#0B1229] transition hover:bg-white"
                          >
                            Aucun
                          </button>
                        </div>

                        <div className="grid max-h-[220px] gap-2 overflow-y-auto pr-1">
                          {sortedThemes.map(({ key, label }) => {
                            const active = selectedThemes.includes(key);

                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => toggleTheme(key)}
                                aria-pressed={active}
                                className={[
                                  "flex items-center justify-between rounded bg-[#131930] px-3 py-2 text-left text-[13px] font-bold transition",
                                  active ? "text-white ring-1 ring-[#7C5CFF]/70" : "text-white/45 hover:text-white/75",
                                ].join(" ")}
                              >
                                <span>{label}</span>
                                <span className={active ? "text-emerald-300" : "text-white/25"}>{active ? "✓" : "—"}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </SettingRow>

                <SettingRow icon={<UsersIcon className="h-6 w-6" />} label="Nombre de joueurs" value={`${maxPlayers}`}>
                  <div className="flex items-center gap-3">
                    <input
                      id="max-players"
                      type="range"
                      min={1}
                      max={50}
                      step={1}
                      value={maxPlayers}
                      onChange={(event) => setMaxPlayers(Number(event.target.value))}
                      className="create-room-range"
                      style={rangeStyle(maxPlayersP)}
                    />
                    <span className="w-8 text-right font-brandUpright text-[16px] leading-none text-white">{maxPlayers}</span>
                  </div>
                </SettingRow>

                <SettingRow
                  icon={<DynamicTextIcon className="h-6 w-6" />}
                  label="Affichage dynamique des questions"
                  value={dynamicQuestionDisplay ? "Activé" : "Désactivé"}
                >
                  <button
                    type="button"
                    onClick={() => setDynamicQuestionDisplay((enabled) => !enabled)}
                    aria-pressed={dynamicQuestionDisplay}
                    className={[
                      "flex h-[28px] w-full items-center justify-between rounded-[3px] px-3 text-left text-[11px] font-semibold transition",
                      dynamicQuestionDisplay
                        ? "bg-white/90 text-[#111827] hover:bg-white"
                        : "bg-[#1c2748] text-white/70 hover:bg-[#243154]",
                    ].join(" ")}
                  >
                    <span>{dynamicQuestionDisplay ? "Activé" : "Désactivé"}</span>
                    <span
                      aria-hidden
                      className={[
                        "relative h-4 w-8 rounded-full transition",
                        dynamicQuestionDisplay ? "bg-[#7C5CFF]" : "bg-white/20",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "absolute top-0.5 h-3 w-3 rounded-full bg-white transition",
                          dynamicQuestionDisplay ? "left-[18px]" : "left-0.5",
                        ].join(" ")}
                      />
                    </span>
                  </button>
                </SettingRow>
              </div>
            )}

            {activePanel === "code" && (
              <div id="create-room-panel-code" role="tabpanel" aria-label="Code" className="space-y-4">
                <div className="rounded-lg bg-[#0B1229] p-6 text-center">
                  <p className="font-brandUpright text-[18px] uppercase leading-none tracking-[0.05em] text-white/80">
                    Code de la partie
                  </p>
                  <div className="mt-5 rounded-md bg-white px-6 py-4 font-mono text-4xl font-black tracking-[0.32em] text-[#0B1229]">
                    {code || "----"}
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                    <button
                      type="button"
                      onClick={refreshCodeFromServer}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#24304F] text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#2d3b61]"
                    >
                      <RefreshIcon className="h-4 w-4" />
                      Régénérer
                    </button>
                    <button
                      type="button"
                      onClick={copyCode}
                      disabled={!code}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#7C5CFF] text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#8c70ff] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <CopyIcon className="h-4 w-4" />
                      {copied ? "Copié !" : "Copier"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activePanel === "lobby" && (
              <div id="create-room-panel-lobby" role="tabpanel" aria-label="Lobby" />
            )}

            <div className="sr-only" aria-live="polite">
              {copied ? "Le code a été copié dans le presse-papiers." : ""}
              {bannedThemes.length === 0 ? "Tous les thèmes sont inclus." : `${bannedThemes.length} thème(s) exclu(s).`}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}