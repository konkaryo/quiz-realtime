// web/src/pages/ProfilePage.tsx

import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Flame, Pencil, Star, Target, Trophy, Medal, Clock3 } from "lucide-react";
import { getLevelProgress } from "../utils/experience";
import Background from "../components/Background";

type CurrentUser = {
  id?: string;
  playerId?: string | null;
  displayName?: string;
  img?: string | null;
  experience?: number;
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
      <h3 className="mb-4 text-[12px] font-extrabold uppercase tracking-[0.03em] text-white/95">
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
        <div className="text-2xl font-black leading-none text-white">{value}</div>
        <div className="mt-1 text-[11px] font-medium text-slate-400">{label}</div>
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

  const [totalQuestions, setTotalQuestions] = useState(0);

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
          const payload = (await res.json()) as { player?: { id: string; name: string; img?: string | null; experience?: number } };
          if (mounted) {
            setUser(payload.player ? { id: payload.player.id, playerId: payload.player.id, displayName: payload.player.name, img: payload.player.img ?? null, experience: payload.player.experience ?? 0 } : null);
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

        const payload = (await res.json()) as { stats?: Record<string, { accuracy: number }>; totalQuestions?: number };

        const base = emptyCategoryAccuracy();
        if (payload.stats) {
          for (const [theme, stat] of Object.entries(payload.stats)) {
            if (theme in base) base[theme as CategoryKey] = stat.accuracy ?? 0;
          }
        }

        if (mounted) {
          setCategoryAccuracy(base);
          setTotalQuestions(payload.totalQuestions ?? 0);
        }
      } catch {
        if (mounted) {
          setCategoryAccuracy(emptyCategoryAccuracy());
          setTotalQuestions(0);
        }
      }
    })();
    return () => { mounted = false; };
  }, [isSelfProfile, playerId]);

  const favoriteThemes = useMemo(() => {
    return (Object.keys(CATEGORY_CONFIG) as CategoryKey[])
      .map((key) => ({ key, ...CATEGORY_CONFIG[key], score: clampAccuracy(categoryAccuracy[key] ?? 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [categoryAccuracy]);

  const successRate = useMemo(() => {
    const values = Object.values(categoryAccuracy).map(clampAccuracy).filter((value) => value > 0);
    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [categoryAccuracy]);

  const displayName = user?.displayName ?? "Utilisateur";
  const avatarUrl = appliedAvatarUrl ?? user?.img ?? fallbackAvatar;
  const xpProgress = getLevelProgress(user?.experience ?? 0);
  const canEditAvatar = isSelfProfile;
  const playedGames = totalQuestions > 0 ? Math.max(1, Math.round(totalQuestions / 10)) : 0;

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
    <div className="relative min-h-screen overflow-hidden text-slate-50">
      <Background position="absolute" />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_5%,rgba(124,58,237,0.18),transparent_28%),radial-gradient(circle_at_72%_0%,rgba(30,64,175,0.16),transparent_30%),linear-gradient(180deg,rgba(3,7,18,0.28),rgba(3,7,18,0.66))]" />

      <main className="relative z-10 mx-auto max-w-[1280px] px-4 pb-8 pt-12 sm:px-6 lg:px-8">
        <header className="mb-8 grid gap-7 lg:grid-cols-[420px_1fr] lg:items-center">
          <div className="flex items-center gap-6">
            <div className="relative h-[132px] w-[132px] shrink-0 rounded-full">
              <button type="button" onClick={canEditAvatar ? () => setIsAvatarEditorOpen(true) : undefined} disabled={!canEditAvatar} className="group relative h-full w-full overflow-hidden rounded-full bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:cursor-default" aria-label={canEditAvatar ? "Modifier la photo de profil" : `Photo de profil de ${displayName}`}>
                <img src={avatarUrl} alt={`Photo de profil de ${displayName}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                {canEditAvatar ? <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#6d28d9] shadow-lg"><Pencil className="h-3.5 w-3.5" /></span> : null}
              </button>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[34px] font-black leading-tight text-white">{displayName}</h1>
                {canEditAvatar ? <Pencil className="h-4 w-4 text-slate-400" /> : null}
              </div>
              <div className="mt-2 flex items-center gap-2 text-[12px] font-medium text-slate-400"><Medal className="h-3.5 w-3.5" />Membre depuis mai 2026</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<Trophy className="h-5 w-5" />} value={String(playedGames)} label="Parties jouées" accent="#9b5cff" />
            <StatCard icon={<Target className="h-5 w-5" />} value={`${successRate}%`} label="Taux de réussite" accent="#38bdf8" />
            <StatCard icon={<Flame className="h-5 w-5" />} value="0" label="Séries max" accent="#22c55e" />
            <StatCard icon={<Star className="h-5 w-5" />} value="0" label="Quiz terminés" accent="#facc15" />
          </div>
        </header>

        <nav className="mb-4 flex gap-7 border-b border-white/[0.06] text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-400">
          {['Aperçu', 'Historique', 'Statistiques', 'Succès', 'Paramètres'].map((tab, index) => <button key={tab} className={`pb-3 ${index === 0 ? 'border-b-2 border-[#8b5cf6] text-white' : 'hover:text-white'}`}>{tab}</button>)}
        </nav>

        <div className="grid gap-3 lg:grid-cols-[1.15fr_1.9fr]">
          <SectionCard title="Niveau">
            <div className="flex flex-col items-center gap-3">
              <div className="grid h-16 w-16 place-items-center bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2072%2072%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M36%203L64.6%2019.5v33L36%2069%207.4%2052.5v-33L36%203z%22%20fill%3D%22%23172033%22%20stroke%3D%22%238b5cf6%22%20stroke-width%3D%222%22/%3E%3C/svg%3E')] bg-contain text-3xl font-black text-white">{xpProgress.level}</div>
              <div className="w-full"><div className="h-2 overflow-hidden rounded-full bg-slate-700/50"><div className="h-full bg-gradient-to-r from-[#7c3aed] to-[#a855f7]" style={{ width: `${xpProgress.progress * 100}%` }} /></div><p className="mt-2 text-[11px] font-semibold text-slate-400">{xpProgress.gained} / {xpProgress.needed} XP</p></div>
            </div>
          </SectionCard>

          <SectionCard title="Activité récente">
            <div className="flex min-h-[126px] flex-col items-center justify-center text-center"><div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-500/30 text-slate-200"><Clock3 className="h-6 w-6" /></div><p className="text-[12px] font-extrabold text-slate-300">Aucune activité pour le moment.</p><p className="mt-2 text-[11px] text-slate-400">Joue à des quiz pour voir ton historique ici !</p></div>
          </SectionCard>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.15fr_1fr_0.86fr]">
          <SectionCard title="Thèmes préférés">
            <div className="overflow-hidden rounded-lg border border-white/[0.04]">
              {favoriteThemes.map((theme, index) => <div key={theme.key} className="grid grid-cols-[54px_1fr_auto_auto] items-center gap-3 border-b border-white/[0.04] bg-[#131829] last:border-b-0"><div className="h-12" style={{ background: `linear-gradient(135deg, ${theme.color}, rgba(15,23,42,0.25))` }} /><span className="text-[12px] font-bold text-white">{theme.label}</span><span className="text-[11px] text-slate-400">{index === 0 && totalQuestions > 0 ? playedGames : 0} parties</span><span className="pr-3 text-[11px] font-bold text-slate-400">{theme.score}%</span></div>)}
            </div>
          </SectionCard>

          <SectionCard title="Difficulté des questions" className="min-h-[220px]">
            <div className="flex flex-1 items-center justify-center gap-7 py-2"><div className="relative h-32 w-32 rounded-full border border-[#7c3aed]/70"><div className="absolute inset-5 rounded-full border border-[#7c3aed]/70" /><div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,rgba(124,58,237,0.38),rgba(124,58,237,0.08),rgba(124,58,237,0.38))] opacity-50" /></div><div className="space-y-3">{['Facile', 'Modéré', 'Difficile', 'Extrême'].map((label, index) => <div key={label} className="grid grid-cols-[12px_72px_32px] items-center gap-2 text-[11px] font-bold text-slate-300"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ['#2dd4bf', '#facc15', '#fb7185', '#22c55e'][index] }} />{label}<span className="text-right text-slate-400">0%</span></div>)}</div></div>
          </SectionCard>

          <SectionCard title="Succès récents" className="min-h-[220px]">
            <div className="flex flex-1 flex-col items-center justify-center text-center"><div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-slate-500/30 text-slate-200"><Trophy className="h-6 w-6" /></div><p className="text-[12px] font-extrabold text-slate-300">Aucun succès pour le moment.</p><p className="mt-2 max-w-[190px] text-[11px] leading-5 text-slate-400">Relève des défis pour débloquer des succès !</p></div>
          </SectionCard>
        </div>
      </main>

      {isAvatarEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800/80 bg-slate-950 p-5 text-slate-100 shadow-[0_25px_60px_rgba(15,23,42,0.6)]">
            <h2 className="text-base font-semibold text-white">Mettre à jour la photo de profil</h2>
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
