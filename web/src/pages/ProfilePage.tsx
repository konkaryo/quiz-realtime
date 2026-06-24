// web/src/pages/ProfilePage.tsx

import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Pencil, Trophy, CalendarDays, Clock3 } from "lucide-react";
import cardsIconUrl from "@/assets/cards.png";
import rankingIconUrl from "@/assets/ranking.png";
import bitIconUrl from "@/assets/bit.png";
import { getLevelProgress } from "../utils/experience";
import Background from "../components/Background";

type CurrentUser = {
  id?: string;
  playerId?: string | null;
  displayName?: string;
  img?: string | null;
  experience?: number;
  bits?: number;
};

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");

const PROFILE_AVATAR_UPDATED_EVENT = "profile-avatar-updated";
const avatarCacheBust = (url: string) => {
  const stamp = `t=${Date.now()}`;
  return url.includes("?") ? `${url}&${stamp}` : `${url}?${stamp}`;
};


const fallbackAvatar = "/img/profiles/0.avif";

/* ---------------------- CATÉGORIES + COULEURS ---------------------- */

const CATEGORY_CONFIG = {
AUDIOVISUEL: {
  label: "Audiovisuel",
  color: "#42B8A7",
},
ARTS: {
  label: "Arts",
  color: "#B889F0",
},
CROYANCES: {
  label: "Croyances",
  color: "#8E8FE8",
},
DIVERS: {
  label: "Divers",
  color: "#9EA8BF",
},
GEOGRAPHIE: {
  label: "Géographie",
  color: "#4DB8E4",
},
HISTOIRE: {
  label: "Histoire",
  color: "#BEC7DA",
},
LITTERATURE: {
  label: "Littérature",
  color: "#B65ACB",
},
MUSIQUE: {
  label: "Musique",
  color: "#D066B8",
},
NATURE: {
  label: "Nature",
  color: "#69C8A5",
},
POP_CULTURE: {
  label: "Pop culture",
  color: "#A970FF",
},
SCIENCE: {
  label: "Science",
  color: "#D87AA8",
},
SOCIETE: {
  label: "Société",
  color: "#6D86E8",
},
SPORT: {
  label: "Sport",
  color: "#7CC4D8",
},
TRADITIONS: {
  label: "Traditions",
  color: "#C47ACB",
},
} as const;

type CategoryKey = keyof typeof CATEGORY_CONFIG;

type ProfileDifficultyStats = {
  easy?: number;
  moderate?: number;
  difficult?: number;
  extreme?: number;
  easyPercent?: number;
  moderatePercent?: number;
  difficultPercent?: number;
  extremePercent?: number;
};

type CategoryStat = { total: number; correct: number; accuracy: number };

const emptyCategoryAccuracy = () =>
  (Object.keys(CATEGORY_CONFIG) as CategoryKey[]).reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<CategoryKey, number>
  );

