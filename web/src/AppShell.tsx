// web/src/AppShell.tsx
import React, { useEffect, useState, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import logoUrl from "@/assets/synapz.png";
import bitIconUrl from "@/assets/bit.png";
import starUrl from "@/assets/star.png";
import keyIconUrl from "@/assets/key_icon.png";
import addIconUrl from "@/assets/add_icon.png";
import addActiveIconUrl from "@/assets/add_active_icon.png";
import calendarIconUrl from "@/assets/calendar_icon.png";
import multiplayerIconUrl from "@/assets/multiplayer_icon.png";
import { getLevelProgress } from "@/utils/experience";
import JoinLoadingScreen from "@/components/JoinLoadingScreen";
import { AUTH_UPDATED_EVENT } from "@/auth/events";

type CurrentUser = {
  displayName?: string;
  img?: string | null;
  bits?: number;
  experience?: number;
  guest?: boolean;
};

const PROFILE_AVATAR_UPDATED_EVENT = "profile-avatar-updated";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");

/* ---------- petites cartes verticales pour les menus principaux ---------- */
type MenuItem = {
  to: string;
  title: string;
  desc: string;
  icon?: React.ReactNode;
};

function MenuCard({ to, title, desc, icon = "★" }: MenuItem) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        borderRadius: 6,
        padding: 8,
        border: "none",
        background: "transparent",
        color: "inherit",
        textDecoration: "none",
        position: "relative",
        overflow: "hidden", // ✅ l’overlay respecte l’arrondi
        transition: "transform .15s ease",
      }}
      onMouseEnter={(e) => {
        const titleEl = e.currentTarget.querySelector<HTMLElement>(
          "[data-menu-title]"
        );
        if (titleEl) titleEl.style.color = "#ffffff";

        const overlay = e.currentTarget.querySelector<HTMLElement>(
          "[data-hover-overlay]"
        );
        if (overlay) overlay.style.opacity = "0.10"; // ✅ layer +10% plus clair
      }}
      onMouseLeave={(e) => {
        const titleEl = e.currentTarget.querySelector<HTMLElement>(
          "[data-menu-title]"
        );
        if (titleEl) titleEl.style.color = "#e2e8f0";

        const overlay = e.currentTarget.querySelector<HTMLElement>(
          "[data-hover-overlay]"
        );
        if (overlay) overlay.style.opacity = "0";
      }}
    >
      {/* ✅ overlay hover (layer) */}
      <span
        data-hover-overlay
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "#ffffff",
          opacity: 0,
          transition: "opacity .15s ease",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          position: "relative", // ✅ au-dessus de l’overlay
        }}
      >
        {/* ✅ icône: pas de carré de fond, juste l'image / icône */}
        <div
          style={{
            width: 28,
            height: 28,
            display: "grid",
            placeItems: "center",
            background: "transparent",
            flexShrink: 0,
          }}
        >
          <span aria-hidden>{icon}</span>
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            data-menu-title
            style={{
              fontWeight: 700,
              lineHeight: 1.1,
              fontSize: 12,
              color: "#e2e8f0",
              transition: "color .15s ease",
            }}
          >
            {title}
          </div>
          <div style={{ opacity: 0.7, fontSize: 10 }}>{desc}</div>
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
    padding: "9px 12px",
    borderRadius: 6,
    textDecoration: "none",
    fontFamily: "inherit",
    fontWeight: 600,
    fontSize: 14,
    color: danger ? "#ef4444" : "#e5e7eb",
    lineHeight: 1.2,
  };
  const hoverBg = "rgba(255,255,255,.1)";

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
            borderRadius: 6,
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
            borderRadius: 6,
            padding: 0,
          }}
        >
          {content}
        </button>
      )}
      {divider && (
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,.08)",
            margin: "6px 0",
          }}
        />
      )}
    </>
  );
}

