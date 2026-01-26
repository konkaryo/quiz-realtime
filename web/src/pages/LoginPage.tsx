import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login } from "../auth/client";
import { useAuth } from "../auth/AuthContext";
import { notifyAuthUpdated } from "../auth/events";
import logoUrl from "@/assets/synapz.png";

export default function LoginPage() {
  const nav = useNavigate();
  const location = useLocation() as any;
  const { state } = location;
  const { refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const redirectTo = state?.from?.pathname || "/";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await login(email, password);
      await refresh();
      notifyAuthUpdated();
      nav(redirectTo, { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    }
  }

  return (
    <div
      style={{
        minHeight: "calc(100dvh - 52px)",
        background: "#13141F",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 16px 72px",
        color: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#1E2030",
          borderRadius: 10,
          padding: "32px 28px",
          border: "1px solid rgba(255,255,255,.08)",
          boxShadow: "0 25px 60px rgba(0,0,0,.45)",
        }}
      >
        <div style={{ display: "grid", justifyItems: "center", gap: 8 }}>
          <img
            src={logoUrl}
            alt="Synapz"
            style={{ height: 38, width: "auto" }}
          />
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "rgba(248,250,252,.7)",
            }}
          >
            Vous n&apos;avez pas de compte ?{" "}
            <Link
              to="/login?mode=register"
              style={{
                color: "#b6a8ff",
                textDecoration: "none",
                fontWeight: 600,
                transition: "text-decoration-color 0.2s ease",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.textDecoration = "underline";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.textDecoration = "none";
              }}
            >
              S&apos;inscrire.
            </Link>
          </p>
        </div>
        <div style={{ height: 28 }} />
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
          <input
            placeholder="Adresse e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,.12)",
              background: "#2A2C3E",
              color: "#f8fafc",
              fontSize: 14,
            }}
          />
          <div style={{ position: "relative" }}>
            <input
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? "text" : "password"}
              required
              style={{
                width: "100%",
                padding: "12px 44px 12px 14px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,.12)",
                background: "#2A2C3E",
                color: "#f8fafc",
                fontSize: 14,
              }}
            />
            <button
              type="button"
              aria-label={
                showPassword
                  ? "Masquer le mot de passe"
                  : "Afficher le mot de passe"
              }
              onClick={() => setShowPassword((prev) => !prev)}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                padding: 0,
                display: "grid",
                placeItems: "center",
                color: "rgba(248,250,252,.6)",
                cursor: "pointer",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {showPassword ? (
                  <>
                    <path d="M3 12s3.8-6 9-6 9 6 9 6-3.8 6-9 6-9-6-9-6z" />
                    <path d="M4 4l16 16" />

                  </>
                ) : (
                  <>
                    <path d="M2.5 12s3.8-6 9.5-6 9.5 6 9.5 6-3.8 6-9.5 6-9.5-6-9.5-6z" />
                    <circle cx="12" cy="12" r="3.2" />
                  </>
                )}
              </svg>
            </button>
          </div>
          <div
            style={{
              textAlign: "right",
              fontSize: 12,
              marginTop: -6,
              marginBottom: 6,
            }}
          >
            <Link
              to="/forgot-password"
              style={{
                color: "rgba(248,250,252,.6)",
                textDecoration: "none",
                transition: "text-decoration-color 0.2s ease",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.textDecoration = "underline";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.textDecoration = "none";
              }}
            >
              Mot de passe oublié ?
            </Link>
          </div>
          {err && <div style={{ color: "#f87171" }}>{err}</div>}
          <button
            type="submit"
            style={{
              width: "100%",
              marginTop: 6,
              padding: "12px 16px",
              borderRadius: 8,
              border: "none",
              background: "#6F5BD4",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}
