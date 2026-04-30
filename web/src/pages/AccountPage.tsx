import React, { useEffect, useState } from "react";
import { notifyAuthUpdated } from "@/auth/events";
import { API_BASE, updateAccount, updatePassword } from "@/auth/client";

type MeUser = {
  email?: string | null;
  playerName?: string | null;
  displayName?: string | null;
  guest?: boolean;
};

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(false);

  const [email, setEmail] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadMe = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Impossible de charger le compte.");
        }

        const data = (await res.json()) as { user?: MeUser };
        if (!mounted) return;

        const user = data.user ?? {};
        setGuest(Boolean(user.guest));
        setEmail(String(user.email ?? ""));
        setPlayerName(String(user.playerName ?? user.displayName ?? ""));
      } catch (err) {
        if (!mounted) return;
        setAccountMessage(
          err instanceof Error ? err.message : "Impossible de charger le compte."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadMe();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleAccountSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAccountMessage(null);

    try {
      await updateAccount(email.trim(), playerName.trim());
      notifyAuthUpdated();
      setAccountMessage("Informations du compte mises à jour.");
    } catch (err) {
      setAccountMessage(
        err instanceof Error ? err.message : "Erreur lors de la mise à jour du compte."
      );
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage("Les mots de passe ne correspondent pas.");
      return;
    }

    try {
      await updatePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Mot de passe mis à jour.");
    } catch (err) {
      setPasswordMessage(
        err instanceof Error ? err.message : "Erreur lors du changement de mot de passe."
      );
    }
  }

  return (
    <div style={{ position: "relative", minHeight: "100%", color: "#f8fafc" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, background: "#060A19" }} />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 760, margin: "0 auto", padding: "24px 16px 32px" }}>
        <h1 style={{ margin: 0, color: "#ffffff", fontSize: 34, fontWeight: 800, lineHeight: 1 }}>Compte</h1>
        <p style={{ marginTop: 8, marginBottom: 20, color: "rgba(248,250,252,.72)", fontSize: 16 }}>
          Gérez votre adresse email, votre nom de joueur et votre mot de passe.
        </p>

        {loading ? (
          <div style={{ color: "#cbd5e1" }}>Chargement…</div>
        ) : guest ? (
          <div
            style={{
              border: "1px solid rgba(248,113,113,.42)",
              borderRadius: 10,
              background: "rgba(127,29,29,.25)",
              color: "#fecaca",
              padding: 14,
            }}
          >
            Les comptes invités ne peuvent pas modifier ces informations.
          </div>
        ) : (
          <>
            <section
              style={{
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 12,
                padding: 18,
                background: "#1E2030",
                boxShadow: "0 12px 28px rgba(0,0,0,.3)",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 14, color: "#e2e8f0", fontSize: 30, fontWeight: 700 }}>Informations du compte</h2>
              <form onSubmit={handleAccountSubmit} style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 6, color: "rgba(248,250,252,.82)", fontWeight: 600 }}>
                  Adresse email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{
                      background: "#2A2C3E",
                      border: "1px solid rgba(255,255,255,.12)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      color: "#f8fafc",
                      fontSize: 16,
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6, color: "rgba(248,250,252,.82)", fontWeight: 600 }}>
                  Nom du joueur
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    minLength={1}
                    maxLength={64}
                    required
                    style={{
                      background: "#2A2C3E",
                      border: "1px solid rgba(255,255,255,.12)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      color: "#f8fafc",
                      fontSize: 16,
                    }}
                  />
                </label>

                <div>
                  <button
                    type="submit"
                    style={{
                      border: "none",
                      borderRadius: 8,
                      background: "#6F5BD4",
                      color: "white",
                      fontWeight: 700,
                      fontSize: 15,
                      padding: "12px 16px",
                      cursor: "pointer",
                    }}
                  >
                    Enregistrer
                  </button>
                </div>
              </form>
              {accountMessage && <p style={{ color: "rgba(248,250,252,.8)", marginBottom: 0 }}>{accountMessage}</p>}
            </section>

            <section
              style={{
                marginTop: 16,
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 12,
                padding: 18,
                background: "#1E2030",
                boxShadow: "0 12px 28px rgba(0,0,0,.3)",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 14, color: "#e2e8f0", fontSize: 30, fontWeight: 700 }}>Modifier le mot de passe</h2>
              <form onSubmit={handlePasswordSubmit} style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 6, color: "rgba(248,250,252,.82)", fontWeight: 600 }}>
                  Mot de passe actuel
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    style={{
                      background: "#2A2C3E",
                      border: "1px solid rgba(255,255,255,.12)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      color: "#f8fafc",
                      fontSize: 16,
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6, color: "rgba(248,250,252,.82)", fontWeight: 600 }}>
                  Nouveau mot de passe
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                    style={{
                      background: "#2A2C3E",
                      border: "1px solid rgba(255,255,255,.12)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      color: "#f8fafc",
                      fontSize: 16,
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6, color: "rgba(248,250,252,.82)", fontWeight: 600 }}>
                  Confirmer le nouveau mot de passe
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    required
                    style={{
                      background: "#2A2C3E",
                      border: "1px solid rgba(255,255,255,.12)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      color: "#f8fafc",
                      fontSize: 16,
                    }}
                  />
                </label>

                <div>
                  <button
                    type="submit"
                    style={{
                      border: "none",
                      borderRadius: 8,
                      background: "#6F5BD4",
                      color: "white",
                      fontWeight: 700,
                      fontSize: 15,
                      padding: "12px 16px",
                      cursor: "pointer",
                    }}
                  >
                    Changer le mot de passe
                  </button>
                </div>
              </form>
              {passwordMessage && <p style={{ color: "rgba(248,250,252,.8)", marginBottom: 0 }}>{passwordMessage}</p>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}