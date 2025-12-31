// web/src/pages/ProfilePage.tsx

import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import Background from "../components/Background";
import { getLevelProgress } from "../utils/experience";

import { BadgeCheck, Clock, Edit3, Trophy, Users } from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";

type CurrentUser = {
  displayName?: string;
  img?: string | null;
  experience?: number;
};

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");

const fallbackAvatar = "/img/profiles/0.avif";

/* ---------------------- CATÉGORIES + COULEURS ---------------------- */

const CATEGORY_CONFIG = {
  CINEMA_SERIES: { label: "Cinéma & Séries", color: "#14B8A6" },
  ARTS_CULTURE: { label: "Arts & Culture", color: "#F59E0B" },
  JEUX_BD: { label: "Jeux & BD", color: "#EAB308" },
  GEOGRAPHIE: { label: "Géographie", color: "#22D3EE" },
  LANGUES_LITTERATURE: { label: "Langues & Littérature", color: "#D946EF" },
  ECONOMIE_POLITIQUE: { label: "Économie & Politique", color: "#3B82F6" },
  GASTRONOMIE: { label: "Gastronomie", color: "#F97316" },
  CROYANCES: { label: "Croyances", color: "#818CF8" },
  SPORT: { label: "Sport", color: "#84CC16" },
  HISTOIRE: { label: "Histoire", color: "#FAFAFA" },
  DIVERS: { label: "Divers", color: "#A3A3A3" },
  SCIENCES_NATURELLES: { label: "Sciences naturelles", color: "#22C55E" },
  SCIENCES_TECHNIQUES: { label: "Sciences & Techniques", color: "#EF4444" },
  MUSIQUE: { label: "Musique", color: "#EC4899" },
  ACTUALITES_MEDIAS: { label: "Actualités & Médias", color: "#F43F5E" },
} as const;

type CategoryKey = keyof typeof CATEGORY_CONFIG;

const emptyCategoryAccuracy = () =>
  (Object.keys(CATEGORY_CONFIG) as CategoryKey[]).reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<CategoryKey, number>
  );

/* ---------------------- HELPERS GRAPH (SEGMENTS) ---------------------- */

const SEGMENTS = 10;
const EMPTY_SEGMENT_COLOR = "rgba(148,163,184,0.16)";
const SEGMENT_STROKE = "rgba(2,6,23,0.55)";
const SEGMENT_STROKE_WIDTH = 1;
const SEGMENT_RADIUS = 2;

function clampAccuracy(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function ellipsize(s: string, max = 28) {
  const str = String(s ?? "");
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

type SegmentedBarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: any;
};

/**
 * 10 segments de 10% + overlay coloré (plein/partiel).
 */
function SegmentedBarShape(props: SegmentedBarShapeProps): React.ReactElement {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;

  // Placeholder: ne rien dessiner
  if (payload?.isPlaceholder) return <g />;

  const accuracy = clampAccuracy(Number(payload?.accuracy ?? 0));
  const color = String(payload?.color ?? "#22D3EE");

  const segW = width / SEGMENTS;

  const innerPadX = 1;
  const innerPadY = 1;

  const rectH = Math.max(10, height - innerPadY * 2);
  const rectY = y + innerPadY;

  const out: React.ReactElement[] = [];

  for (let i = 0; i < SEGMENTS; i++) {
    const segStart = i * 10;
    const segEnd = (i + 1) * 10;

    const filledPortion =
      accuracy >= segEnd ? 1 : accuracy <= segStart ? 0 : (accuracy - segStart) / 10;

    const segX = x + i * segW;

    out.push(
      <rect
        key={`bg-${i}`}
        x={segX}
        y={rectY}
        width={segW}
        height={rectH}
        fill={EMPTY_SEGMENT_COLOR}
        stroke={SEGMENT_STROKE}
        strokeWidth={SEGMENT_STROKE_WIDTH}
        rx={SEGMENT_RADIUS}
        ry={SEGMENT_RADIUS}
      />
    );

    if (filledPortion > 0) {
      const usableW = Math.max(0, segW - innerPadX * 2);
      const rawW = usableW * filledPortion;
      const fgW = Math.min(usableW, Math.max(1, rawW));

      out.push(
        <rect
          key={`fg-${i}`}
          x={segX + innerPadX}
          y={rectY + 1}
          width={fgW}
          height={Math.max(8, rectH - 2)}
          fill={color}
          rx={SEGMENT_RADIUS}
          ry={SEGMENT_RADIUS}
        />
      );
    }
  }

  return <g>{out}</g>;
}

/**
 * Label % à droite : placeholder => rien
 */
const PercentLabel = (props: any) => {
  const { x = 0, y = 0, width = 0, height = 0, value, payload } = props;

  if (payload?.isPlaceholder) return null;

  const num = Number(value);
  if (!Number.isFinite(num)) return null;

  const v = Math.round(num);
  const tx = Number(x) + Number(width) + 26;
  const ty = Number(y) + Number(height) / 2 + 4;

  return (
    <text
      x={tx}
      y={ty}
      textAnchor="start"
      fill="#E5E7EB"
      fontSize={12}
      fontWeight={700}
      style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {v}%
    </text>
  );
};

/**
 * Tick YAxis : placeholder => rien
 */
const RankTick = (props: any) => {
  const { x, y, payload } = props;
  const v = String(payload?.value ?? "");
  if (!v) return null;

  return (
    <text
      x={Number(x) - 10}
      y={Number(y)}
      dy={4}
      textAnchor="end"
      fill="#E5E7EB"
      fontSize={12}
      style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {ellipsize(v, 30)}
    </text>
  );
};

/**
 * ✅ Cursor conditionnel : placeholder => aucun surlignage
 */
const SmartCursor = (props: any) => {
  const p = props?.payload?.[0]?.payload;
  if (p?.isPlaceholder) return null;

  const { x, y, width, height } = props;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill="rgba(255,255,255,0.04)"
    />
  );
};