function clampAccuracy(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

type SectionCardProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

function SectionCard({ title, children, className }: SectionCardProps) {

  return (
    <section
      className={`flex flex-col rounded-xl border border-white/[0.06] bg-[#131829] p-4 shadow-[0_22px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl ${className ?? ""}`}
    >
      <h3 className="mb-4 font-brandUpright text-[18px] uppercase leading-none tracking-[0.05em] text-white/95">
        {title}
      </h3>
      {children}
    </section>
  );
}

function StatCard({ icon, value, label, accent }: { icon: ReactNode; value: string; label: string; accent: string }) {
  return (
    <div className="flex min-h-[72px] items-center gap-4 rounded-xl border border-white/[0.06] bg-[#131829] px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_18px_42px_rgba(0,0,0,0.28)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.055]" style={{ color: accent }}>
        {icon}
      </div>
      <div>
        <div className="font-brutal text-2xl leading-none text-white">{value}</div>
        <div className="mt-1 font-inter text-[11px] font-medium text-slate-400">{label}</div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { playerId } = useParams<{ playerId: string }>();
  const isSelfProfile = !playerId;
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [categoryAccuracy, setCategoryAccuracy] = useState<Record<CategoryKey, number>>(emptyCategoryAccuracy);

  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null);
  const [pendingAvatarName, setPendingAvatarName] = useState<string | null>(null);
  const [appliedAvatarUrl, setAppliedAvatarUrl] = useState<string | null>(null);

  const [distinctQuestions, setDistinctQuestions] = useState(0);
  const [bitsRank, setBitsRank] = useState<number | null>(null);
  const [difficultyStats, setDifficultyStats] = useState<ProfileDifficultyStats>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const endpoint = playerId ? `${API_BASE}/players/${playerId}` : `${API_BASE}/auth/me`;
        const res = await fetch(endpoint, { credentials: isSelfProfile ? "include" : "omit" });
        if (!res.ok) {
          if (mounted) setUser(null);
          return;
        }

        if (playerId) {
          const payload = (await res.json()) as { player?: { id: string; name: string; img?: string | null; experience?: number; bits?: number } };
          if (mounted) {
            setUser(payload.player ? { id: payload.player.id, playerId: payload.player.id, displayName: payload.player.name, img: payload.player.img ?? null, experience: payload.player.experience ?? 0, bits: payload.player.bits ?? 0 } : null);
          }
        } else {
          const { user } = (await res.json()) as { user: CurrentUser | null };
          if (mounted) setUser(user ?? null);
        }
      } catch {
        if (mounted) setUser(null);
      }
    })();
    return () => { mounted = false; };
  }, [isSelfProfile, playerId]);

  useEffect(() => {
    if (!isSelfProfile || !user?.playerId || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(`profile-avatar:${user.playerId}`);
    if (stored) setAppliedAvatarUrl(stored);
  }, [isSelfProfile, user?.playerId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const endpoint = playerId ? `${API_BASE}/players/${playerId}/stats` : `${API_BASE}/auth/me/stats`;
        const res = await fetch(endpoint, { credentials: isSelfProfile ? "include" : "omit" });
        if (!res.ok) return;

        const payload = (await res.json()) as {
          stats?: Record<string, CategoryStat>;
          distinctQuestions?: number;
          totalQuestions?: number;
          difficulty?: ProfileDifficultyStats;
          bitsRank?: number | null;
        };

        const base = emptyCategoryAccuracy();
        if (payload.stats) {
          for (const [theme, stat] of Object.entries(payload.stats)) {
            if (theme in base) base[theme as CategoryKey] = stat.accuracy ?? 0;
          }
        }

        if (mounted) {
          setCategoryAccuracy(base);
          setDistinctQuestions(payload.distinctQuestions ?? payload.totalQuestions ?? 0);
          setBitsRank(payload.bitsRank ?? null);
          setDifficultyStats(payload.difficulty ?? {});
        }
      } catch {
        if (mounted) {
          setCategoryAccuracy(emptyCategoryAccuracy());
          setDistinctQuestions(0);
          setBitsRank(null);
          setDifficultyStats({});
        }
      }
    })();
    return () => { mounted = false; };
  }, [isSelfProfile, playerId]);

  const favoriteThemes = useMemo(() => {
    return (Object.keys(CATEGORY_CONFIG) as CategoryKey[])
      .map((key) => ({
        key,
        ...CATEGORY_CONFIG[key],
        score: clampAccuracy(categoryAccuracy[key] ?? 0),
      }))
      .sort((a, b) => b.score - a.score);
  }, [categoryAccuracy]);

  const displayName = user?.displayName ?? "Utilisateur";
  const avatarUrl = appliedAvatarUrl ?? user?.img ?? fallbackAvatar;
  const xpProgress = getLevelProgress(user?.experience ?? 0);
  const canEditAvatar = isSelfProfile;
  const bitsCount = user?.bits ?? 0;
  const xpMissingForNextLevel = Math.max(0, xpProgress.needed - xpProgress.gained);
  const bitsRankLabel = bitsRank ? `#${bitsRank}` : "—";
  const difficultyRows = useMemo(() => [
    { label: "Facile", percent: difficultyStats.easyPercent ?? 0, color: "#c4b5fd" },
    { label: "Modéré", percent: difficultyStats.moderatePercent ?? 0, color: "#a78bfa" },
    { label: "Difficile", percent: difficultyStats.difficultPercent ?? 0, color: "#8b5cf6" },
    { label: "Extrême", percent: difficultyStats.extremePercent ?? 0, color: "#5b21b6" },
  ], [difficultyStats]);
  const difficultyDonutGradient = useMemo(() => {
    const gapDegrees = 3;
    const gapColor = "#131829";
    const totalPercent = difficultyRows.reduce((sum, row) => sum + row.percent, 0);
    if (totalPercent <= 0) return "conic-gradient(rgba(148,163,184,0.16) 0deg 360deg)";
    const visibleRows = difficultyRows.filter((row) => row.percent > 0);
    const totalGap = visibleRows.length > 1 ? visibleRows.length * gapDegrees : 0;
    const availableDegrees = Math.max(0, 360 - totalGap);

    let cursor = 0;
    const segments = visibleRows.flatMap((row) => {
      const span = (row.percent / totalPercent) * availableDegrees;
      const start = cursor;
      const end = cursor + span;
      cursor = end + gapDegrees;
      if (gapDegrees <= 0 || visibleRows.length <= 1) return [`${row.color} ${start}deg ${end}deg`];
      return [`${row.color} ${start}deg ${end}deg`, `${gapColor} ${end}deg ${cursor}deg`];
    });

    return `conic-gradient(from -90deg, ${segments.join(", ")})`;
  }, [difficultyRows]);

  const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

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
        body: JSON.stringify({ dataUrl: pendingAvatarUrl, filename: pendingAvatarName ?? undefined }),
      });

      if (res.ok) {
        const payload = (await res.json()) as { img?: string | null };
        if (payload.img) {
          const nextImg = avatarCacheBust(payload.img);
          setAppliedAvatarUrl(nextImg);
          setUser((prev) => (prev ? { ...prev, img: nextImg } : prev));
          if (user?.playerId && typeof window !== "undefined") {
            window.localStorage.setItem(`profile-avatar:${user.playerId}`, nextImg);
          }
          window.dispatchEvent(new CustomEvent(PROFILE_AVATAR_UPDATED_EVENT, { detail: { img: nextImg, playerId: user?.playerId ?? null } }));
        }
      }
    } catch {
      // Upload failures are intentionally silent for the profile preview.
    }


    handleAvatarEditorClose();
  };

  return (
    <div className="relative h-[calc(100dvh-52px)] overflow-hidden font-inter text-slate-50">
      <Background position="absolute" />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_0%,rgba(30,64,175,0.08),transparent_30%)]" />

      <main className="relative z-10 mx-auto h-full max-w-[1280px] overflow-hidden px-4 pb-6 pt-9 sm:px-6 lg:px-8">
        <header className="mb-8 grid gap-7 lg:grid-cols-[380px_1fr] lg:items-center">
          <div className="flex items-center gap-6">
            <div className="relative h-[108px] w-[108px] shrink-0 rounded-full">
              <button type="button" onClick={canEditAvatar ? () => setIsAvatarEditorOpen(true) : undefined} disabled={!canEditAvatar} className={`relative h-full w-full overflow-hidden rounded-full bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:cursor-default ${canEditAvatar ? "hover:ring-2 hover:ring-white hover:ring-offset-2 hover:ring-offset-[#090f24]" : ""}`} aria-label={canEditAvatar ? "Modifier la photo de profil" : `Photo de profil de ${displayName}`}>
                <img src={avatarUrl} alt={`Photo de profil de ${displayName}`} className="h-full w-full object-cover" />
              </button>
              {canEditAvatar ? <span className="pointer-events-none absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#6d28d9] text-white shadow-lg"><Pencil className="h-4 w-4" /></span> : null}
            </div>

            <div className="min-w-0 -translate-y-2">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-brutal text-[34px] leading-tight text-white">{displayName}</h1>
                {canEditAvatar ? <Pencil className="h-4 w-4 text-slate-400" /> : null}
              </div>
              <div className="mt-1 flex h-8 items-center gap-0.5 font-inter text-[13px] font-semibold text-white"><img src={bitIconUrl} alt="" className="-ml-2 h-8 w-8 object-contain" />{bitsCount}</div>
              <div className="mt-1 flex items-center gap-2 text-[12px] font-medium text-slate-400"><CalendarDays className="h-3.5 w-3.5" />Membre depuis mai 2026</div>
            </div>
          </div>

          <div className="grid w-full max-w-[460px] gap-3 justify-self-end sm:grid-cols-2">
            <StatCard icon={<img src={rankingIconUrl} alt="" className="h-6 w-6 object-contain" />} value={bitsRankLabel} label="Classement global" accent="#DE46A9" />
            <StatCard icon={<img src={cardsIconUrl} alt="" className="h-6 w-6 object-contain" />} value={String(distinctQuestions)} label="Questions répondues" accent="#a78bfa" />
          </div>
        </header>

        <nav className="mb-4 flex gap-7 border-b border-white/[0.06] font-inter text-[13px] font-bold text-slate-400">
          {['Aperçu', 'Historique', 'Statistiques', 'Succès', 'Paramètres'].map((tab, index) => <button key={tab} className={`pb-1.5 ${index === 0 ? 'border-b-2 border-[#8b5cf6] text-white' : 'hover:text-white'}`}>{tab}</button>)}
        </nav>

        <div className="grid gap-3 lg:grid-cols-[1.15fr_1.9fr]">
          <SectionCard title="Niveau">
            <div className="flex flex-col items-center gap-5">
              <div className="grid h-16 w-16 place-items-center bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2072%2072%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M36%203L64.6%2019.5v33L36%2069%207.4%2052.5v-33L36%203z%22%20fill%3D%22%23172033%22%20stroke%3D%22%238b5cf6%22%20stroke-width%3D%222%22/%3E%3C/svg%3E')] bg-contain text-3xl font-black text-white">{xpProgress.level}</div>
              <div className="w-full"><div className="h-2 overflow-hidden rounded-[2px] bg-slate-700/50"><div className="h-full rounded-[2px] bg-gradient-to-r from-[#7c3aed] to-[#a855f7]" style={{ width: `${xpProgress.progress * 100}%` }} /></div><p className="mt-2 text-[11px] font-semibold text-slate-400">Niveau suivant : {xpMissingForNextLevel} XP</p></div>
            </div>
          </SectionCard>

          <SectionCard title="Activité récente">
            <div className="flex min-h-[126px] flex-col items-center justify-center text-center"><div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-500/30 text-slate-200"><Clock3 className="h-6 w-6" /></div><p className="text-[12px] font-extrabold text-slate-300">Aucune activité pour le moment.</p><p className="mt-2 text-[11px] text-slate-400">Joue à des quiz pour voir ton historique ici !</p></div>
          </SectionCard>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.15fr_1fr_0.86fr]">
          <SectionCard title="Thèmes préférés">
            <div className="profile-themes-scroll max-h-48 overflow-y-auto pr-6">
              {favoriteThemes.map((theme, index) => <div key={theme.key} className="grid grid-cols-[30px_minmax(92px,1fr)_minmax(110px,1.75fr)_42px] items-center gap-4 bg-[#131829] py-1.5"><div className="grid h-7 w-7 place-items-center rounded-[5px] font-inter text-[12px] font-black text-white" style={{ backgroundColor: theme.color }}>{index + 1}</div><span className="font-inter text-[11px] font-bold text-white">{theme.label}</span><div className="h-2.5 overflow-hidden rounded-[2px] bg-slate-700/45"><div className="h-full rounded-[2px]" style={{ width: `${theme.score}%`, backgroundColor: theme.color }} /></div><span className="text-right font-inter text-[11px] font-black" style={{ color: theme.color }}>{theme.score}%</span></div>)}
            </div>
          </SectionCard>

          <SectionCard title="Difficulté des questions" className="min-h-[220px]">
            <div className="flex flex-1 items-center justify-center gap-7 py-2">
              <div
                aria-label="Répartition des questions par difficulté"
                className="relative h-32 w-32 rounded-full shadow-[0_0_32px_rgba(15,23,42,0.18)]"
                role="img"
                style={{ background: difficultyDonutGradient }}
              >
                <div className="absolute inset-[31px] rounded-full bg-[#131829]" />
              </div>
              <div className="space-y-3">{difficultyRows.map((row) => <div key={row.label} className="grid grid-cols-[12px_72px_32px] items-center gap-2 font-inter text-[11px] font-bold text-slate-300"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />{row.label}<span className="text-right text-slate-400">{row.percent}%</span></div>)}</div>
            </div>
          </SectionCard>

          <SectionCard title="Succès récents" className="min-h-[220px]">
            <div className="flex flex-1 flex-col items-center justify-center text-center"><div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-slate-500/30 text-slate-200"><Trophy className="h-6 w-6" /></div><p className="text-[12px] font-extrabold text-slate-300">Aucun succès pour le moment.</p><p className="mt-2 max-w-[190px] text-[11px] leading-5 text-slate-400">Relève des défis pour débloquer des succès !</p></div>
          </SectionCard>
        </div>
      </main>

      {isAvatarEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800/80 bg-slate-950 p-5 text-slate-100 shadow-[0_25px_60px_rgba(15,23,42,0.6)]">
            <h2 className="font-brandUpright text-[22px] uppercase leading-none tracking-[0.04em] text-white">Mettre à jour la photo de profil</h2>
            <div className="mt-4 flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-full border border-slate-700 bg-slate-900"><img src={pendingAvatarUrl ?? avatarUrl} alt="Aperçu de la photo de profil" className="h-full w-full object-cover" /></div>
              <div className="flex flex-1 flex-col gap-2"><label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-white/70 hover:text-white">Choisir une image<input type="file" accept="image/*" className="sr-only" onChange={handleAvatarFileChange} /></label><p className="text-[11px] text-slate-400">{pendingAvatarName ?? "Formats acceptés : JPG, PNG, WEBP."}</p></div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-3"><button type="button" onClick={handleAvatarEditorClose} className="rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Annuler</button><button type="button" onClick={handleAvatarSave} disabled={!pendingAvatarUrl} className="rounded-lg bg-[#6F5BD4] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#7d6ae0] disabled:cursor-not-allowed disabled:bg-slate-700/70 disabled:text-slate-400">Enregistrer</button></div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
