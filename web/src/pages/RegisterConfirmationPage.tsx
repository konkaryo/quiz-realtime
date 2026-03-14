import { Link, useSearchParams } from "react-router-dom";

export default function RegisterConfirmationPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email")?.trim();

  return (
    <div style={{ minHeight: "calc(100dvh - 52px)", background: "#13141F", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px 72px", color: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#1E2030", borderRadius: 10, padding: "32px 28px", border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 25px 60px rgba(0,0,0,.45)", display: "grid", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, textAlign: "center" }}>Confirmez votre adresse email</h1>
        <p style={{ margin: 0, textAlign: "center", color: "rgba(248,250,252,.85)", lineHeight: 1.5 }}>
          Un email de confirmation vient d'être envoyé{email ? ` à ${email}` : ""}. Ouvrez le lien reçu pour activer votre compte.
        </p>
        <p style={{ margin: 0, textAlign: "center", color: "rgba(248,250,252,.65)", lineHeight: 1.5 }}>
          Vous pourrez vous connecter une fois votre email confirmé.
        </p>
        <Link to="/login" style={{ justifySelf: "center", color: "#b6a8ff", textDecoration: "none", fontWeight: 600 }}>
          Aller à la connexion
        </Link>
      </div>
    </div>
  );
}