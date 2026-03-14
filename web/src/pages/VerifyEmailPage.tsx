import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE } from "../auth/client";
import { useAuth } from "../auth/AuthContext";
import { notifyAuthUpdated } from "../auth/events";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const nav = useNavigate();
  const { refresh } = useAuth();

  const [state, setState] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!token) {
        if (!cancelled) setState("error");
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`, {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) setState("error");
          return;
        }

        await refresh();
        notifyAuthUpdated();
        if (!cancelled) {
          setState("success");
          setTimeout(() => {
            nav("/", { replace: true });
          }, 1200);
        }
      } catch {
        if (!cancelled) setState("error");
      }
    }

    void verify();

    return () => {
      cancelled = true;
    };
  }, [token, refresh, nav]);

  const message =
    state === "loading"
      ? "Vérification en cours..."
      : state === "success"
      ? "Votre email est confirmé. Connexion en cours..."
      : "Le lien de vérification est invalide ou expiré.";

  const color = state === "success" ? "#86efac" : state === "error" ? "#f87171" : "#f8fafc";

  return (
    <div style={{ minHeight: "calc(100dvh - 52px)", background: "#13141F", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px 72px", color: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#1E2030", borderRadius: 10, padding: "32px 28px", border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 25px 60px rgba(0,0,0,.45)" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, textAlign: "center" }}>Vérification de l'email</h1>
        <div style={{ height: 24 }} />
        <p style={{ margin: 0, color, textAlign: "center" }}>{message}</p>
      </div>
    </div>
  );
}