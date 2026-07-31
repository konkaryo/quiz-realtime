// web/src/AppShell.tsx
import React, { useEffect, useState, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import logoUrl from "@/assets/synapz.png";
import bellUrl from "@/assets/bell.png";
import bitIconUrl from "@/assets/bit.png";
import keyIconUrl from "@/assets/key_icon.png";
import lockIconUrl from "@/assets/lock.png";
import calendarIconUrl from "@/assets/calendar_icon.png";
import cardsIconUrl from "@/assets/cards.png";
import rankingIconUrl from "@/assets/ranking.png";
import { getLevelProgress } from "@/utils/experience";
import JoinLoadingScreen from "@/components/JoinLoadingScreen";
import { AUTH_UPDATED_EVENT } from "@/auth/events";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import SideNavigation from "@/components/SideNavigation";

type CurrentUser = {
  displayName?: string;
  img?: string | null;
  bits?: number;
  experience?: number;
  guest?: boolean;
  role?: "USER" | "ADMIN" | string;
  playerId?: string | null;
};

type NotificationItem = {
  id: string;
  issuedAt: string;
  type: "INVITATION" | "MESSAGE" | "REWARD" | "INFO";
  message: string;
  read: boolean;
  data?: unknown;
};

type NotificationView = NotificationItem & {
  displayMessage: string;
  joinHref?: string;
  inviterName?: string;
  rewardBits?: number;
  rewardRank?: number;
  rewardDate?: string;
  claimable?: boolean;
};

type PlayerSearchItem = {
  id: string;
  name: string;
  img?: string | null;
};

const INVITATION_PREFIX = "__invite__";
const INVITATION_TTL_MS = 5 * 60 * 1000;

function parseNotification(notification: NotificationItem): NotificationView {
  if (notification.type === "REWARD") {
    const data = notification.data;
    const rewardData = typeof data === "object" && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : {};
    const bits = Number(rewardData.bits ?? 0);
    const rank = Number(rewardData.rank ?? 0);
    const date = typeof rewardData.date === "string" ? rewardData.date : undefined;
    return {
      ...notification,
      rewardBits: Number.isFinite(bits) ? bits : undefined,
      rewardRank: Number.isFinite(rank) ? rank : undefined,
      rewardDate: date,
      claimable: rewardData.kind === "daily_challenge_bits",
      displayMessage: notification.message,
    };
  }
  if (notification.type !== "INVITATION" || !notification.message.startsWith(`${INVITATION_PREFIX}:`)) {
    return { ...notification, displayMessage: notification.message };
  }

  const [_, destination, roomId, inviterNameEncoded] = notification.message.split(":");
  const inviterName = decodeURIComponent(inviterNameEncoded || "");
  const joinHref = destination === "room" ? `/room/${roomId}` : `/rooms/${roomId}/lobby`;

  return {
    ...notification,
    inviterName,
    joinHref,
    displayMessage: inviterName
      ? `${inviterName} vous invite à rejoindre sa partie.`
      : "Invitation à rejoindre une partie.",
  };
}

function formatRemainingDuration(issuedAt: string) {
  const diffMs = new Date(issuedAt).getTime() + INVITATION_TTL_MS - Date.now();
  if (diffMs <= 0) return "Expirée";
  const totalMinutes = Math.ceil(diffMs / 60000);
  if (totalMinutes <= 1) return "Expire dans moins d’une minute";
  return `Expire dans ${totalMinutes} min`;
}

function formatNotificationIssuedAt(issuedAt: string) {
  const issuedTime = new Date(issuedAt).getTime();
  if (!Number.isFinite(issuedTime)) return "—";

  const elapsedMs = Math.max(0, Date.now() - issuedTime);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const elapsedHours = Math.floor(elapsedMs / 3600000);

  if (elapsedMs < 24 * 3600000) {
    if (elapsedMinutes < 1) {
      return `Il y a ${Math.max(1, elapsedSeconds)} seconde${elapsedSeconds > 1 ? "s" : ""}`;
    }
    if (elapsedHours < 1) {
      return `Il y a ${elapsedMinutes} minute${elapsedMinutes > 1 ? "s" : ""}`;
    }
    return `Il y a ${elapsedHours} heure${elapsedHours > 1 ? "s" : ""}`;
  }

  if (elapsedMs < 48 * 3600000) return "Hier";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(issuedTime));
}

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

