// web/src/pages/ProfilePage.tsx

import type { ReactNode } from "react";
import Background from "../components/Background";

import {
  ArrowUpRight,
  BadgeCheck,
  Camera,
  Check,
  Clock,
  Edit3,
  Shield,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

const avatarSrc = "/src/assets/89.jpg";

const mockProfile = {
  name: "Synapz",
  username: "@lea.dmt",
  avatar: avatarSrc,
  rank: "Aigle rubis",
  globalPosition: 18,
  score: 24180,
  streak: 12,
};

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

const CATEGORY_ACCURACY: Record<CategoryKey, number> = {
  CINEMA_SERIES: 88,
  ARTS_CULTURE: 82,
  JEUX_BD: 75,
  GEOGRAPHIE: 90,
  LANGUES_LITTERATURE: 86,
  ECONOMIE_POLITIQUE: 20,
  GASTRONOMIE: 83,
  CROYANCES: 77,
  SPORT: 92,
  HISTOIRE: 84,
  DIVERS: 71,
  SCIENCES_NATURELLES: 5,
  SCIENCES_TECHNIQUES: 80,
  MUSIQUE: 76,
  ACTUALITES_MEDIAS: 81,
};

// Libellés (longs) affichés dans les barres
const CATEGORY_SHORT: Record<CategoryKey, string> = {
  SPORT: "SPORT",
  GEOGRAPHIE: "GEOGRAPHIE",
  SCIENCES_NATURELLES: "SCIENCES NATURELLES",
  CINEMA_SERIES: "CINEMA & SERIES",
  LANGUES_LITTERATURE: "LANGUES & LITTERATURE",
  HISTOIRE: "HISTOIRE",
  GASTRONOMIE: "GASTRONOMIE",
  ARTS_CULTURE: "ARTS & CULTURE",
  ACTUALITES_MEDIAS: "ACTUALITES & MEDIAS",
  SCIENCES_TECHNIQUES: "SCIENCES & TECHNIQUES",
  ECONOMIE_POLITIQUE: "ECONOMIE & POLITIQUE",
  CROYANCES: "CROYANCES",
  MUSIQUE: "MUSIQUE",
  JEUX_BD: "JEUX & BD",
  DIVERS: "DIVERS",
};

// Couleurs des sigles à l'intérieur des barres
const SHORT_LABEL_COLOR: Record<string, string> = {
  "CINEMA & SERIES": "#B8E9E4",
  "ARTS & CULTURE": "#FCE1B5",
  "JEUX & BD": "#F8E8B4",
  GEOGRAPHIE: "#BCF1F9",
  "LANGUES & LITTERATURE": "#F3C7FA",
  "ECONOMIE & POLITIQUE": "#C4D9FC",
  GASTRONOMIE: "#FDD5B9",
  CROYANCES: "#D9DCFC",
  SPORT: "#DAEFB9",
  HISTOIRE: "#C0C0C0",
  DIVERS: "#E3E3E3",
  "SCIENCES NATURELLES": "#BCEDCE",
  "SCIENCES & TECHNIQUES": "#FAC6C6",
  MUSIQUE: "#F9C8E0",
  "ACTUALITES & MEDIAS": "#FBC5CE",
};

const categoryBarData = (Object.keys(CATEGORY_CONFIG) as CategoryKey[])
  .map((key) => {
    const meta = CATEGORY_CONFIG[key];
    return {
      key,
      label: meta.label,
      short: CATEGORY_SHORT[key],
      color: meta.color,
      accuracy: CATEGORY_ACCURACY[key] ?? 0,
    };
  })
  .sort((a, b) => b.accuracy - a.accuracy);

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
    icon: <Sparkles className="h-5 w-5" />,
    progress: 4,
    goal: 5,
  },
];

