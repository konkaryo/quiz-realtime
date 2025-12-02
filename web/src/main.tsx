// web/src/main.tsx
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  useLocation,
} from "react-router-dom";

import AppShell from "./AppShell";
import Home from "./pages/Home";
import RoomPage from "./pages/RoomPage";
import CreateRoomPage from "./pages/CreateRoomPage";
import JoinPrivateRoomPage from "./pages/JoinPrivateRoomPage";

// ✅ nouvelle page
import CampaignPage from "./pages/CampaignPage";
import DailyChallengePage from "./pages/DailyChallengePage";
import DailyChallengePlayPage from "./pages/DailyChallengePlayPage";
import ProfilePage from "./pages/ProfilePage";
import "./index.css";

// pages publiques
const LoginPage = React.lazy(() => import("./pages/LoginPage"));

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");

async function fetchMe() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) return { user: null };
    return await res.json(); // { user: {...} | null }
  } catch {
    return { user: null };
  }
}

// ----- Auth Guard ------------------------------------------------------------
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"pending" | "authed" | "guest">("pending");
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    fetchMe().then(({ user }) => {
      if (!mounted) return;
      setStatus(user ? "authed" : "guest");
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (status === "pending") {
    return <div style={{ padding: 24, opacity: 0.7 }}>Chargement…</div>;
  }

  if (status === "guest") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
// ---------------------------------------------------------------------------

const router = createBrowserRouter([
  // Route publique (hors AppShell)
  {
    path: "/login",
    element: (
      <React.Suspense
        fallback={<div style={{ padding: 24, opacity: 0.7 }}>Chargement…</div>}
      >
        <LoginPage />
      </React.Suspense>
    ),
  },

  // Routes protégées sous AppShell
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: "/", element: <Home /> },

      // ✅ Campagne (menu Solo)
      { path: "/solo/campagne", element: <CampaignPage /> },
      // Optionnel : même page pour un niveau précis pour l’instant
      { path: "/solo/campagne/level/:levelId", element: <CampaignPage /> },
      { path: "/solo/daily", element: <DailyChallengePage /> },
      { path: "/solo/daily/:date", element: <DailyChallengePlayPage /> },
      { path: "/me/profile", element: <ProfilePage /> },
      { path: "/rooms/new", element: <CreateRoomPage /> },
      { path: "/private/join", element: <JoinPrivateRoomPage /> },
      { path: "/room/:roomId", element: <RoomPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
