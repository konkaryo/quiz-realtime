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
import RankingPage from "./pages/RankingPage";
import DailyChallengePage from "./pages/DailyChallengePage";
import DailyChallengePlayPage from "./pages/DailyChallengePlayPage";
import ProfilePage from "./pages/ProfilePage";
import AccountPage from "./pages/AccountPage";
import AdminPage from "./pages/AdminPage";
import LegalNoticePage from "./pages/LegalNoticePage";
import "./index.css";
import { Toaster } from "./components/ui/toaster";
import LoadingScreen from "./components/LoadingScreen";

// pages publiques
const LoginPage = React.lazy(() => import("./pages/LoginPage"));
const RegisterPage = React.lazy(() => import("./pages/RegisterPage"));
const ForgotPasswordPage = React.lazy(
  () => import("./pages/ForgotPasswordPage")
);
const ResetPasswordPage = React.lazy(() => import("./pages/ResetPasswordPage"));
const VerifyEmailPage = React.lazy(() => import("./pages/VerifyEmailPage"));
const RegisterConfirmationPage = React.lazy(() => import("./pages/RegisterConfirmationPage"));

const API_BASE = import.meta.env.VITE_API_BASE ?? window.location.origin;

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
// eslint-disable-next-line react-refresh/only-export-components
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"pending" | "authed" | "guest">("pending");

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
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

// eslint-disable-next-line react-refresh/only-export-components
function RequireRegisteredUser({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [status, setStatus] = useState<"pending" | "authed" | "guest">("pending");

  useEffect(() => {
    let mounted = true;
    fetchMe().then(({ user }) => {
      if (!mounted) return;
      setStatus(user && !user.guest ? "authed" : "guest");
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (status === "pending") return <LoadingScreen />;
  if (status === "guest") return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

// eslint-disable-next-line react-refresh/only-export-components
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"pending" | "admin" | "denied">("pending");

  useEffect(() => {
    let mounted = true;
    fetchMe().then(({ user }) => {
      if (!mounted) return;
      setStatus(user?.role === "ADMIN" ? "admin" : "denied");
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (status === "pending") {
    return <LoadingScreen />;
  }

  if (status === "denied") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
// ---------------------------------------------------------------------------

const router = createBrowserRouter([
  {
    path: "/mentions-legales",
    element: <LegalNoticePage />,
  },
  {
    path: "/login",
    element: (
      <React.Suspense fallback={<LoadingScreen />}>
        <LoginPage />
      </React.Suspense>
    ),
  },
  {
    path: "/register",
    element: (
      <React.Suspense fallback={<LoadingScreen />}>
        <RegisterPage />
      </React.Suspense>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <React.Suspense fallback={<LoadingScreen />}>
        <ForgotPasswordPage />
      </React.Suspense>
    ),
  },
  // Routes sous AppShell
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      {
        path: "/reset-password",
        element: (
          <React.Suspense fallback={<LoadingScreen />}>
            <ResetPasswordPage />
          </React.Suspense>
        ),
      },
      {
        path: "/verify-email",
        element: (
          <React.Suspense fallback={<LoadingScreen />}>
            <VerifyEmailPage />
          </React.Suspense>
        ),
      },
      {
        path: "/register/confirmation",
        element: (
          <React.Suspense fallback={<LoadingScreen />}>
            <RegisterConfirmationPage />
          </React.Suspense>
        ),
      },
      { path: "/", element: <Home /> },
      { path: "/solo/daily", element: <DailyChallengePage /> },
      { path: "/solo/daily/:date", element: <DailyChallengePlayPage /> },
      { path: "/multi/public", element: <Home /> },
      { path: "/multi/ranking", element: <RankingPage /> },
      { path: "/me/profile", element: <ProfilePage /> },
      { path: "/players/:playerId/profile", element: <ProfilePage /> },
      {
        path: "/me/account",
        element: (
          <RequireRegisteredUser>
            <AccountPage />
          </RequireRegisteredUser>
        ),
      },
      {
        path: "/admin",
        element: (
          <RequireAdmin>
            <AdminPage />
          </RequireAdmin>
        ),
      },
      { path: "/rooms/new", element: <CreateRoomPage /> },
      { path: "/rooms/:roomId/lobby", element: <CreateRoomPage /> },
      { path: "/private/join", element: <JoinPrivateRoomPage /> },
      { path: "/room/:roomId", element: <RoomPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  </React.StrictMode>
);
