// web/src/AppShell.tsx
import { useEffect, useState, useRef } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import logoUrl from "@/assets/synapz.png";
import bitIconUrl from "@/assets/bit.png";
import { getLevelProgress } from "@/utils/experience";

type CurrentUser = {
  displayName?: string;
  img?: string | null;
  bits?: number;
  experience?: number;
};

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");

/* ---------- petites cartes verticales pour les menus principaux ---------- */
type MenuItem = { to: string; title: string; desc: string; icon?: string };

function MenuCard({ to, title, desc, icon = "★" }: MenuItem) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        borderRadius: 16, 
        padding: 12,
        border: "1px solid rgba(255,255,255,.08)",
        background: "rgba(255,255,255,.05)",
        color: "inherit",
        textDecoration: "none",
        transition: "background .15s ease, transform .15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,.10)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,.05)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg,#6366f1,#06b6d4)",
            color: "#fff",
            fontWeight: 800,
          }}
        >
          <span aria-hidden>{icon}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
          <div style={{ opacity: 0.8, fontSize: 12 }}>{desc}</div>
        </div>
      </div>
    </Link>
  );
}

/* ---------- ligne de menu utilisateur ---------- */
function UserMenuItem({
  to,
  label,
  onClick,
  danger = false,
  divider = false,
}: {
  to?: string;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  divider?: boolean;
}) {
  const itemFont = "Segoe UI, Roboto, Helvetica, Arial, sans-serif";

  const base: React.CSSProperties = {
    display: "block",
    padding: "10px 12px",
    borderRadius: 10,
    textDecoration: "none",
    fontFamily: itemFont,
    fontWeight: 600,
    fontSize: 14,
    color: danger ? "#ef4444" : "#e5e7eb",
    lineHeight: 1.2,
  };
  const hoverBg = "rgba(255,255,255,.06)";

  const content = (
    <span
      style={base}
      onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </span>
  );

  return (
    <>
      {to ? (
        <Link
          to={to}
          onClick={onClick}
          style={{
            display: "block",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            background: "transparent",
            border: "none",
            borderRadius: 10,
            padding: 0,
          }}
        >
          {content}
        </button>
      )}
      {divider && <div style={{ height: 1, background: "rgba(255,255,255,.08)", margin: "6px 0" }} />}
    </>
  );
}

