// web/src/AppShell.tsx
import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");

export default function AppShell() {
  const nav = useNavigate();
  const [user, setUser] = useState<{ displayName?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        const { user } = res.ok ? await res.json() : { user: null };
        if (mounted) setUser(user);
      } catch {
        /* noop */
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {}
    nav("/login", { replace: true });
  }

  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    padding: "8px 12px",
    borderRadius: 8,
    textDecoration: "none",
    color: isActive ? "#111827" : "#374151",
    background: isActive ? "#eef2ff" : "transparent",
    fontWeight: 600,
  });

  return (
    <div>
      {/* ---- Top bar ---- */}
      <header
        style={{
          position: "fixed",
          insetInline: 0,
          top: 0,
          height: 56,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 16px",
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          zIndex: 50,
        }}
      >
        {/* Left: logo/titre */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "linear-gradient(135deg,#4f46e5,#22d3ee)",
              display: "inline-block",
            }}
          />
          <div style={{ fontWeight: 800, fontSize: 18 }}>Synapz</div>
        </div>

        {/* Center: nav */}
        <nav style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16 }}>
          <NavLink to="/" end style={linkStyle}>Accueil</NavLink>
          {/* D’autres onglets possibles plus tard */}
        </nav>

        {/* Right: user */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {!loading && (
            <div style={{ fontSize: 14, color: "#374151" }}>
              {user?.displayName ? `Connecté : ${user.displayName}` : ""}
            </div>
          )}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={logout}
            style={{
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* ---- Page content ---- */}
      <main
        style={{
          padding: 16,
          paddingTop: 72,            // espace sous la barre
          maxWidth: 1100,
          margin: "0 auto",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
