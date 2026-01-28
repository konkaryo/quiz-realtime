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
import RacePage from "./pages/RacePage";
import LobbyRacePage from "./pages/LobbyRacePage";
import PrivateLobbyPage from "./pages/PrivateLobbyPage";

// ✅ nouvelle page
import DailyChallengePage from "./pages/DailyChallengePage";
import DailyChallengePlayPage from "./pages/DailyChallengePlayPage";
import ProfilePage from "./pages/ProfilePage";
import "./index.css";

// pages publiques
const LoginPage = React.lazy(() => import("./pages/LoginPage"));
const RegisterPage = React.lazy(() => import("./pages/RegisterPage"));
const ForgotPasswordPage = React.lazy(
  () => import("./pages/ForgotPasswordPage")
);

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
      if (!user) {
        setStatus("guest");
      } else {
        setStatus(user.guest ? "guest" : "authed");
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (status === "pending") {
    return <div style={{ padding: 24, opacity: 0.7 }}>Chargement…</div>;
  }

  return <>{children}</>;
}
// ---------------------------------------------------------------------------

const router = createBrowserRouter([
  // Routes sous AppShell
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      {
        path: "/login",
        element: (
          <React.Suspense
            fallback={
              <div style={{ padding: 24, opacity: 0.7 }}>Chargement…</div>
            }
          >
            <LoginPage />
          </React.Suspense>
        ),
      },
      {
        path: "/register",
        element: (
          <React.Suspense
            fallback={
              <div style={{ padding: 24, opacity: 0.7 }}>Chargement…</div>
            }
          >
            <RegisterPage />
          </React.Suspense>
        ),
      },
      {
        path: "/forgot-password",
        element: (
          <React.Suspense
            fallback={
              <div style={{ padding: 24, opacity: 0.7 }}>Chargement…</div>
            }
          >
            <ForgotPasswordPage />
          </React.Suspense>
        ),
      },
      { path: "/", element: <Home /> },

      { path: "/solo/daily", element: <DailyChallengePage /> },
      { path: "/solo/daily/:date", element: <DailyChallengePlayPage /> },
      { path: "/multi/race", element: <LobbyRacePage /> },
      { path: "/multi/race/play", element: <RacePage /> },
      { path: "/me/profile", element: <ProfilePage /> },
      { path: "/players/:playerId/profile", element: <ProfilePage /> },
      { path: "/rooms/new", element: <CreateRoomPage /> },
      { path: "/rooms/:roomId/lobby", element: <PrivateLobbyPage /> },
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