export default function AppShell() {
  const nav = useNavigate();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayBits, setDisplayBits] = useState(0);
  const displayBitsRef = useRef(0);
  const [displayExperience, setDisplayExperience] = useState(0);
  const displayExperienceRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const experienceAnimationRef = useRef<number | null>(null);

  const [openMenu, setOpenMenu] = useState<null | "solo" | "multi" | "private">(null);
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        const { user } = (res.ok ? await res.json() : { user: null }) as { user: CurrentUser | null };
        if (mounted) {
          setUser(user ?? null);
          setDisplayBits(user?.bits ?? 0);
          setDisplayExperience(user?.experience ?? 0);
        }
      } catch {
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    displayBitsRef.current = displayBits;
  }, [displayBits]);

  useEffect(() => {
    displayExperienceRef.current = displayExperience;
  }, [displayExperience]);

  useEffect(() => {
    if (typeof user?.bits !== "number") return;
    const start = displayBitsRef.current;
    const end = user.bits;
    if (start === end) return;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    const duration = 700;
    const startTime = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(start + (end - start) * eased);
      setDisplayBits(value);
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [user?.bits]);

  useEffect(() => {
    if (typeof user?.experience !== "number") return;
    const start = displayExperienceRef.current;
    const end = user.experience;
    if (start === end) return;
    if (experienceAnimationRef.current !== null) {
      cancelAnimationFrame(experienceAnimationRef.current);
      experienceAnimationRef.current = null;
    }
    const duration = 900;
    const startTime = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(start + (end - start) * eased);
      setDisplayExperience(value);
      if (progress < 1) {
        experienceAnimationRef.current = requestAnimationFrame(tick);
      } else {
        experienceAnimationRef.current = null;
      }
    };

    experienceAnimationRef.current = requestAnimationFrame(tick);
    return () => {
      if (experienceAnimationRef.current !== null) {
        cancelAnimationFrame(experienceAnimationRef.current);
        experienceAnimationRef.current = null;
      }
    };
  }, [user?.experience]);

  useEffect(() => {
    const onBitsUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ total?: number }>;
      const total = custom.detail?.total;
      if (!Number.isFinite(total)) return;
      setUser((prev) => (prev ? { ...prev, bits: total } : prev));
    };
    window.addEventListener("bits-updated", onBitsUpdated as EventListener);
    return () => window.removeEventListener("bits-updated", onBitsUpdated as EventListener);
  }, []);

  useEffect(() => {
    const onExperienceUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ total?: number }>;
      const total = custom.detail?.total;
      if (!Number.isFinite(total)) return;
      setUser((prev) => (prev ? { ...prev, experience: total } : prev));
    };
    window.addEventListener("experience-updated", onExperienceUpdated as EventListener);
    return () => window.removeEventListener("experience-updated", onExperienceUpdated as EventListener);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!userRef.current) return;
      if (!userRef.current.contains(e.target as Node)) setUserOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  async function logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {}
    nav("/login", { replace: true });
  }

  // menus
  const soloItems: MenuItem[] = [
    { to: "/solo/campagne",         title: "Campagne",         desc: "Progressez chapitre après chapitre.", icon: "📖" },
    { to: "/solo/daily",            title: "Défi du jour",     desc: "Un challenge unique chaque jour.",    icon: "📆" },
    { to: "/solo/quiz-thematiques", title: "Quiz thématiques", desc: "Choisissez un thème et enchaînez.",   icon: "🧠" },
  ];
  const multiItems: MenuItem[] = [
    { to: "/multi/race",   title: "Course",       desc: "Sprint chronométré et classements.", icon: "🏁" },
    { to: "/multi/duel",   title: "Duel",         desc: "Affrontez un joueur en 1v1.",       icon: "⚔️" },
    { to: "/multi/equipe", title: "Par équipe",   desc: "Formez une équipe et coopérez.",    icon: "👥" },
    { to: "/multi/public", title: "Salon public", desc: "Rejoignez des parties ouvertes.",   icon: "🏟️" },
    { to: "/multi/event",  title: "Évènement",    desc: "Modes spéciaux et compétitions.",   icon: "🏆" },
  ];
  const privateItems: MenuItem[] = [
    { to: "/rooms/new",    title: "Créer un salon privé",     desc: "Créez un salon et invitez vos amis.", icon: "➕" },
    { to: "/private/join", title: "Rejoindre un salon privé", desc: "Entrez un code pour rejoindre.",      icon: "🔑" },
  ];

  const avatarUrl = user?.img || "/img/profiles/0.avif";
  const xpValue = displayExperience;
  const xpProgress = getLevelProgress(xpValue);


  const HEADER_H = 64;

  return (
    <div>
      {/* ---- Top bar ---- */}
      <header
        onMouseLeave={() => setOpenMenu(null)}
        style={{
          position: "fixed",
          insetInline: 0,
          top: 0,
          height: HEADER_H,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 16px",
          // ——— Nouveau background navbar ———
          // sobriété + profondeur, cohérent avec tes violets/indigos
          background:
            "radial-gradient(900px 160px at 50% -60px, rgba(255,255,255,.07), transparent 70%)," +
            "linear-gradient(180deg, rgba(10,12,24,.88) 0%, rgba(9,11,22,.92) 60%, rgba(8,10,20,.95) 100%)",
          borderBottom: "1px solid rgba(255,255,255,.10)",
          // effet “glass” doux (supporté moderne, inoffensif sinon)
          backdropFilter: "saturate(140%) blur(6px)",
          WebkitBackdropFilter: "saturate(140%) blur(6px)",
          zIndex: 60,
          color: "#e5e7eb",
        }}
      >
        {/* Left: logo → renvoie à la home */}
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src={logoUrl}
            alt="Synapz"
            width={160}
            height={160}
            style={{ display: "block", cursor: "pointer" }}
          />
        </Link>

        {/* Center: nav (sans le bouton Accueil) */}
        <nav style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16, position: "relative" }}>
          {/* SOLO */}
          <div onMouseEnter={() => setOpenMenu("solo")} onFocus={() => setOpenMenu("solo")} style={{ position: "relative" }}>
            <button
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: "#cbd5e1",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Solo
            </button>
            {openMenu === "solo" && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "calc(100% + 8px)",
                  width: 380,
                  padding: 12,
                  borderRadius: 24,
                  background: "linear-gradient(180deg,rgba(15,23,42,.95),rgba(17,24,39,.95))",
                  border: "1px solid rgba(255,255,255,.08)",
                  boxShadow: "0 20px 60px rgba(0,0,0,.35)",
                  zIndex: 70,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {soloItems.map((it) => <MenuCard key={it.to} {...it} />)}
                </div>
              </div>
            )}
          </div>

          {/* MULTI */}
          <div onMouseEnter={() => setOpenMenu("multi")} onFocus={() => setOpenMenu("multi")} style={{ position: "relative" }}>
            <button
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: "#cbd5e1",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Multijoueur
            </button>
            {openMenu === "multi" && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "calc(100% + 8px)",
                  width: 380,
                  padding: 12,
                  borderRadius: 24,
                  background: "linear-gradient(180deg,rgba(15,23,42,.95),rgba(17,24,39,.95))",
                  border: "1px solid rgba(255,255,255,.08)",
                  boxShadow: "0 20px 60px rgba(0,0,0,.35)",
                  zIndex: 70,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {multiItems.map((it) => <MenuCard key={it.to} {...it} />)}
                </div>
              </div>
            )}
          </div>

          {/* SALON PRIVÉ */}
          <div onMouseEnter={() => setOpenMenu("private")} onFocus={() => setOpenMenu("private")} style={{ position: "relative" }}>
            <button
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: "#cbd5e1",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Salon privé
            </button>
            {openMenu === "private" && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "calc(100% + 8px)",
                  width: 380,
                  padding: 12,
                  borderRadius: 24,
                  background: "linear-gradient(180deg,rgba(15,23,42,.95),rgba(17,24,39,.95))",
                  border: "1px solid rgba(255,255,255,.08)",
                  boxShadow: "0 20px 60px rgba(0,0,0,.35)",
                  zIndex: 70,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {privateItems.map((it) => <MenuCard key={it.to} {...it} />)}
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Right: user */}
        <div ref={userRef} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 20, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              aria-label={`Niveau ${xpProgress.level}`}
              style={{
                width: 34,
                height: 30,
                display: "grid",
                placeItems: "center",
                fontWeight: 900,
                color: "#0f172a",
                textShadow: "0 1px 0 rgba(255,255,255,.5)",
                background: "linear-gradient(180deg,#7dd3fc,#38bdf8)",
                border: "2px solid #0ea5e9",
                boxShadow: "0 2px 6px rgba(0,0,0,.4)",
                clipPath:
                  "polygon(0% 25%, 12% 25%, 12% 0%, 88% 0%, 88% 25%, 100% 25%, 100% 75%, 88% 75%, 88% 100%, 12% 100%, 12% 75%, 0% 75%)",
              }}
            >
              {xpProgress.level}
            </div>
            <div
              style={{
                minWidth: 120,
                padding: "4px 6px",
                borderRadius: 10,
                background: "linear-gradient(180deg,rgba(15,23,42,.9),rgba(8,10,20,.9))",
                border: "1px solid rgba(255,255,255,.12)",
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,.35)",
              }}
            >
              <div
                aria-label={`Progression ${xpProgress.gained} sur ${xpProgress.needed || xpProgress.gained} xp`}
                style={{
                  position: "relative",
                  height: 14,
                  borderRadius: 8,
                  background: "linear-gradient(180deg,#0b1224,#0a0f1f)",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,.08)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${xpProgress.progress * 100}%`,
                    background: "linear-gradient(90deg,#38bdf8,#22d3ee)",
                    boxShadow: "inset 0 0 6px rgba(255,255,255,.25)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#e2e8f0",
                    textShadow: "0 1px 2px rgba(0,0,0,.7)",
                  }}
                >
                  {xpProgress.needed > 0 ? `${xpProgress.gained}/${xpProgress.needed}` : "MAX"}
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 800, color: "#e5e7eb" }}>
            <span>{displayBits}</span>
            <img src={bitIconUrl} alt="Bits" width={25} height={25} style={{ display: "block" }} />
          </div>
          {!loading && (
            <button
              onClick={() => setUserOpen((v) => !v)}
              title={user?.displayName || "Utilisateur"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.12)",
                background: "transparent",
                color: "#e5e7eb",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,.14)",
                  overflow: "hidden",
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(135deg,#0f172a,#1e293b)",
                }}
              >
                <img
                  src={avatarUrl}
                  alt={`Photo de profil de ${user?.displayName ?? "Utilisateur"}`}
                  onError={(e) => {
                    e.currentTarget.src = "/img/profiles/0.avif";
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </span>
              <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.displayName ?? "Utilisateur"}
              </span>
              <span aria-hidden style={{ opacity: 0.8 }}>▾</span>
            </button>
          )}

          {userOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 8px)",
                width: "fit-content",
                minWidth: 220,
                maxWidth: 360,
                borderRadius: 18,
                background: "linear-gradient(180deg,rgba(15,23,42,.98),rgba(17,24,39,.98))",
                border: "1px solid rgba(255,255,255,.08)",
                boxShadow: "0 20px 60px rgba(0,0,0,.45)",
                padding: 10,
                zIndex: 80,
              }}
            >
              <UserMenuItem to="/me/profile"      label="Profil" />
              <UserMenuItem to="/me/history"      label="Historique" />
              <UserMenuItem to="/me/achievements" label="Succès" divider />
              <UserMenuItem to="/settings"        label="Paramètres" />
              <UserMenuItem to="/help"            label="Assistance" />
              <UserMenuItem to="/account"         label="Compte" divider />
              <UserMenuItem                       label="Se déconnecter" danger onClick={logout} />
            </div>
          )}
        </div>
      </header>

      {/* ---- Page content ---- */}
      <main
        style={{
          flex: 1,
          paddingTop: HEADER_H,
          minHeight: `calc(100dvh - ${HEADER_H}px)`,
          width: "100%",
          boxSizing: "border-box",
          margin: "0 auto",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
