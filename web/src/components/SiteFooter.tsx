import { Link } from "react-router-dom";
import "./SiteFooter.css";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Link className="site-footer-brand" to="/" aria-label="Synapz — Accueil">
          <img src="/landing/logo-dark.png" alt="" />
          <span>SYNAPZ</span>
        </Link>
        <nav aria-label="Informations légales">
          <Link to="/mentions-legales">Mentions légales</Link>
        </nav>
      </div>
    </footer>
  );
}