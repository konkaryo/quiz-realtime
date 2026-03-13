import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { API_BASE } from "../auth/client";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!token) {
      setError("Lien invalide ou incomplet.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, newPassword }),
      });

      if (!res.ok) {
        setError("Le lien est invalide, expiré, ou déjà utilisé.");
        return;
      }

      setMessage("Votre mot de passe a été réinitialisé avec succès.");
      setNewPassword("");
    } catch {
      setError("Impossible de réinitialiser le mot de passe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "calc(100dvh - 52px)", background: "#13141F", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px 72px", color: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#1E2030", borderRadius: 10, padding: "32px 28px", border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 25px 60px rgba(0,0,0,.45)" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, textAlign: "center" }}>Réinitialiser le mot de passe</h1>
        <div style={{ height: 24 }} />

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
          <input
            placeholder="Nouveau mot de passe"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            required
            minLength={8}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "#2A2C3E", color: "#f8fafc", fontSize: 14 }}
          />
          <button
            type="submit"
            disabled={loading || !token}
            style={{ width: "100%", marginTop: 6, padding: "12px 16px", borderRadius: 8, border: "none", background: "#6F5BD4", color: "#ffffff", fontWeight: 700, fontSize: 15, cursor: loading ? "wait" : "pointer", opacity: loading || !token ? 0.8 : 1 }}
          >
            {loading ? "Envoi..." : "Valider"}
          </button>
          {message && <div style={{ color: "#86efac", fontSize: 13 }}>{message}</div>}
          {error && <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div>}
        </form>
      </div>
    </div>
  );
}