function MenuCard({
  to,
  title,
  desc,
  icon = "★",
}: MenuItem) {
  const [isHovered, setIsHovered] = useState(false);
  const hoverBg = "rgba(255,255,255,.1)";
  return (
    <Link
      to={to}
      style={{
        display: "block",
        width: "100%",
        borderRadius: 6,
        padding: "9px 12px",
        border: "none",
        background: isHovered ? hoverBg : "transparent",
        color: "inherit",
        textDecoration: "none",
        position: "relative",
        overflow: "visible",
        transition: "background-color .15s ease",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          position: "relative",
        }}
      >
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
              color: isHovered ? "#ffffff" : "#e2e8f0",
              transition: "color .15s ease",
            }}
          >
            {title}
          </div>
          <div style={{ opacity: isHovered ? 0.9 : 0.7, fontSize: 10 }}>{desc}</div>
        </div>
      </div>
    </Link>
  );
}

function NavLevelShield({ level }: { level: number }) {

  return (
    <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center text-white">
      <svg
        viewBox="0 0 72 72"
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M36 3 64.6 19.5v33L36 69 7.4 52.5v-33L36 3z"
          fill="#172033"
          stroke="#8b5cf6"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="relative z-10 font-inter text-[16px] font-black leading-none">{level}</span>
    </span>
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
  const showSideNavigation =
    location.pathname === "/" ||
    location.pathname === "/multi/public" ||
    location.pathname === "/rooms/new" ||
    /^\/rooms\/[^/]+\/lobby$/.test(location.pathname);
  const joinLoadingPending =
    showJoinLoading ||
    (typeof window !== "undefined" && sessionStorage.getItem("join-loading") === "1");
  const shouldHideRoomContent = joinLoadingPending && isRoomRoute;
  const isGuest = !user || Boolean(user?.guest);
  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
   if (!isRoomRoute) {
      sessionStorage.removeItem("join-loading");
      setShowJoinLoading(false);
      return;
    }

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
  }, [isRoomRoute, location.key, showJoinLoading]);

  const animationRef = useRef<number | null>(null);
  const experienceAnimationRef = useRef<number | null>(null);

  const [openMenu, setOpenMenu] = useState<null | "solo" | "multi" | "private">(
    null
  );
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationView[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const seenInvitationNotificationIdsRef = useRef<Set<string>>(new Set());
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<PlayerSearchItem[]>([]);
  const [playerSearchOpen, setPlayerSearchOpen] = useState(false);
  const [invitePendingId, setInvitePendingId] = useState<string | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  // ✅ ref du header pour éviter fermeture quand on se déplace vers le dropdown
  const headerRef = useRef<HTMLElement | null>(null);

  // ✅ XP burst (remplissage progressif au rythme des étoiles)
  const xpBurstQueueRef = useRef<number[]>([]);
  const xpBurstRafRef = useRef<number | null>(null);
  const xpBurstActiveRef = useRef(false);
  const xpPendingUserExperienceRef = useRef<number | null>(null);

  const currentInviteContext = React.useMemo(() => {
    const roomMatch = location.pathname.match(/^\/room\/([^/]+)/);
    if (roomMatch) return { roomId: roomMatch[1], destination: "room" as const };

    const lobbyMatch = location.pathname.match(/^\/rooms\/([^/]+)\/lobby$/);
    if (lobbyMatch) return { roomId: lobbyMatch[1], destination: "lobby" as const };

    return null;
  }, [location.pathname]);


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

  const refreshUnreadCount = React.useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications/unread-count`, {
        credentials: "include",
      });
      if (!res.ok) {
        setUnreadCount(0);
        return;
      }
      const data = (await res.json()) as { count?: number };
      setUnreadCount(Number(data?.count ?? 0));
    } catch {
      setUnreadCount(0);
    }
  }, []);

  const loadUnreadNotifications = React.useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/notifications/unread`, {
        credentials: "include",
      });
      if (!res.ok) {
        setNotifications([]);
        return;
      }
      const data = (await res.json()) as { notifications?: NotificationItem[] };
      const nextNotifications = Array.isArray(data.notifications)
        ? data.notifications.map(parseNotification)
        : [];
      setNotifications(nextNotifications);
    } catch {
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  const markAllNotificationsRead = React.useCallback(async () => {
    try {
      await fetch(`${API_BASE}/notifications/mark-all-read`, {
        method: "POST",
        credentials: "include",
      });
      setNotifications((prev) => {
        const remaining = prev.filter((item) => item.type === "REWARD" && item.claimable);
        setUnreadCount(remaining.length);
        return remaining;
      });
    } catch {}
  }, []);

  const sendInvite = React.useCallback(async (targetPlayer: PlayerSearchItem) => {
    if (!currentInviteContext) {
      toast({
        title: "Invitation impossible",
        description: "Ouvrez un salon ou une partie avant d’inviter un joueur.",
      });
      return;
    }

    setInvitePendingId(targetPlayer.id);
    try {
      const res = await fetch(`${API_BASE}/notifications/invite`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPlayerId: targetPlayer.id,
          roomId: currentInviteContext.roomId,
          destination: currentInviteContext.destination,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof payload?.error === "string" ? payload.error : "invite_failed";
        throw new Error(message);
      }

      toast({
        title: "Invitation envoyée",
        description: `${targetPlayer.name} a reçu une notification valable 5 minutes.`,
      });
      void refreshUnreadCount();
    } catch (error) {
      const reason = error instanceof Error ? error.message : "invite_failed";
      const description = reason === "only_owner_can_invite"
        ? "Seul l’hôte du salon peut envoyer des invitations."
        : reason === "cannot_invite_self"
          ? "Vous ne pouvez pas vous inviter vous-même."
          : "Impossible d’envoyer cette invitation pour le moment.";
      toast({
        title: "Invitation impossible",
        description,
        variant: "destructive",
      });
    } finally {
      setInvitePendingId(null);
    }
  }, [currentInviteContext, refreshUnreadCount]);

  const handleNotificationClaim = React.useCallback(async (notification: NotificationView) => {
    if (!notification.claimable) return;

    try {
      const res = await fetch(`${API_BASE}/notifications/${notification.id}/claim`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await res.json().catch(() => ({}))) as { claimed?: boolean; bits?: number; totalBits?: number; reason?: string };
      if (!res.ok) throw new Error(payload.reason || "claim_failed");

      if (Number.isFinite(payload.totalBits)) {
        window.dispatchEvent(new CustomEvent("bits-updated", { detail: { total: Number(payload.totalBits) } }));
      }

      setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      toast({
        title: payload.claimed ? "Récompense récupérée" : "Récompense déjà récupérée",
        description: `${payload.bits ?? notification.rewardBits ?? 0} bit${(payload.bits ?? notification.rewardBits ?? 0) > 1 ? "s" : ""} ajouté${(payload.bits ?? notification.rewardBits ?? 0) > 1 ? "s" : ""} à votre compte.`,
      });
    } catch {
      toast({
        title: "Récompense indisponible",
        description: "Impossible de récupérer cette récompense pour le moment.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleNotificationJoin = React.useCallback(async (notification: NotificationView) => {
    const href = notification.joinHref;
    if (!href) return;

    try {
      await fetch(`${API_BASE}/notifications/${notification.id}/read`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}

    setNotificationsOpen(false);
    setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    sessionStorage.setItem("join-loading", "1");
    nav(href);
  }, [nav]);

  const notifyIncomingInvitations = React.useCallback((items: NotificationView[]) => {
    items.forEach((notification) => {
      if (notification.type !== "INVITATION" || !notification.joinHref) return;
      if (seenInvitationNotificationIdsRef.current.has(notification.id)) return;

      seenInvitationNotificationIdsRef.current.add(notification.id);

      toast({
        title: "Invitation reçue",
        description: notification.displayMessage,
        action: (
          <ToastAction
            altText="Rejoindre la partie"
            onClick={() => {
              void handleNotificationJoin(notification);
            }}
          >
            Rejoindre
          </ToastAction>
        ),
      });
    });
  }, [handleNotificationJoin]);


  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  useEffect(() => {
    const handler = () => {
      void refreshUser();
      void refreshUnreadCount();
    };
    window.addEventListener(AUTH_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener(AUTH_UPDATED_EVENT, handler);
    };
  }, [refreshUser, refreshUnreadCount]);


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
    notifyIncomingInvitations(notifications);
  }, [notifications, notifyIncomingInvitations]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshUnreadCount();
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshUnreadCount]);

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
    if (!notificationsOpen || unreadCount === 0) return;
    if (notifications.length >= unreadCount) return;
    void loadUnreadNotifications();
  }, [notificationsOpen, unreadCount, notifications.length, loadUnreadNotifications]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserOpen(false);
      }

      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setPlayerSearchOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  useEffect(() => {
    const query = playerSearch.trim();
    if (query.length < 1) {
      setPlayerSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/players/search?q=${encodeURIComponent(query)}&limit=6`,
          {
            credentials: "include",
            signal: controller.signal,
          }
        );
        if (!res.ok) {
          setPlayerSearchResults([]);
          return;
        }

        const data = (await res.json()) as { players?: PlayerSearchItem[] };
        setPlayerSearchResults(Array.isArray(data.players) ? data.players : []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setPlayerSearchResults([]);
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [playerSearch]);

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
    setUnreadCount(0);
    setNotifications([]);
    setNotificationsOpen(false);
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
          src={cardsIconUrl}
          alt=""
          aria-hidden
          style={{
            width: 32,
            height: 32,
            display: "block",
            objectFit: "contain",
          }}
        />
      ),
    },
    {
      to: "/multi/ranking",
      title: "Classement",
      desc: "Consultez le top des joueurs.",
      icon: (
        <img
          src={rankingIconUrl}
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
          src={lockIconUrl}
          alt=""
          aria-hidden
          style={{
            width: 24,
            height: 24,
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
  const formattedDisplayBits = new Intl.NumberFormat("fr-FR").format(displayBits);
  const xpValue = displayExperience;
  const xpProgress = getLevelProgress(xpValue);
  const xpProgressPercent = Math.max(0, Math.min(100, Math.floor(xpProgress.progress * 100)));

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
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
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
            flexShrink: 0,
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
                  background: "#161926",
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
                  style={{ display: "flex", flexDirection: "column", gap: 0 }}
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
                  background: "#161926",
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
                  style={{ display: "flex", flexDirection: "column", gap: 0 }}
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
                  background: "#161926",
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
                  style={{ display: "flex", flexDirection: "column", gap: 0 }}
                >
                  {privateItems.map((it) => (
                    <MenuCard key={it.to} {...it} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </nav>

        <div
          ref={searchContainerRef}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(420px, calc(100vw - 640px))",
            minWidth: 260,
            zIndex: 65,
          }}
        >
          <div style={{ width: "100%", position: "relative" }}>
            <input
              data-player-search-input="true"
              type="search"
              value={playerSearch}
              onChange={(e) => {
                setPlayerSearch(e.target.value);
                setPlayerSearchOpen(true);
              }}
              onFocus={() => setPlayerSearchOpen(true)}
              placeholder="Rechercher un joueur..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              style={{
                width: "100%",
                height: 32,
                borderRadius: 7,
                border: "1px solid rgba(255,255,255,.2)",
                background: "rgba(14,18,30,.95)",
                color: "#e2e8f0",
                padding: "0 14px",
                fontSize: 13,
                outline: "none",
              }}
            />

            {playerSearchOpen && playerSearch.trim().length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: 18,
                  background: "#161926",
                  border: "1px solid rgba(255,255,255,.12)",
                  borderRadius: 8,
                  boxShadow: "0 20px 40px rgba(0,0,0,.45)",
                  overflow: "hidden",
                  zIndex: 80,
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
                {playerSearchResults.length === 0 ? (
                  <div
                    style={{
                      padding: "10px 12px",
                      fontSize: 12,
                      color: "#94a3b8",
                    }}
                  >
                    Aucun joueur trouvé.
                  </div>
                ) : (
                  playerSearchResults.map((player, index) => {
                    const canInvite =
                      !!currentInviteContext &&
                      !!user?.playerId &&
                      user.playerId !== player.id;

                    return (
                      <div
                        key={player.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderBottom:
                            index < playerSearchResults.length - 1
                              ? "1px solid rgba(255,255,255,.06)"
                              : "none",
                        }}
                      >
                        <Link
                          to={`/players/${player.id}/profile`}
                          onClick={() => {
                            setPlayerSearchOpen(false);
                            setPlayerSearch("");
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            color: "#e2e8f0",
                            textDecoration: "none",
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <img
                            src={player.img ?? "/img/profiles/0.avif"}
                            alt={player.name}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              objectFit: "cover",
                            }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</span>
                        </Link>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void sendInvite(player);
                          }}
                          disabled={!canInvite || invitePendingId === player.id}
                          aria-label={invitePendingId === player.id ? "Invitation en cours" : `Inviter ${player.name}`}
                          title={invitePendingId === player.id ? "Invitation en cours" : "Inviter"}
                          style={{
                            position: "relative",
                            display: "grid",
                            placeItems: "center",
                            width: 18,
                            height: 18,
                            borderRadius: 5,
                            border: "1px solid rgba(255,255,255,.9)",
                            background: "#FFFFFF",
                            cursor: !canInvite || invitePendingId === player.id ? "not-allowed" : "pointer",
                            opacity: !canInvite ? 0.38 : invitePendingId === player.id ? 0.7 : 1,
                            flexShrink: 0,
                            boxShadow: "0 5px 12px rgba(0,0,0,.22)",
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              position: "absolute",
                              width: 9,
                              height: 2,
                              borderRadius: 999,
                              background: "#161926",
                            }}
                          />
                          <span
                            aria-hidden="true"
                            style={{
                              position: "absolute",
                              width: 2,
                              height: 9,
                              borderRadius: 999,
                              background: "#161926",
                            }}
                          />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: user */}
        <div
          ref={userRef}
          style={{
            marginLeft: "auto",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 28,
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
              <div
                className="group"
                aria-label={`Niveau ${xpProgress.level} - progression ${xpProgressPercent}%`}
                data-xp-target="nav-xp"
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  cursor: "default",
                }}
              >
                <NavLevelShield level={xpProgress.level} />
                <div className="pointer-events-none absolute right-1/2 top-[calc(100%+8px)] z-50 w-64 translate-x-1/2 rounded-lg border border-white/[.12] bg-[#161926] p-4 opacity-0 shadow-[0_20px_60px_rgba(0,0,0,0.35)] transition duration-150 group-hover:opacity-100">
                  <div className="mb-2 flex items-center justify-between font-inter text-[11px] font-bold uppercase tracking-[0.08em] text-slate-300">
                    <span>Niveau {xpProgress.level}</span>
                    <span>{xpProgressPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#a855f7]"
                      style={{ width: `${xpProgressPercent}%` }}
                    />
                  </div>
                  <div className="mt-2 font-inter text-[11px] font-semibold text-slate-400">
                    {xpProgress.gained} / {xpProgress.needed} XP
                  </div>
                </div>
              </div>

              <div
                aria-label={`${formattedDisplayBits} bits`}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  height: 45,
                  minWidth: 118,
                  paddingRight: 14,
                  fontWeight: 800,
                  color: "#f8fafc",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 22,
                    right: 0,
                    height: 26,
                    borderRadius: "0 999px 999px 0",
                    background: "#151A2A",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.05)",
                  }}
                />
                <img
                  src={bitIconUrl}
                  alt=""
                  aria-hidden="true"
                  width={45}
                  height={45}
                  style={{
                    display: "block",
                    flexShrink: 0,
                    zIndex: 1,
                    filter: "drop-shadow(0 3px 7px rgba(0,0,0,.5))",
                  }}
                />
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    minWidth: 58,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 0 0 8px",
                    fontSize: 13,
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formattedDisplayBits}
                </span>
              </div>

              <button
                type="button"
                title="Notifications"
                aria-label={unreadCount > 0 ? `Notifications (${unreadCount})` : "Notifications"}
                onClick={() => setNotificationsOpen((prev) => !prev)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 30,
                  height: 30,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                {unreadCount > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      minWidth: 20,
                      height: 20,
                      padding: "0 5px",
                      display: "inline-grid",
                      placeItems: "center",
                      borderRadius: 999,
                      border: "1px solid rgba(15,23,42,.8)",
                      background: "#EF4444",
                      color: "#ffffff",
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1,
                      boxShadow: "0 4px 10px rgba(0,0,0,0.45)",
                    }}
                  >
                    <span style={{ transform: "translateX(0.5px)", fontVariantNumeric: "tabular-nums" }}>
                      {unreadCount}
                    </span>
                  </span>
                )}
                <img
                  src={bellUrl}
                  alt="Notifications"
                  width={20}
                  height={20}
                  style={{ display: "block" }}
                />
              </button>

              {!loading && (
                <button
                  onClick={() => setUserOpen((v) => !v)}
                  title={user?.displayName || "Utilisateur"}
                  style={{
                    display: "flex",
                    alignItems: "center",
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
                    aria-hidden
                    style={{
                      fontSize: 14,
                      opacity: 0.7,
                      lineHeight: 1,
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
                    background: "#161926",
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
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "2px 12px 12px",
                      color: "#f8fafc",
                      fontWeight: 700,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        display: "grid",
                        placeItems: "center",
                        background: "rgba(255,255,255,.08)",
                        color: "#e5e7eb",
                        flexShrink: 0,
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="17"
                        height="17"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 21a8 8 0 0 0-16 0" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <span
                      style={{
                        minWidth: 0,
                        maxWidth: 230,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {user?.displayName ?? "Utilisateur"}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 1,
                      background: "rgba(255,255,255,.08)",
                      margin: "0 0 6px",
                    }}
                  />
                  <UserMenuItem to="/me/profile" label="Profil" />
                  <UserMenuItem to="/me/achievements" label="Succès" divider />
                  {isAdmin && <UserMenuItem to="/admin" label="Administration" />}
                  <UserMenuItem to="/me/account" label="Compte" />
                  <UserMenuItem to="/help" label="Assistance" divider />
                  <UserMenuItem label="Se déconnecter" danger onClick={logout} />
                </div>
              )}
            </>
          )}
        </div>
      </header>

      {showSideNavigation && <SideNavigation />}

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
        className={showSideNavigation ? "app-main--with-side-navigation" : undefined}
      >
        <Outlet />
      </main>
      {notificationsOpen && (
        <>
          <button
            type="button"
            aria-label="Fermer les notifications"
            onClick={() => setNotificationsOpen(false)}
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              top: HEADER_H,
              bottom: 0,
              border: "none",
              background: "rgba(2,6,23,.45)",
              backdropFilter: "blur(3px)",
              WebkitBackdropFilter: "blur(3px)",
              zIndex: 90,
              cursor: "pointer",
            }}
          />
          <style>{`
            .app-notifications-scroll {
              scrollbar-width: thin;
              scrollbar-color: #eef1ff rgba(255,255,255,0.08);
            }
            .app-notifications-scroll::-webkit-scrollbar { width: 10px; }
            .app-notifications-scroll::-webkit-scrollbar-track {
              background: rgba(255,255,255,0.08);
              border-radius: 999px;
            }
            .app-notifications-scroll::-webkit-scrollbar-thumb {
              background: #eef1ff;
              border-radius: 999px;
              border: 3px solid rgba(6,10,25,0.35);
              background-clip: padding-box;
            }
          `}</style>
          <aside
            style={{
              position: "fixed",
              top: HEADER_H,
              right: 0,
              bottom: 0,
              width: "min(360px, 92vw)",
              background: "#131829",
              borderLeft: "1px solid rgba(255,255,255,.12)",
              zIndex: 100,
              color: "#e2e8f0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="border-b border-white/[0.1] px-[14px] py-4 font-brandUpright text-[18px] uppercase leading-none tracking-[0.05em] text-white/95">
              Notifications
            </div>
            <div
              className="app-notifications-scroll"
              style={{
                padding: "10px 10px 10px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                overflowY: "auto",
                flex: 1,
                direction: "rtl",
              }}
            >
              {notificationsLoading ? (
                <div style={{ direction: "ltr", opacity: 0.8, fontSize: 13 }}>Chargement...</div>
              ) : notifications.length === 0 ? (
                <div style={{ direction: "ltr", opacity: 0.8, fontSize: 13 }}>Aucune notification non lue.</div>
) : (
  notifications.map((notif) => {
    const isInvitation = notif.type === "INVITATION" && !!notif.joinHref;
    const isReward = notif.type === "REWARD" && !!notif.claimable;
    const remainingLabel = isInvitation
      ? formatRemainingDuration(notif.issuedAt)
      : null;

    return (
      <div
        key={notif.id}
        onClick={isReward ? () => void handleNotificationClaim(notif) : undefined}
        role={isReward ? "button" : undefined}
        tabIndex={isReward ? 0 : undefined}
        onKeyDown={isReward ? (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            void handleNotificationClaim(notif);
          }
        } : undefined}
        style={{
          direction: "ltr",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          background: "rgba(15,23,42,.65)",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 8,
          padding: "10px 10px",
          cursor: isReward ? "pointer" : "default",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, lineHeight: 1.35 }}>
            {notif.displayMessage}
          </div>

          {remainingLabel && (
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
              {remainingLabel}
            </div>
          )}

          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>
            {formatNotificationIssuedAt(notif.issuedAt)}
          </div>

          {isReward && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleNotificationClaim(notif);
                }}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 6,
                  border: "1px solid transparent",
                  background: "#6250C7",
                  color: "#ffffff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Récupérer {notif.rewardBits ?? 0} bit{(notif.rewardBits ?? 0) > 1 ? "s" : ""}
              </button>
            </div>
          )}

          {isInvitation && notif.joinHref && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => void handleNotificationJoin(notif)}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "#22d3ee",
                  color: "#082032",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Rejoindre
              </button>
            </div>
          )}
        </div>
      </div>
    );
  })
)}
            </div>
            <div style={{ padding: 10, borderTop: "1px solid rgba(255,255,255,.1)" }}>
              <button
                type="button"
                onClick={() => void markAllNotificationsRead()}
                disabled={notifications.length === 0}
                style={{
                  width: "100%",
                  height: 34,
                  borderRadius: 6,
                  border: "1px solid transparent",
                  background: "#6250C7",
                  color: "#ffffff",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: notifications.length === 0 ? "not-allowed" : "pointer",
                  opacity: notifications.length === 0 ? 0.6 : 1,
                }}
              >
                Tout marquer comme lu
              </button>
            </div>
          </aside>
        </>
      )}
      {joinLoadingPending && <JoinLoadingScreen offsetTop={HEADER_H} />}
    </div>
  );
}
