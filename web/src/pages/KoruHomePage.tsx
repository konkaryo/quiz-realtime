import { Link } from "react-router-dom";

import heroImageUrl from "@/assets/koru_home.png";
import paperBackgroundUrl from "@/assets/paper-bg.png";

import "./KoruHomePage.css";

export default function KoruHomePage() {
  return (
    <main
      className="koru-home"
      style={{ backgroundImage: `url(${paperBackgroundUrl})` }}
    >
      <section className="koru-home__content" aria-labelledby="koru-home-title">
        <div className="koru-home__copy">
          <h1 id="koru-home-title" className="koru-home__title">
            La culture
            <br />
            entre en jeu
          </h1>
          <div className="koru-home__accent" aria-hidden="true" />
          <p className="koru-home__description">
            Confrontez votre culture générale à celle de la communauté Koru.
          </p>

          <div className="koru-home__actions">
            <Link className="koru-home__button koru-home__button--play" to="/multi/public">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M13.2 1 4.8 13.2h5.6L9.8 23l9.4-13.8h-5.7L13.2 1Z" />
              </svg>
              <span>Jouer maintenant</span>
            </Link>
            <Link className="koru-home__button koru-home__button--login" to="/login">
              Se connecter
            </Link>
          </div>
        </div>

        <div className="koru-home__visual" aria-hidden="true">
          <img src={heroImageUrl} alt="" />
        </div>
      </section>
    </main>
  );
}