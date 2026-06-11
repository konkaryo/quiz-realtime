// web/src/pages/ProfilePage.tsx

import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { getLevelProgress } from "../utils/experience";
import { Edit3 } from "lucide-react";
import Background from "../components/Background";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type CurrentUser = {
  id?: string;
  playerId?: string | null;
  displayName?: string;
  img?: string | null;
  experience?: number;
};

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");

const PROFILE_AVATAR_UPDATED_EVENT = "profile-avatar-updated";
const avatarCacheBust = (url: string) => {
  const stamp = `t=${Date.now()}`;
  return url.includes("?") ? `${url}&${stamp}` : `${url}?${stamp}`;
};


const fallbackAvatar = "/img/profiles/0.avif";

/* ---------------------- CATÉGORIES + COULEURS ---------------------- */

const CATEGORY_CONFIG = {
  AUDIOVISUEL:     { label: "Audiovisuel",    color: "#14B8A6" },
  ARTS:            { label: "Arts",           color: "#F59E0B" },
  CROYANCES:       { label: "Croyances",      color: "#818CF8" },
  DIVERS:          { label: "Divers",         color: "#A3A3A3" },
  GEOGRAPHIE:      { label: "Géographie",     color: "#22D3EE" },
  HISTOIRE:        { label: "Histoire",       color: "#FAFAFA" },
  LITTERATURE:     { label: "Littérature",    color: "#D946EF" },
  MUSIQUE:         { label: "Musique",        color: "#EC4899" },
  NATURE:          { label: "Nature",         color: "#22C55E" },
  POP_CULTURE:     { label: "Pop culture",    color: "#EAB308" },
  SCIENCE:         { label: "Science",        color: "#EF4444" },
  SOCIETE:         { label: "Société",        color: "#3B82F6" },
  SPORT:           { label: "Sport",          color: "#84CC16" },
  TRADITIONS:      { label: "Traditions",     color: "#F97316" },
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
  const color = "#02B0FF";

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
  const tx = Number(x) + Number(width) + 16;
  const ty = Number(y) + Number(height) / 2 + 4;

  return (
    <text
      x={tx}
      y={ty}
      textAnchor="start"
      fill="#E5E7EB"
      fontSize={10}
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
      x={Number(x) - 6}
      y={Number(y)}
      dy={4}
      textAnchor="end"
      fill="#E5E7EB"
      fontSize={10}
      style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {ellipsize(v, 36)}
    </text>
  );
};


/**
 * ✅ Tooltip conditionnelle : placeholder => rien
 */
const SmartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload?.[0]?.payload;
  if (p?.isPlaceholder) return null;

  const fullCategoryLabel = String(p?.label ?? label ?? "").replace(/^#\d+\.\s*/, "");
  const a = clampAccuracy(Number(p?.accuracy ?? 0));
  const b = clampAccuracy(100 - a);

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
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{fullCategoryLabel}</div>
      <div style={{ color: "#E5E7EB" }}>{Math.round(a)}% — Bonnes réponses</div>
      <div style={{ color: "#FCA5A5" }}>{Math.round(b)}% — Mauvaises réponses</div>
    </div>
  );
};


/* ---------------------- UI HELPERS --------------------------- */

type SectionCardProps = {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
};

