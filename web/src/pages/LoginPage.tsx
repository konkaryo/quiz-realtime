import { useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login } from "../auth/client";
import { useAuth } from "../auth/AuthContext";
import { notifyAuthUpdated } from "../auth/events";
import { useToast } from "../hooks/use-toast";
import ShapeGrid from "../components/ShapeGrid";
import "./Home.css";
import "./LoginPage.css";

type LoginLocationState = { from?: { pathname?: string } } | null;

export default function LoginPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const redirectTo = (location.state as LoginLocationState)?.from?.pathname || "/";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      await refresh();
      notifyAuthUpdated();
      nav(redirectTo, { replace: true });
    } catch (error: unknown) {
      toast({
        title: "Connexion impossible",
        description: error instanceof Error ? error.message : "Vérifiez vos identifiants puis réessayez.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="synapz-landing login-page">
      <ShapeGrid className="login-shape-grid" borderColor="#2f293a" hoverFillColor="#222222" shape="hexagon" direction="diagonal" squareSize={28} speed={0.1} hoverTrailAmount={0} />
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-header-left">
            <Link className="brand" to="/"><img src="/landing/loader-mark-white.png" alt="" /><span>SYNAPZ</span></Link>
            <span className="nav-divider" aria-hidden="true">/</span>
            <nav className="site-nav" aria-label="Navigation principale"><Link to="/">Accueil</Link><Link to="/#salons">Jouer</Link><Link to="/multi/ranking">Classement</Link></nav>
          </div>
          <div className="header-actions"><Link className="login-button" to="/register">S’inscrire</Link></div>
        </div>
      </header>

      <main className="login-main">
        <section className="login-panel" aria-label="Connexion">
          <div className="login-panel-brand"><img src="/landing/loader-mark-white.png" alt="" /><span>synapz</span></div>

          <form className="login-form" onSubmit={onSubmit}>
            <label><span>Adresse e-mail</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" spellCheck={false} placeholder="vous@exemple.fr" required /></label>
            <label><span>Mot de passe</span><span className="login-password-field"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" spellCheck={false} placeholder="Votre mot de passe" required /><button type="button" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
            <div className="login-form-meta"><Link to="/forgot-password">Mot de passe oublié ?</Link></div>
            <button className="login-submit" type="submit" disabled={submitting}>{submitting ? "Connexion…" : "Se connecter"}<ArrowRight size={17} /></button>
          </form>
          <p className="login-signup">Pas encore de compte ? <Link to="/register">S’inscrire</Link></p>
        </section>
      </main>
    </div>
  );
}
