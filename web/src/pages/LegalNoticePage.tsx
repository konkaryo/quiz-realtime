import { useEffect } from "react";
import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";
import "./LegalNoticePage.css";

const PAGE_TITLE = "Mentions légales | Synapz";
const PAGE_DESCRIPTION = "Consultez les mentions légales du site Synapz.";

export default function LegalNoticePage() {
  useEffect(() => {
    const previousTitle = document.title;
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const createdDescription = !description;
    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }
    const previousDescription = description?.content;

    document.title = PAGE_TITLE;
    if (description) description.content = PAGE_DESCRIPTION;

    return () => {
      document.title = previousTitle;
      if (createdDescription) description.remove();
      else if (previousDescription !== undefined) description.content = previousDescription;
    };
  }, []);

  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link className="legal-brand" to="/" aria-label="Synapz — Retour à l'accueil">
          <img src="/landing/logo-dark.png" alt="" />
          <span>SYNAPZ</span>
        </Link>
        <Link className="legal-home-link" to="/">Retour à l'accueil</Link>
      </header>

      <main className="legal-main">
        <div className="legal-heading">
          <p className="legal-kicker">Informations juridiques</p>
          <h1>Mentions légales</h1>
          <p className="legal-updated">Dernière mise à jour : 22 septembre 2026</p>
        </div>

        <div className="legal-content">
          <section aria-labelledby="edition-title">
            <h2 id="edition-title">Édition du site</h2>
            {/* À mettre à jour lorsque Synapz sera exploité à titre professionnel. */}
            <p>Le site Synapz est édité à titre non professionnel par une personne physique ayant choisi de préserver son anonymat, conformément à l'article 1-1, II de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique.</p>
            <p>Les informations permettant l'identification de l'éditeur ont été communiquées à l'hébergeur dans les conditions prévues par la réglementation applicable.</p>
            <a className="legal-external-link" href="https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000049568614" target="_blank" rel="noopener noreferrer">Consulter l'article 1-1 sur Légifrance <span aria-hidden="true">↗</span></a>
          </section>

          <section aria-labelledby="hosting-title">
            <h2 id="hosting-title">Hébergement</h2>
            <address>
              <strong>Hetzner Online GmbH</strong><br />
              Industriestr. 25<br />
              91710 Gunzenhausen<br />
              Allemagne
            </address>
            <p>Téléphone : <a href="tel:+4998315050">+49 (0)9831 505-0</a></p>
            <p>Site : <a className="legal-external-link" href="https://www.hetzner.com/" target="_blank" rel="noopener noreferrer">www.hetzner.com <span aria-hidden="true">↗</span></a></p>
          </section>

          <section aria-labelledby="contact-title">
            <h2 id="contact-title">Contact</h2>
            {/* TODO: ajouter ici l'adresse publique de contact Synapz lorsqu'elle sera disponible. */}
            <p>Une adresse de contact publique sera indiquée dans cette section dès qu'elle sera disponible.</p>
          </section>

          <section aria-labelledby="copyright-title">
            <h2 id="copyright-title">Propriété intellectuelle</h2>
            <p>Sauf mention contraire, les éléments constituant le site Synapz, notamment sa structure, son interface, ses éléments graphiques, ses textes et ses contenus originaux, sont protégés par les dispositions applicables en matière de propriété intellectuelle.</p>
            <p>Certains contenus, illustrations ou éléments proposés sur Synapz peuvent provenir de sources tierces et restent soumis aux droits et licences qui leur sont propres.</p>
          </section>

          <section aria-labelledby="liability-title">
            <h2 id="liability-title">Responsabilité</h2>
            <p>Synapz s'efforce de fournir des informations et un service aussi fiables que possible. Toutefois, des erreurs, omissions ou indisponibilités temporaires peuvent survenir.</p>
            <p>Le contenu proposé sur Synapz, notamment les questions et réponses de culture générale, est fourni à titre informatif et ludique.</p>
          </section>

          <section aria-labelledby="law-title">
            <h2 id="law-title">Droit applicable</h2>
            <p>Le site est soumis au droit français, sous réserve des dispositions impératives éventuellement applicables.</p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}