function SectionCard({ title, children, right, className }: SectionCardProps) {
  const base =
    "rounded-[6px] border border-[#2A2D3C] bg-[#2F3558] p-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.45)] sm:p-4 backdrop-blur-xl";
  const finalClassName = className ? `${base} ${className}` : base;

  return (
    <section className={finalClassName}>
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-extrabold uppercase tracking-wide text-white">
          {title}
        </h3>
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
  const { playerId } = useParams<{ playerId: string }>();
  const isSelfProfile = !playerId;
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
        const endpoint = playerId ? `${API_BASE}/players/${playerId}` : `${API_BASE}/auth/me`;
        const res = await fetch(endpoint, {
          credentials: isSelfProfile ? "include" : "omit",
        });
        if (!res.ok) {
          if (mounted) setUser(null);
          return;
        }

        if (playerId) {
          const payload = (await res.json()) as {
            player?: { id: string; name: string; img?: string | null; experience?: number };
          };
          if (mounted) {
            setUser(
              payload.player
                ? {
                    id: payload.player.id,
                    playerId: payload.player.id,
                    displayName: payload.player.name,
                    img: payload.player.img ?? null,
                    experience: payload.player.experience ?? 0,
                  }
                : null
            );
          }
        } else {
          const { user } = (await res.json()) as { user: CurrentUser | null };
          if (mounted) setUser(user ?? null);
        }
      } catch {
        if (mounted) setUser(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isSelfProfile, playerId]);

  useEffect(() => {
    if (!isSelfProfile || !user?.playerId || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(`profile-avatar:${user.playerId}`);
    if (!stored) return;
    setAppliedAvatarUrl(stored);
  }, [isSelfProfile, user?.playerId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const endpoint = playerId
          ? `${API_BASE}/players/${playerId}/stats`
          : `${API_BASE}/auth/me/stats`;
        const res = await fetch(endpoint, {
          credentials: isSelfProfile ? "include" : "omit",
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
  }, [isSelfProfile, playerId]);

  const categoryBarData = useMemo(() => {
    return (Object.keys(CATEGORY_CONFIG) as CategoryKey[])
      .map((key) => {
        const meta = CATEGORY_CONFIG[key];
        const accuracy = clampAccuracy(categoryAccuracy[key] ?? 0);
        const incorrect = clampAccuracy(100 - accuracy);
        return { key, label: meta.label, trigram: key.slice(0, 3), accuracy, incorrect };
      });
  }, [categoryAccuracy]);

  const displayName = user?.displayName ?? "Utilisateur";
  const avatarUrl = appliedAvatarUrl ?? user?.img ?? fallbackAvatar;
  const experienceValue = user?.experience ?? 0;
  const xpProgress = getLevelProgress(experienceValue);
  const canEditAvatar = isSelfProfile;

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

  const handleAvatarSave = async () => {
    if (!pendingAvatarUrl) {
      setIsAvatarEditorOpen(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/auth/me/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dataUrl: pendingAvatarUrl,
          filename: pendingAvatarName ?? undefined,
        }),
      });

      if (res.ok) {
        const payload = (await res.json()) as { img?: string | null };
        if (payload.img) {
          const nextImg = avatarCacheBust(payload.img);
          setAppliedAvatarUrl(nextImg);
          setUser((prev) => (prev ? { ...prev, img: nextImg ?? prev.img } : prev));
          if (user?.playerId && typeof window !== "undefined") {
            window.localStorage.setItem(
              `profile-avatar:${user.playerId}`,
              nextImg
            );
          }
          window.dispatchEvent(
            new CustomEvent(PROFILE_AVATAR_UPDATED_EVENT, {
              detail: { img: nextImg, playerId: user?.playerId ?? null },
            })
          );
        }
      }
    } catch {
      // ignore upload errors for now
    }


    setPendingAvatarUrl(null);
    setPendingAvatarName(null);
    setIsAvatarEditorOpen(false);
  };

  const ChartBlock = () => (
    <div className="rounded-[6px] border border-[#2A2D3C] bg-[#191C2D] p-2.5 sm:p-3.5">
      <div style={{ height: 288 }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={categoryBarData}
            margin={{ top: 12, right: 8, left: 0, bottom: 20 }}
            barCategoryGap={12}
            barSize={28}
          >
            <XAxis
              dataKey="trigram"
              tick={{ fill: "#E5E7EB", fontSize: 12, fontWeight: 700 }}
              axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
              tickLine={false}
            />

            <YAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tick={{ fill: "#94A3B8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip content={<SmartTooltip />} cursor={false} />
            <Bar
              dataKey="accuracy"
              stackId="result"
              fill="#22C55E"
              radius={0}
              activeBar={{ stroke: "#FFFFFF", strokeWidth: 2 }}
            />
            <Bar
              dataKey="incorrect"
              stackId="result"
              fill="#EF4444"
              radius={0}
              activeBar={{ stroke: "#FFFFFF", strokeWidth: 2 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen text-slate-50">
      <Background position="absolute" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {/* ===================== ENTÊTE ===================== */}
        <div className="mb-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
            {/* AVATAR */}
            <div
              style={{
                width: 128,
                height: 128,
                borderRadius: 6,
                border: "1px solid #2A2D3C",
                backgroundColor: "#0F172A",
              }}
            >
              <button
                type="button"
                onClick={canEditAvatar ? () => setIsAvatarEditorOpen(true) : undefined}
                disabled={!canEditAvatar}
                className="group relative block h-full w-full overflow-hidden rounded-[6px] bg-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/80 disabled:cursor-default"
                aria-label={
                  canEditAvatar
                    ? "Modifier la photo de profil"
                    : `Photo de profil de ${displayName}`
                }
              >
                <img
                  src={avatarUrl}
                  alt={`Photo de profil de ${displayName}`}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {canEditAvatar ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-slate-100 ring-1 ring-white/20">
                      <Edit3 className="h-3 w-3" />
                      Modifier
                    </span>
                  </div>
                ) : null}
              </button>
            </div>

            {/* INFOS */}
            <div className="flex flex-col gap-3">
              <h1 className="font-brutal text-2xl text-slate-50 sm:text-3xl">
                {displayName}
              </h1>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <span>Niveau {xpProgress.level}</span>
                  <span className="text-[11px] text-slate-400">
                    {xpProgress.needed > 0
                      ? `${xpProgress.gained} / ${xpProgress.needed} XP`
                      : "Niveau maximum"}
                  </span>
                </div>

                <div className="h-1.5 w-full max-w-[220px] rounded-full bg-slate-800/80">
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
        <div className="mb-8">
          <SectionCard title="Statistiques">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[6px] border border-[#2A2D3C] bg-[#191C2D] p-2.5 text-xs text-slate-100 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      Taux de bonnes réponses
                    </p>
                    <p className="mt-1.5 text-[20px] font-semibold text-white">89%</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[6px] border border-[#2A2D3C] bg-[#191C2D] p-2.5 text-xs text-slate-100 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      Temps de réponse moyen
                    </p>
                    <p className="mt-1.5 text-[20px] font-semibold text-white">
                      {avgTextResponseMs !== null
                        ? `${(avgTextResponseMs / 1000).toFixed(1)}s`
                        : "--"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[6px] border border-[#2A2D3C] bg-[#191C2D] p-2.5 text-xs text-slate-100 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      Questions répondues
                    </p>
                    <p className="mt-1.5 text-[20px] font-semibold text-white">
                      {totalQuestions.toLocaleString("fr-FR")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Graph en 2 colonnes */}
          <SectionCard className="mt-4" title="Taux de réussite par catégorie">

            <ChartBlock />
          </SectionCard>
        </div>

      </div>
      {isAvatarEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-[6px] border border-slate-800/80 bg-slate-950 p-5 text-slate-100 shadow-[0_25px_60px_rgba(15,23,42,0.6)]">
            <div>
              <h2 className="text-base font-semibold text-white">
                Mettre à jour la photo de profil
              </h2>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 overflow-hidden rounded-[6px] border border-slate-700 bg-slate-900">
                  <img
                    src={pendingAvatarUrl ?? avatarUrl}
                    alt="Aperçu de la photo de profil"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-white/70 hover:text-white">
                    Choisir une image
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleAvatarFileChange}
                    />
                  </label>
                  <p className="text-[11px] text-slate-400">
                    {pendingAvatarName ?? "Formats acceptés : JPG, PNG, WEBP."}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleAvatarEditorClose}
                className="rounded-[6px] border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleAvatarSave}
                disabled={!pendingAvatarUrl}
                className="rounded-[6px] bg-[#6F5BD4] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#7d6ae0] disabled:cursor-not-allowed disabled:bg-slate-700/70 disabled:text-slate-400"
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