export default function AppShell() {
  const nav = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayBits, setDisplayBits] = useState(0);
  const displayBitsRef = useRef(0);
  const [showJoinLoading, setShowJoinLoading] = useState(false);
  const [displayExperience, setDisplayExperience] = useState(0);
  const displayExperienceRef = useRef(0);
  const isRoomRoute = location.pathname.startsWith("/room/");
  const joinLoadingPending =
    showJoinLoading ||
    (typeof window !== "undefined" && sessionStorage.getItem("join-loading") === "1");
  const shouldHideRoomContent = joinLoadingPending && isRoomRoute;
  const isGuest = !user || Boolean(user?.guest);

  useEffect(() => {
    const hasJoinLoading = sessionStorage.getItem("join-loading") === "1";
    if (!hasJoinLoading && !showJoinLoading) return;
    if (hasJoinLoading) {
      sessionStorage.removeItem("join-loading");
    }
    setShowJoinLoading(true);

    const hideTimer = window.setTimeout(() => {
      setShowJoinLoading(false);
    }, 5000);

    return () => {
      window.clearTimeout(hideTimer);
    };
  }, [location.key]);

  const animationRef = useRef<number | null>(null);
  const experienceAnimationRef = useRef<number | null>(null);

  const [openMenu, setOpenMenu] = useState<null | "solo" | "multi" | "private">(
    null
  );
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement | null>(null);

  // ✅ hover icône "Créer un salon privé"
  const [isAddHover, setIsAddHover] = useState(false);

  // ✅ ref du header pour éviter fermeture quand on se déplace vers le dropdown
  const headerRef = useRef<HTMLElement | null>(null);

  // ✅ XP burst (remplissage progressif au rythme des étoiles)
  const xpBurstQueueRef = useRef<number[]>([]);
  const xpBurstRafRef = useRef<number | null>(null);
  const xpBurstActiveRef = useRef(false);
  const xpPendingUserExperienceRef = useRef<number | null>(null);

  const navItemStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "0 10px",
    height: "100%",
    borderRadius: 0, // ✅ aucun arrondi
    border: "none",
    background: "transparent",
    color: "#cbd5e1",
    fontFamily: '"Segoe UI", "Inter", system-ui, sans-serif',
    fontWeight: 600,
    fontSize: 13,
    lineHeight: 1.1,
    cursor: "pointer",
    transition: "background .15s ease",
  };

  // ✅ hover "persistant" tant que le menu est affiché
  const navHoverBg = "rgba(255,255,255,.08)";
  const navItemStyleActive: React.CSSProperties = {
    ...navItemStyle,
    background: navHoverBg,
    color: "#ffffff", // ✅ texte blanc
  };

  // ✅ chevron blanc aussi quand actif (on enlève l'opacité)
  const chevronStyle: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 1,
  };
  const chevronStyleActive: React.CSSProperties = {
    ...chevronStyle,
    opacity: 1,
  };

  const refreshUser = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        credentials: "include",
      });
      const { user } = (res.ok
        ? await res.json()
        : { user: null }) as { user: CurrentUser | null };
      setUser(user ?? null);
      setDisplayBits(user?.bits ?? 0);
      setDisplayExperience(user?.experience ?? 0);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const handler = () => {
      void refreshUser();
    };
    window.addEventListener(AUTH_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener(AUTH_UPDATED_EVENT, handler);
    };
  }, [refreshUser]);


  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ img?: string | null }>;
      const nextImg = customEvent.detail?.img;
      if (!nextImg) return;
      setUser((prev) => (prev ? { ...prev, img: nextImg } : prev));
    };
    window.addEventListener(PROFILE_AVATAR_UPDATED_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(PROFILE_AVATAR_UPDATED_EVENT, handler as EventListener);
    };
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

  // ✅ helper: anime un incrément XP (utilisé par burst + fallback vers total)
  const animateExperienceTo = (end: number, duration: number) => {
    const start = displayExperienceRef.current;
    if (start === end) return;

    if (experienceAnimationRef.current !== null) {
      cancelAnimationFrame(experienceAnimationRef.current);
      experienceAnimationRef.current = null;
    }

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
  };

  // ✅ XP "normal" (quand on reçoit user.experience) — mais on le met en attente si un burst est en cours
  useEffect(() => {
    if (typeof user?.experience !== "number") return;

    if (xpBurstActiveRef.current) {
      xpPendingUserExperienceRef.current = user.experience;
      return;
    }

    animateExperienceTo(user.experience, 900);

    return () => {
      if (experienceAnimationRef.current !== null) {
        cancelAnimationFrame(experienceAnimationRef.current);
        experienceAnimationRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.experience]);

  useEffect(() => {
    const onBitsUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ total?: number }>;
      const total = custom.detail?.total;
      if (!Number.isFinite(total)) return;
      setUser((prev) => (prev ? { ...prev, bits: total } : prev));
    };
    window.addEventListener("bits-updated", onBitsUpdated as EventListener);
    return () =>
      window.removeEventListener("bits-updated", onBitsUpdated as EventListener);
  }, []);

  useEffect(() => {
    const onExperienceUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ total?: number }>;
      const total = custom.detail?.total;
      if (!Number.isFinite(total)) return;
      setUser((prev) => (prev ? { ...prev, experience: total } : prev));
    };
    window.addEventListener(
      "experience-updated",
      onExperienceUpdated as EventListener
    );
    return () =>
      window.removeEventListener(
        "experience-updated",
        onExperienceUpdated as EventListener
      );
  }, []);

  // ✅ écoute les ticks burst envoyés par RoomPage:
  // - experience-burst-step : +10 à chaque étoile (remplit progressivement)
  // - experience-burst-end  : ajoute le résiduel à la fin
  useEffect(() => {
    const stopBurstRaf = () => {
      if (xpBurstRafRef.current !== null) {
        cancelAnimationFrame(xpBurstRafRef.current);
        xpBurstRafRef.current = null;
      }
    };

    const drainQueue = () => {
      if (xpBurstActiveRef.current) return;
      if (!xpBurstQueueRef.current.length) return;

      xpBurstActiveRef.current = true;

      const playNext = () => {
        const delta = xpBurstQueueRef.current.shift();
        if (!Number.isFinite(delta) || (delta ?? 0) <= 0) {
          // skip invalid
          if (xpBurstQueueRef.current.length) return playNext();
        }

        const current = displayExperienceRef.current;
        const nextValue = current + Math.max(0, Number(delta ?? 0));

        // ✅ chaque étoile remplit sa part (petite anim, lisible)
        animateExperienceTo(nextValue, 220);

        // on attend la fin approx de l'anim, puis on enchaine
        const start = performance.now();
        const wait = (t: number) => {
          if (t - start >= 220) {
            if (xpBurstQueueRef.current.length) {
              xpBurstRafRef.current = requestAnimationFrame(() => playNext());
              return;
            }

            // fini
            xpBurstActiveRef.current = false;
            xpBurstRafRef.current = null;

            // si on avait reçu le total serveur pendant le burst, on s'aligne maintenant
            const pendingTotal = xpPendingUserExperienceRef.current;
            xpPendingUserExperienceRef.current = null;

            if (Number.isFinite(pendingTotal)) {
              animateExperienceTo(Number(pendingTotal), 450);
            }

            return;
          }
          xpBurstRafRef.current = requestAnimationFrame(wait);
        };

        stopBurstRaf();
        xpBurstRafRef.current = requestAnimationFrame(wait);
      };

      playNext();
    };

    const onBurstStep = (event: Event) => {
      const custom = event as CustomEvent<{ delta?: number }>;
      const delta = custom.detail?.delta;
      if (!Number.isFinite(delta) || (delta ?? 0) <= 0) return;

      xpBurstQueueRef.current.push(Number(delta));
      drainQueue();
    };

    const onBurstEnd = (event: Event) => {
      const custom = event as CustomEvent<{ residual?: number }>;
      const residual = custom.detail?.residual;
      if (!Number.isFinite(residual) || (residual ?? 0) <= 0) return;

      xpBurstQueueRef.current.push(Number(residual));
      drainQueue();
    };

    window.addEventListener("experience-burst-step", onBurstStep as EventListener);
    window.addEventListener("experience-burst-end", onBurstEnd as EventListener);

    return () => {
      window.removeEventListener(
        "experience-burst-step",
        onBurstStep as EventListener
      );
      window.removeEventListener(
        "experience-burst-end",
        onBurstEnd as EventListener
      );

      if (experienceAnimationRef.current !== null) {
        cancelAnimationFrame(experienceAnimationRef.current);
        experienceAnimationRef.current = null;
      }
      if (xpBurstRafRef.current !== null) {
        cancelAnimationFrame(xpBurstRafRef.current);
        xpBurstRafRef.current = null;
      }
      xpBurstQueueRef.current = [];
      xpBurstActiveRef.current = false;
      xpPendingUserExperienceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    setUser(null);
    setDisplayBits(0);
    setDisplayExperience(0);
    nav("/login", { replace: true });
  }

  // menus
  const soloItems: MenuItem[] = [
    {
      to: "/solo/daily",
      title: "Défi du jour",
      desc: "Un challenge unique chaque jour.",
      icon: (
        <img
          src={calendarIconUrl}
          alt=""
          aria-hidden
          style={{
            width: 28,
            height: 28,
            display: "block",
            objectFit: "contain",
          }}
        />
      ),
    },
  ];

  const multiItems: MenuItem[] = [
    {
      to: "/multi/public",
      title: "Salon public",
      desc: "Rejoignez des parties ouvertes.",
      icon: (
        <img
          src={multiplayerIconUrl}
          alt=""
          aria-hidden
          style={{
            width: 28,
            height: 28,
            display: "block",
            objectFit: "contain",
          }}
        />
      ),
    },
  ];

  const privateItems: MenuItem[] = [
    {
      to: "/rooms/new",
      title: "Créer un salon privé",
      desc: "Créez un salon et invitez vos amis.",
      icon: (
        <img
          src={isAddHover ? addActiveIconUrl : addIconUrl}
          alt=""
          aria-hidden
          style={{
            width: 28,
            height: 28,
            display: "block",
            objectFit: "contain",
          }}
        />
      ),
    },
    {
      to: "/private/join",
      title: "Rejoindre un salon privé",
      desc: "Entrez un code pour rejoindre.",
      icon: (
        <img
          src={keyIconUrl}
          alt=""
          aria-hidden
          style={{
            width: 28,
            height: 28,
            display: "block",
            objectFit: "contain",
          }}
        />
      ),
    },
  ];

  const avatarUrl = user?.img || "/img/profiles/0.avif";
  const xpValue = displayExperience;
  const xpProgress = getLevelProgress(xpValue);

  // ↓ hauteur réduite
  const HEADER_H = 52;

  return (
    <div>
      {/* ---- Top bar ---- */}
      <header
        ref={headerRef}
        onMouseLeave={(e) => {
          const next = e.relatedTarget;
          if (next instanceof Node && headerRef.current?.contains(next)) return;
          setOpenMenu(null);
        }}
        style={{
          position: "fixed",
          insetInline: 0,
          top: 0,
          height: HEADER_H,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 16px",
          background: "#212539",
          zIndex: 60,
          color: "#e5e7eb",
          boxShadow: "0 10px 30px rgba(0,0,0,.55)",
          borderBottom: "1px solid rgba(255,255,255,.06)",
        }}
      >
        {/* Left: logo → renvoie à la home */}
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src={logoUrl}
            alt="Synapz"
            style={{
              display: "block",
              cursor: "pointer",
              height: 28,
              width: "auto",
            }}
          />
        </Link>

        {/* Center: nav (sans le bouton Accueil) */}
        <nav
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 8,
            marginLeft: 16,
            position: "relative",
            height: "100%",
          }}
        >
          {/* SOLO */}
          <div
            onMouseEnter={() => setOpenMenu("solo")}
            onFocus={() => setOpenMenu("solo")}
            style={{ position: "relative" }}
          >
            <button
              style={openMenu === "solo" ? navItemStyleActive : navItemStyle}
            >
              <span>Solo</span>
              <span
                aria-hidden
                style={openMenu === "solo" ? chevronStyleActive : chevronStyle}
              >
                ▾
              </span>
            </button>

            {openMenu === "solo" && (
              <div
                onMouseEnter={() => setOpenMenu("solo")}
                style={{
                  position: "absolute",
                  left: 0,
                  top: "100%",
                  width: 320,
                  padding: 12,
                  borderRadius: 8,
                  background: "#13141F",
                  border: "1px solid rgba(255,255,255,.12)",
                  boxShadow: "0 20px 60px rgba(0,0,0,.35)",
                  zIndex: 70,
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: -8,
                    height: 8,
                    background: "transparent",
                  }}
                />

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {soloItems.map((it) => (
                    <MenuCard key={it.to} {...it} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* MULTI */}
          <div
            onMouseEnter={() => setOpenMenu("multi")}
            onFocus={() => setOpenMenu("multi")}
            style={{ position: "relative" }}
          >
            <button
              style={openMenu === "multi" ? navItemStyleActive : navItemStyle}
            >
              <span>Multijoueur</span>
              <span
                aria-hidden
                style={openMenu === "multi" ? chevronStyleActive : chevronStyle}
              >
                ▾
              </span>
            </button>

            {openMenu === "multi" && (
              <div
                onMouseEnter={() => setOpenMenu("multi")}
                style={{
                  position: "absolute",
                  left: 0,
                  top: "100%",
                  width: 320,
                  padding: 12,
                  borderRadius: 8,
                  background: "#13141F",
                  border: "1px solid rgba(255,255,255,.12)",
                  boxShadow: "0 20px 60px rgba(0,0,0,.35)",
                  zIndex: 70,
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: -8,
                    height: 8,
                    background: "transparent",
                  }}
                />

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {multiItems.map((it) => (
                    <MenuCard key={it.to} {...it} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SALON PRIVÉ */}
          <div
            onMouseEnter={() => setOpenMenu("private")}
            onFocus={() => setOpenMenu("private")}
            style={{ position: "relative" }}
          >
            <button
              style={openMenu === "private" ? navItemStyleActive : navItemStyle}
            >
              <span>Salon privé</span>
              <span
                aria-hidden
                style={
                  openMenu === "private" ? chevronStyleActive : chevronStyle
                }
              >
                ▾
              </span>
            </button>

            {openMenu === "private" && (
              <div
                onMouseEnter={() => setOpenMenu("private")}
                style={{
                  position: "absolute",
                  left: 0,
                  top: "100%",
                  width: 320,
                  padding: 12,
                  borderRadius: 8,
                  background: "#13141F",
                  border: "1px solid rgba(255,255,255,.12)",
                  boxShadow: "0 20px 60px rgba(0,0,0,.35)",
                  zIndex: 70,
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: -8,
                    height: 8,
                    background: "transparent",
                  }}
                />

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {privateItems.map((it) => (
                    <div
                      key={it.to}
                      onMouseEnter={() => {
                        if (it.to === "/rooms/new") setIsAddHover(true);
                      }}
                      onMouseLeave={() => {
                        if (it.to === "/rooms/new") setIsAddHover(false);
                      }}
                    >
                      <MenuCard {...it} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Right: user */}
        <div
          ref={userRef}
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 20,
            position: "relative",
            height: "100%",
          }}
        >
          {isGuest ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Link
                to="/register"
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: "#ffffff",
                  color: "#151a22",
                  fontWeight: 700,
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                S'inscrire
              </Link>
              <Link
                to="/login"
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,.4)",
                  color: "#e2e8f0",
                  fontWeight: 700,
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                Se connecter
              </Link>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* ✅ CIBLE XP : on met data-xp-target sur le wrapper + sur l'image (fiable) */}
                <div
                  aria-label={`Niveau ${xpProgress.level}`}
                  data-xp-target="nav-xp"
                  style={{
                    width: 30,
                    height: 30,
                    position: "relative",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    filter: "drop-shadow(0 2px 6px rgba(0,0,0,.45))",
                  }}
                >
                  <img
                    src={starUrl}
                    alt=""
                    aria-hidden
                    data-xp-target="nav-xp"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      display: "block",
                      objectFit: "contain",
                      userSelect: "none",
                      pointerEvents: "none",
                    }}
                  />
                  <span
                    style={{
                      position: "relative",
                      zIndex: 1,
                      fontWeight: 700,
                      fontSize: 11,
                      lineHeight: 1,
                      color: "#ffffff",
                      textShadow: "0 1px 0 rgba(0,0,0,.55)",
                    }}
                  >
                    {xpProgress.level}
                  </span>
                </div>
                <div
                  style={{
                    minWidth: 100,
                    padding: "3px 5px",
                    borderRadius: 10,
                    background:
                      "linear-gradient(180deg,rgba(15,23,42,.9),rgba(8,10,20,.9))",
                    border: "1px solid rgba(255,255,255,.12)",
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.35)",
                  }}
                >
                  <div
                    aria-label={`Progression ${xpProgress.gained} sur ${
                      xpProgress.needed || xpProgress.gained
                    } xp`}
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
                        transition: "width 120ms linear",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#e2e8f0",
                        textShadow: "0 1px 2px rgba(0,0,0,.7)",
                      }}
                    >
                      {xpProgress.needed > 0
                        ? `${xpProgress.gained}/${xpProgress.needed}`
                        : "MAX"}
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  fontWeight: 700,
                  fontSize: 13,
                  color: "#e5e7eb",
                }}
              >
                <span>{displayBits}</span>
                <img
                  src={bitIconUrl}
                  alt="Bits"
                  width={20}
                  height={20}
                  style={{ display: "block" }}
                />
              </div>

              {!loading && (
                <button
                  onClick={() => setUserOpen((v) => !v)}
                  title={user?.displayName || "Utilisateur"}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "6px 10px",
                    border: "none",
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
                      borderRadius: 6,
                      overflow: "hidden",
                      display: "block",
                      background: "#0f172a",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={avatarUrl}
                      alt={`Photo de profil de ${user?.displayName ?? "Utilisateur"}`}
                      onError={(e) => {
                        e.currentTarget.src = "/img/profiles/0.avif";
                      }}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </span>

                  <span
                    style={{
                      maxWidth: 140,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      lineHeight: 1.2,
                      paddingBottom: 2,
                      marginTop: 2,
                    }}
                  >
                    {user?.displayName ?? "Utilisateur"}
                  </span>

                  <span
                    aria-hidden
                    style={{
                      fontSize: 14,
                      opacity: 0.7,
                      lineHeight: 1,
                      marginTop: 4,
                      flexShrink: 0,
                    }}
                  >
                    ▾
                  </span>
                </button>
              )}

              {userOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "100%",
                    width: "fit-content",
                    minWidth: 220,
                    maxWidth: 360,
                    borderRadius: 8,
                    background: "#13141F",
                    border: "1px solid rgba(255,255,255,.12)",
                    boxShadow: "0 20px 60px rgba(0,0,0,.35)",
                    padding: 12,
                    zIndex: 80,
                    marginTop: 8,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: -8,
                      height: 8,
                      background: "transparent",
                    }}
                  />
                  <UserMenuItem to="/me/profile" label="Profil" />
                  <UserMenuItem to="/me/history" label="Historique" />
                  <UserMenuItem to="/me/achievements" label="Succès" divider />
                  <UserMenuItem to="/settings" label="Paramètres" />
                  <UserMenuItem to="/help" label="Assistance" />
                  <UserMenuItem to="/account" label="Compte" divider />
                  <UserMenuItem label="Se déconnecter" danger onClick={logout} />
                </div>
              )}
            </>
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
      {joinLoadingPending && <JoinLoadingScreen offsetTop={HEADER_H} />}
    </div>
  );
}
