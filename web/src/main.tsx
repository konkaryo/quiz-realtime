// web/src/main.tsx
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import RoomPage from "./pages/RoomPage";

// 👉 pages publiques (à créer si pas déjà en place)
const LoginPage   = React.lazy(() => import("./pages/LoginPage"));
//const RegisterPage = React.lazy(() => import("./pages/RegisterPage"));

// URL API pour /auth/me
const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? (typeof window !== "undefined" ? window.location.origin : "");

// Petit helper pour vérifier la session
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

// Garde d'auth pour les routes protégées
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"pending" | "authed" | "guest">("pending");
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    fetchMe().then(({ user }) => {
      if (!mounted) return;
      setStatus(user ? "authed" : "guest");
    });
    return () => { mounted = false; };
  }, []);

  if (status === "pending") {
    return <div style={{ padding: 24, opacity: 0.7 }}>Chargement…</div>;
  }

  if (status === "guest") {
    // On garde la destination demandée dans state pour un redirect après login
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <React.Suspense fallback={<div style={{ padding: 24, opacity: 0.7 }}>Chargement…</div>}>
        <Routes>
          {/* Routes publiques */}
          <Route path="/login" element={<LoginPage />} />
          {/* <Route path="/register" element={<RegisterPage />} /> */ }

          {/* Routes protégées */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            } 
          />
          <Route
            path="/room/:roomId"
            element={
              <RequireAuth>
                <RoomPage />
              </RequireAuth>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  </React.StrictMode>
);