const friends = [
  { name: "Nora", status: "En ligne", avatar: avatarSrc },
  { name: "Liam", status: "En partie", avatar: avatarSrc },
  { name: "Sacha", status: "Hors ligne", avatar: avatarSrc },
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

export default function ProfilePage() {
  return (
    <div className="relative text-slate-50">
      <Background />

      {/* CONTENT */}
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-8 lg:px-10">
        {/* ===================== ENTÊTE ===================== */}
        <div className="mb-10">
          <div className="flex items-center gap-8">
            {/* AVATAR */}
            <div
              style={{
                width: 200,
                height: 200,
                borderRadius: 24,
                padding: 4,
                background: "linear-gradient(135deg, #fb7185, #a855f7, #3b82f6)",
                boxShadow: "0 0 24px rgba(248,113,113,0.45)",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 20,
                  overflow: "hidden",
                  backgroundColor: "#020617",
                }}
              >
                <img
                  src={avatarSrc}
                  alt="Photo de profil"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            </div>

            {/* INFOS */}
            <div className="flex flex-col gap-3">
              <h1 className="font-brutal text-3xl sm:text-4xl text-slate-50">
                {mockProfile.name}
              </h1>

              <div className="flex flex-wrap gap-3 text-sm font-semibold">
                <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-slate-100 ring-1 ring-slate-600/70">
                  <Shield className="h-4 w-4" /> Rang {mockProfile.rank}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-slate-100 ring-1 ring-slate-600/70">
                  <Trophy className="h-4 w-4" /> #{mockProfile.globalPosition} global
                </span>
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
                <div className="flex items-center justify_between text-sm text-slate-300">
                  <span>Temps moyen</span>
                  <Clock className="h-4 w-4 text-amber-300" />
                </div>
                <p className="mt-2 text-3xl font-semibold text-amber-100">5.1s</p>
                <p className="text-xs text-slate-400">Réaction stable</p>
              </div>

              <div className="rounded-2xl border border-slate-800/70 bg-black/70 p-4">
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>Rang moyen</span>
                  <Users className="h-4 w-4 text-sky-300" />
                </div>
                <p className="mt-2 text-3xl font-semibold text-sky-100">Top 5%</p>
                <p className="text-xs text-slate-400">Sur les 30 dernières parties</p>
              </div>
            </div>

            {/* Bar chart catégories */}
            <div className="mt-5 rounded-2xl border border-slate-800/70 bg-black/70 p-4">
              <div className="flex items-center justify-between mb-3 text-sm text-slate-300">
                <span>Taux de réussite par catégorie</span>
                <span className="text-xs text-slate-400">Mise à jour quotidienne</span>
              </div>

              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={categoryBarData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 30 }}
                  >
                    {/* pas de labels X visibles, uniquement les libellés dans les barres + % dessous */}
                    <XAxis dataKey="label" tick={false} axisLine={false} />
                    <YAxis
                      tick={{ fill: "#94A3B8", fontSize: 12 }}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      contentStyle={{
                        backgroundColor: "#020617",
                        border: "1px solid #1F2937",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "#fff" }}
                      labelFormatter={(label) => String(label)}
                      formatter={(v: number) => [`${v}%`, "Taux"]}
                    />
                    <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                      {categoryBarData.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}

                      {/* Libellé de la catégorie, dans la barre */}
                      <LabelList
                        dataKey="short"
                        content={(props: any) => {
                          const { x = 0, y = 0, width = 0, height = 0, value } = props;

                          const horizontalPadding = 45;
                          const verticalPadding = 10;

                          const cx = Number(x) + horizontalPadding;
                          const cy = Number(y) + Number(height) - verticalPadding;

                          const short = String(value).toUpperCase();
                          const labelColor =
                            SHORT_LABEL_COLOR[short] ?? "#F9FAFB";

                          return (
                            <text
                              x={cx}
                              y={cy}
                              transform={`rotate(-90, ${cx}, ${cy})`}
                              textAnchor="start"
                              fill={labelColor}
                              fontSize={12}
                              fontWeight={800}
                              style={{
                                fontFamily:
                                  "var(--font-brutal, brutal, system-ui)",
                              }}
                            >
                              {short}
                            </text>
                          );
                        }}
                      />

                      {/* Valeur sous la barre (ex: 85%) */}
                      <LabelList
                        dataKey="accuracy"
                        content={(props: any) => {
                          const { x = 0, y = 0, width = 0, height = 0, value } = props;

                          const cx = Number(x) + Number(width) / 2;
                          const cy = Number(y) + Number(height) + 18; // sous la barre

                          return (
                            <text
                              x={cx}
                              y={cy}
                              textAnchor="middle"
                              fill="#E5E7EB"
                              fontSize={11}
                              fontWeight={600}
                              style={{
                                fontFamily:
                                  "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                              }}
                            >
                              {`${value}%`}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ===================== GRILLE : GAUCHE / DROITE ===================== */}
        <div className="grid gap-6 lg:grid-cols-[280px,minmax(0,1fr)]">
          {/* COLONNE GAUCHE */}
          <aside className="flex flex-col gap-4">
            {/* Score + série + spoiler */}
            <div className="rounded-3xl border border-slate-800/70 bg-black/70 shadow-[0_20px_60px_rgba(15,23,42,0.9)] overflow-hidden">
              <div className="relative h-32 w-full bg-gradient-to-br from-rose-500/40 via-purple-500/30 to-blue-500/25" />
              <div className="-mt-12 px-4 pb-4">
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-slate-800/70 bg-black/70 p-3 text-center text-sm text-slate-100">
                  <div>
                    <p className="text-xs uppercase text-slate-400">Score total</p>
                    <span className="text-xl font-semibold text-rose-100">
                      {mockProfile.score.toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-400">Série actuelle</p>
                    <span className="text-xl font-semibold text-emerald-100">
                      {mockProfile.streak} jours
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
                  <Shield className="h-5 w-5" />
                  <div>
                    <p className="font-semibold">Protection anti-spoiler activée</p>
                    <p className="text-xs text-emerald-100/80">
                      Masque les réponses avant validation.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Amis */}
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
            {/* Succès */}
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

            {/* Historique */}
            <SectionCard title="Historique des parties">
              <div className="grid gap-3 md:grid-cols-3">
                {history.map((e) => (
                  <div
                    key={e.title}
                    className="rounded-2xl border border-slate-800/70 bg-black/70 p-4 text-sm text-slate-100"
                  >
                    <div className="flex items_center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          {e.title}
                        </p>
                        <p className="text-base font-semibold text-white">
                          {e.detail}
                        </p>
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
    </div>
  );
}
