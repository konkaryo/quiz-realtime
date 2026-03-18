import { useState } from "react";
import { API_BASE } from "../auth/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
    } finally {
      setLoading(false);
      setMessage("Si un compte existe pour cet e-mail, un lien a été envoyé.");
    }
  }

  return (
    <div style={{ minHeight: "calc(100dvh - 52px)", background: "#13141F", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px 72px", color: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#1E2030", borderRadius: 10, padding: "32px 28px", border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 25px 60px rgba(0,0,0,.45)" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, textAlign: "center" }}>Mot de passe oublié ?</h1>
        <div style={{ height: 24 }} />
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
          <input
            placeholder="Adresse e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "#2A2C3E", color: "#f8fafc", fontSize: 14 }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", marginTop: 6, padding: "12px 16px", borderRadius: 8, border: "none", background: "#6F5BD4", color: "#ffffff", fontWeight: 700, fontSize: 15, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.8 : 1 }}
          >
            {loading ? "Envoi..." : "Envoyer"}
          </button>
          {message && <div style={{ color: "#86efac", fontSize: 13 }}>{message}</div>}
        </form>
      </div>
    </div>
  );
}