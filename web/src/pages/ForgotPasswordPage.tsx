import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { API_BASE } from "../auth/client";
import { useToast } from "../hooks/use-toast";
import ShapeGrid from "../components/ShapeGrid";
import "./Home.css";
import "./LoginPage.css";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error("Impossible d’envoyer le lien de réinitialisation.");
      toast({
        title: "E-mail envoyé",
        description: "Si un compte existe pour cette adresse, vous recevrez un lien de réinitialisation.",
      });
    } catch (error: unknown) {
      toast({
        title: "Envoi impossible",
        description: error instanceof Error ? error.message : "Réessayez dans quelques instants.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="synapz-landing login-page forgot-password-page">
      <ShapeGrid className="login-shape-grid" borderColor="#2f293a" hoverFillColor="#222222" shape="hexagon" direction="diagonal" squareSize={28} speed={0.1} hoverTrailAmount={0} />
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-header-left">
            <Link className="brand" to="/"><img src="/landing/loader-mark-white.png" alt="" /><span>SYNAPZ</span></Link>
            <span className="nav-divider" aria-hidden="true">/</span>
            <nav className="site-nav" aria-label="Navigation principale"><Link to="/">Accueil</Link><Link to="/#salons">Jouer</Link><Link to="/multi/ranking">Classement</Link></nav>
          </div>
          <div className="header-actions"><Link className="login-button" to="/login">Se connecter</Link></div>
        </div>
      </header>

      <main className="login-main">
        <section className="login-panel" aria-label="Mot de passe oublié">
          <div className="login-panel-brand"><img src="/landing/loader-mark-white.png" alt="" /><span>synapz</span></div>
          <form className="login-form" onSubmit={onSubmit}>
            <label><span>Adresse e-mail</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" spellCheck={false} placeholder="vous@exemple.fr" required /></label>
            <button className="login-submit" type="submit" disabled={loading}>{loading ? "Envoi…" : "Envoyer le lien"}<ArrowRight size={17} /></button>
          </form>
          <p className="login-signup">Vous connaissez votre mot de passe ? <Link to="/login">Se connecter</Link></p>
        </section>
      </main>
    </div>
  );
}