/**
 * ✅ Tooltip conditionnelle : placeholder => rien
 */
const SmartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload?.[0]?.payload;
  if (p?.isPlaceholder) return null;

  const cleanLabel = String(label ?? "").replace(/^#\d+\.\s*/, "");
  const a = clampAccuracy(Number(p?.accuracy ?? 0));

  return (
    <div
      style={{
        backgroundColor: "#020617",
        border: "1px solid #1F2937",
        borderRadius: 10,
        padding: "10px 12px",
        color: "#fff",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{cleanLabel}</div>
      <div style={{ color: "#E5E7EB" }}>{Math.round(a)}% — Taux de réussite</div>
    </div>
  );
};

/* ---------------------- AUTRES DONNÉES --------------------------- */

const achievements = [
  {
    title: "Marathon cérébral",
    desc: "30 questions résolues d'affilée",
    icon: <Trophy className="h-5 w-5" />,
    progress: 30,
    goal: 30,
    highlight: true,
  },
  {
    title: "Réflexes de lynx",
    desc: "Temps moyen < 4s sur 20 questions",
    icon: <Clock className="h-5 w-5" />,
    progress: 14,
    goal: 20,
  },
  {
    title: "Maître des thèmes",
    desc: "80% de réussite sur 5 catégories",
    progress: 4,
    goal: 5,
  },
];

const friends = [
  { name: "Nora", status: "En ligne", avatar: fallbackAvatar },
  { name: "Liam", status: "En partie", avatar: fallbackAvatar },
  { name: "Sacha", status: "Hors ligne", avatar: fallbackAvatar },
];

const history = [
  { title: "Duel - Sciences", result: "+24 pts", trend: "up", detail: "Victoire 7 / 10" },
  { title: "Défi du jour", result: "+18 pts", trend: "up", detail: "3e place" },
  { title: "Quiz thématique - Cinéma", result: "-6 pts", trend: "down", detail: "Défaite 5 / 10" },
];

/* ---------------------- UI HELPERS --------------------------- */

type SectionCardProps = {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
};

function SectionCard({ title, children, right, className }: SectionCardProps) {
  const base =
    "rounded-3xl border border-slate-800/70 p-4 sm:p-5 backdrop-blur-xl";
  const finalClassName = className
    ? `${base} ${className}`
    : `${base} bg-black/70 shadow-[0_20px_60px_rgba(15,23,42,0.9)]`;

  return (
    <section className={finalClassName}>
      <header className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-100 sm:text-lg">{title}</h3>
        {right}
      </header>
      {children}
    </section>
  );
}

/* ================================================================== */
/* =========================== PAGE ================================= */
/* ================================================================== */

type Row = {
  key: string;
  label: string;
  color: string;
  accuracy: number;
  full: number;
  rank: number;
  labelWithRank: string;
  isPlaceholder?: boolean;
};

function padRows(rows: Row[], targetLen: number, colId: "L" | "R"): Row[] {
  if (rows.length >= targetLen) return rows;

  const out = rows.slice();
  for (let i = rows.length; i < targetLen; i++) {
    out.push({
      key: `__placeholder_${colId}_${i}`,
      label: "",
      color: "transparent",
      accuracy: Number.NaN, // évite toute valeur
      full: 100,            // on garde le "band" (alignement)
      rank: 0,
      labelWithRank: "",
      isPlaceholder: true,
    });
  }
  return out;
}

export default function ProfilePage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [categoryAccuracy, setCategoryAccuracy] = useState<Record<CategoryKey, number>>(
    emptyCategoryAccuracy
  );

  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null);
  const [pendingAvatarName, setPendingAvatarName] = useState<string | null>(null);
  const [appliedAvatarUrl, setAppliedAvatarUrl] = useState<string | null>(null);

  const [totalQuestions, setTotalQuestions] = useState(0);
  const [avgTextResponseMs, setAvgTextResponseMs] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        const { user } = (res.ok ? await res.json() : { user: null }) as {
          user: CurrentUser | null;
        };
        if (mounted) setUser(user ?? null);
      } catch {
        if (mounted) setUser(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me/stats`, {
          credentials: "include",
        });
        if (!res.ok) return;

        const payload = (await res.json()) as {
          stats?: Record<string, { accuracy: number }>;
          totalQuestions?: number;
          avgTextResponseMs?: number | null;
        };

        const base = emptyCategoryAccuracy();
        if (payload.stats) {
          for (const [theme, stat] of Object.entries(payload.stats)) {
            if (theme in base) base[theme as CategoryKey] = stat.accuracy ?? 0;
          }
        }

        if (mounted) {
          setCategoryAccuracy(base);
          setTotalQuestions(payload.totalQuestions ?? 0);
          setAvgTextResponseMs(payload.avgTextResponseMs ?? null);
        }
      } catch {
        if (mounted) {
          setCategoryAccuracy(emptyCategoryAccuracy());
          setTotalQuestions(0);
          setAvgTextResponseMs(null);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const sortedCategoryData = useMemo<Row[]>(() => {
    return (Object.keys(CATEGORY_CONFIG) as CategoryKey[])
      .map((key) => {
        const meta = CATEGORY_CONFIG[key];
        const accuracy = clampAccuracy(categoryAccuracy[key] ?? 0);
        return { key, label: meta.label, color: meta.color, accuracy, full: 100 };
      })
      .sort((a, b) => b.accuracy - a.accuracy)
      .map((item, idx) => ({
        ...(item as any),
        rank: idx + 1,
        labelWithRank: `#${idx + 1}. ${item.label}`,
      }));
  }, [categoryAccuracy]);

  const { leftData, rightData, maxRows } = useMemo(() => {
    const mid = Math.ceil(sortedCategoryData.length / 2);
    const left = sortedCategoryData.slice(0, mid);
    const right = sortedCategoryData.slice(mid);

    const targetRows = left.length;

    return {
      leftData: padRows(left, targetRows, "L"),
      rightData: padRows(right, targetRows, "R"),
      maxRows: targetRows,
    };
  }, [sortedCategoryData]);

  const displayName = user?.displayName ?? "Utilisateur";
  const avatarUrl = appliedAvatarUrl ?? user?.img ?? fallbackAvatar;
  const experienceValue = user?.experience ?? 0;
  const xpProgress = getLevelProgress(experienceValue);

  const barRowPx = 34;
  const minChartH = 260;
  const unifiedChartH = Math.max(minChartH, maxRows * barRowPx);

  const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPendingAvatarUrl(String(reader.result ?? ""));
      setPendingAvatarName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarEditorClose = () => {
    setIsAvatarEditorOpen(false);
    setPendingAvatarUrl(null);
    setPendingAvatarName(null);
  };

  const handleAvatarSave = () => {
    if (pendingAvatarUrl) {
      setAppliedAvatarUrl(pendingAvatarUrl);
    }
    setPendingAvatarUrl(null);
    setPendingAvatarName(null);
    setIsAvatarEditorOpen(false);
  };

  const ChartBlock = ({ data, height }: { data: Row[]; height: number }) => (
    <div className="rounded-2xl border border-slate-800/70 bg-black/50 p-2 sm:p-3">
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 6, right: 86, left: 6, bottom: 12 }}
            barCategoryGap={14}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tick={{ fill: "#94A3B8", fontSize: 12 }}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tickLine={false}
            />

            <YAxis
              type="category"
              dataKey="labelWithRank"
              width={200}
              tickLine={false}
              axisLine={false}
              tick={<RankTick />}
              interval={0}
              tickMargin={8}
            />

            <Tooltip
              cursor={<SmartCursor />}
              content={<SmartTooltip />}
            />

            <Bar
              dataKey="full"
              isAnimationActive={false}
              barSize={18}
              shape={SegmentedBarShape as any}
            >
              <LabelList dataKey="accuracy" content={<PercentLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="relative text-slate-50">
      <Background />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-8 lg:px-10">
        {/* ===================== ENTÊTE ===================== */}
        <div className="mb-10">
          <div className="flex items-center gap-8">
            {/* AVATAR */}
            <div
              style={{
                width: 160,
                height: 160,
                borderRadius: 24,
                padding: 4,
                background: "linear-gradient(135deg, #fb7185, #a855f7, #3b82f6)",
                boxShadow: "0 0 24px rgba(248,113,113,0.45)",
              }}
            >
              <button
                type="button"
                onClick={() => setIsAvatarEditorOpen(true)}
                className="group relative block h-full w-full overflow-hidden rounded-[20px] bg-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/80"
                aria-label="Modifier la photo de profil"
              >
                <img
                  src={avatarUrl}
                  alt={`Photo de profil de ${displayName}`}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold text-slate-100 ring-1 ring-white/20">
                    <Edit3 className="h-3.5 w-3.5" />
                    Modifier
                  </span>
                </div>
              </button>
            </div>

            {/* INFOS */}
            <div className="flex flex-col gap-3">
              <h1 className="font-brutal text-3xl sm:text-4xl text-slate-50">
                {displayName}
              </h1>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <span>Niveau {xpProgress.level}</span>
                  <span className="text-xs text-slate-400">
                    {xpProgress.needed > 0
                      ? `${xpProgress.gained} / ${xpProgress.needed} XP`
                      : "Niveau maximum"}
                  </span>
                </div>

                <div className="h-2 w-full max-w-xs rounded-full bg-slate-800/80">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${xpProgress.progress * 100}%`,
                      background: "linear-gradient(90deg,#38bdf8,#22d3ee)",
                      boxShadow: "inset 0 0 6px rgba(255,255,255,.25)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===================== STATISTIQUES FULL WIDTH ===================== */}
        <div className="mb-10">
          <SectionCard
            title="Statistiques"
            className="shadow-none bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.96),rgba(15,23,42,0.98)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.8),#020617)]"
            right={
              <button className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-100 hover:-translate-y-0.5 hover:border-rose-200/60 hover:text-rose-100 transition">
                <Edit3 className="h-4 w-4" /> Personnaliser
              </button>
            }
          >
            {/* Top 3 stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-800/70 bg-black/70 p-4">
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>Taux global</span>
                  <BadgeCheck className="h-4 w-4 text-emerald-400" />
                </div>
                <p className="mt-2 text-3xl font-semibold text-emerald-100">89%</p>
                <p className="text-xs text-slate-400">+2% vs semaine dernière</p>
              </div>

              <div className="rounded-2xl border border-slate-800/70 bg-black/70 p-4">
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>Temps moyen</span>
                  <Clock className="h-4 w-4 text-amber-300" />
                </div>
                <p className="mt-2 text-3xl font-semibold text-amber-100">
                  {avgTextResponseMs !== null
                    ? `${(avgTextResponseMs / 1000).toFixed(1)}s`
                    : "--"}
                </p>
                <p className="text-xs text-slate-400">
                  Moyenne sur les réponses libres correctes
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800/70 bg-black/70 p-4">
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>Questions jouées</span>
                  <Users className="h-4 w-4 text-sky-300" />
                </div>
                <p className="mt-2 text-3xl font-semibold text-sky-100">
                  {totalQuestions.toLocaleString("fr-FR")}
                </p>
                <p className="text-xs text-slate-400">Total de questions répondues</p>
              </div>
            </div>

            {/* Graph en 2 colonnes */}
            <div className="mt-5 rounded-2xl border border-slate-800/70 bg-black/70 p-4">
              <div className="mb-3 flex items-center justify-between text-sm text-slate-300">
                <span>Taux de réussite par catégorie</span>
                <span className="text-xs text-slate-400">Mise à jour quotidienne</span>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartBlock data={leftData} height={unifiedChartH} />
                <ChartBlock data={rightData} height={unifiedChartH} />
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ===================== GRILLE : GAUCHE / DROITE ===================== */}
        <div className="grid gap-6 lg:grid-cols-[280px,minmax(0,1fr)]">
          {/* COLONNE GAUCHE */}
          <aside className="flex flex-col gap-4">
            <div className="rounded-3xl border border-slate-800/70 bg-black/70 shadow-[0_20px_60px_rgba(15,23,42,0.9)] overflow-hidden">
              <div className="relative h-32 w-full bg-gradient-to-br from-rose-500/40 via-purple-500/30 to-blue-500/25" />
            </div>

            <SectionCard title="Liste d'amis">
              <div className="flex flex-col gap-3">
                {friends.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center gap-3 rounded-2xl border border-slate-800/60 bg-black/70 px-3 py-2"
                  >
                    <img
                      src={f.avatar}
                      alt={`Avatar ${f.name}`}
                      className="h-10 w-10 rounded-2xl object-cover"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-100">{f.name}</p>
                      <p className="text-xs text-slate-400">{f.status}</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center rounded-full bg-rose-200/10 px-3 py-1 text-xs font-semibold text-rose-100 ring-1 ring-rose-200/40 hover:-translate-y-0.5 hover:bg-rose-200/15 transition"
                    >
                      Inviter
                    </button>
                  </div>
                ))}
              </div>
            </SectionCard>
          </aside>

          {/* COLONNE DROITE */}
          <div className="flex flex-col gap-5">
            <SectionCard
              title="Succès"
              right={<button className="text-xs font-semibold text-rose-100">Tout voir</button>}
            >
              <div className="grid gap-3 md:grid-cols-3">
                {achievements.map((a) => {
                  const ratio = Math.min(a.progress / a.goal, 1);
                  return (
                    <div
                      key={a.title}
                      className={`flex flex-col gap-3 rounded-2xl border border-slate-800/60 bg-black/70 p-4 ${
                        a.highlight ? "ring-1 ring-rose-200/40" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between text-sm text-slate-200">
                        <span className="flex items-center gap-2 font-semibold text-white">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-200/10 text-rose-100 ring-1 ring-rose-200/40">
                            {a.icon}
                          </span>
                          {a.title}
                        </span>
                        <span className="text-xs text-slate-400">
                          {a.progress} / {a.goal}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{a.desc}</p>
                      <div className="h-2 rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full ${
                            a.highlight
                              ? "bg-gradient-to-r from-rose-300 to-amber-200"
                              : "bg-rose-200/70"
                          }`}
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Historique des parties">
              <div className="grid gap-3 md:grid-cols-3">
                {history.map((e) => (
                  <div
                    key={e.title}
                    className="rounded-2xl border border-slate-800/70 bg-black/70 p-4 text-sm text-slate-100"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          {e.title}
                        </p>
                        <p className="text-base font-semibold text-white">{e.detail}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          e.trend === "up"
                            ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/50"
                            : "bg-rose-500/15 text-rose-100 ring-1 ring-rose-400/50"
                        }`}
                      >
                        {e.result}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-slate-400">
                      Mise à jour automatique côté serveur dès qu'une partie est terminée.
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
      {isAvatarEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800/80 bg-slate-950 p-6 text-slate-100 shadow-[0_25px_60px_rgba(15,23,42,0.6)]">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Mettre à jour la photo de profil
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Importez une image carrée ou recadrez-la pour un rendu optimal.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAvatarEditorClose}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-rose-200/60 hover:text-rose-100 transition"
              >
                Fermer
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="h-24 w-24 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
                  <img
                    src={pendingAvatarUrl ?? avatarUrl}
                    alt="Aperçu de la photo de profil"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-slate-700 bg-slate-900/40 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-rose-200/60 hover:text-rose-100 transition">
                    Choisir une image
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleAvatarFileChange}
                    />
                  </label>
                  <p className="text-xs text-slate-400">
                    {pendingAvatarName ?? "Formats acceptés : JPG, PNG, WEBP."}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleAvatarEditorClose}
                className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleAvatarSave}
                disabled={!pendingAvatarUrl}
                className="rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(244,63,94,0.3)] transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-slate-700/70 disabled:text-slate-400"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
