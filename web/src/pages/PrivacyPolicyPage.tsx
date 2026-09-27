import { useEffect } from "react";
import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";
import "./LegalNoticePage.css";

const PAGE_TITLE = "Politique de confidentialité | Synapz";
const PAGE_DESCRIPTION = "Découvrez comment le service Synapz traite et protège vos données personnelles.";
const LAST_UPDATED = "22 septembre 2026";

// Obligatoire avant publication : ne pas remplacer à partir de données techniques du dépôt.
const DATA_CONTROLLER = "[À COMPLÉTER]";
const PRIVACY_CONTACT = "[CONTACT RGPD À COMPLÉTER]";

export default function PrivacyPolicyPage() {
  useEffect(() => {
    const previousTitle = document.title;
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const createdDescription = !description;
    const createdRobots = !robots;

    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }

    const previousDescription = description.content;
    const previousRobots = robots.content;
    document.title = PAGE_TITLE;
    description.content = PAGE_DESCRIPTION;
    robots.content = "noindex, follow";

    return () => {
      document.title = previousTitle;
      if (createdDescription) description.remove();
      else description.content = previousDescription;
      if (createdRobots) robots.remove();
      else robots.content = previousRobots;
    };
  }, []);

  return (
    <div className="legal-page privacy-page">
      <header className="legal-header">
        <Link className="legal-brand" to="/" aria-label="Synapz — Retour à l'accueil">
          <img src="/landing/logo-dark.png" alt="" />
          <span>SYNAPZ</span>
        </Link>
        <Link className="legal-home-link" to="/">Retour à l'accueil</Link>
      </header>

      <main className="legal-main">
        <div className="legal-heading">
          <p className="legal-kicker">Vos données personnelles</p>
          <h1>Politique de confidentialité</h1>
          <p className="legal-updated">Dernière mise à jour : {LAST_UPDATED}</p>
          <p className="privacy-intro">Cette politique décrit les traitements actuellement réalisés par Synapz, service de quiz en ligne.</p>
          <aside className="privacy-draft-notice" aria-label="Informations à compléter avant publication">
            <strong>Document à finaliser avant publication</strong>
            <p>L'identité du responsable, le contact, certaines durées et les garanties des prestataires doivent encore être renseignés ou validés.</p>
          </aside>
        </div>

        <div className="legal-content">
          <section aria-labelledby="privacy-controller">
            <h2 id="privacy-controller">1. Responsable du traitement</h2>
            <p>Synapz est le service concerné. Il n'est actuellement pas exploité par une société.</p>
            <dl className="privacy-details">
              <div><dt>Responsable du traitement</dt><dd>{DATA_CONTROLLER}</dd></div>
              <div><dt>Contact relatif aux données personnelles</dt><dd>{PRIVACY_CONTACT}</dd></div>
            </dl>
          </section>

          <section aria-labelledby="privacy-data">
            <h2 id="privacy-data">2. Données que nous traitons</h2>
            <h3>Compte</h3>
            <p>Pour un compte inscrit : adresse e-mail, pseudonyme, identifiants internes, mot de passe conservé sous forme de hash, dates de création et de mise à jour, statut de vérification de l'adresse et rôle. Une visite peut aussi créer un compte invité avec un pseudonyme aléatoire et une session, sans adresse e-mail ni mot de passe.</p>
            <h3>Profil</h3>
            <p>Pseudonyme de joueur, avatar facultatif, expérience, Bits et statistiques de jeu.</p>
            <h3>Utilisation de Synapz</h3>
            <p>Salons créés ou rejoints, parties, questions présentées, réponses données, exactitude, tentatives, temps de réponse, points, scores, classements, progression, résultats du Daily Challenge, récompenses, notifications et signalements de questions.</p>
            <h3>Données techniques et sécurité</h3>
            <p>Jeton et dates de session, adresse IP utilisée pour la sécurité et la limitation des abus, événements de jeu en temps réel, dates et heures des opérations, ainsi que journaux HTTP, de sécurité et d'erreurs.</p>
            <h3>Communications</h3>
            <p>Adresse e-mail et informations nécessaires aux e-mails de vérification d'adresse, de confirmation d'un changement d'adresse et de réinitialisation du mot de passe. Synapz n'envoie pas de newsletter marketing dans le fonctionnement actuellement audité.</p>
          </section>

          <section aria-labelledby="privacy-purposes">
            <h2 id="privacy-purposes">3. Pourquoi utilisons-nous ces données ?</h2>
            <div className="privacy-table-wrap">
              <table>
                <thead><tr><th>Finalité</th><th>Base légale envisagée</th></tr></thead>
                <tbody>
                  <tr><td>Créer et gérer les comptes, authentifier les utilisateurs, permettre de jouer, enregistrer les scores et la progression, afficher les profils et classements, et envoyer les e-mails indispensables au compte.</td><td>Exécution du service — à valider avant publication.</td></tr>
                  <tr><td>Sécuriser Synapz, limiter les abus, diagnostiquer les erreurs et examiner les signalements.</td><td>Intérêt légitime à protéger et améliorer le service — à valider avant publication.</td></tr>
                  <tr><td>Analyser automatiquement un avatar afin de détecter certains contenus problématiques et, le cas échéant, le refuser.</td><td>Intérêt légitime à protéger les utilisateurs et le service — à valider avant publication.</td></tr>
                </tbody>
              </table>
            </div>
            <p className="privacy-pending">Ces bases légales doivent faire l'objet d'une validation juridique avant la publication de cette politique.</p>
          </section>

          <section aria-labelledby="privacy-required">
            <h2 id="privacy-required">4. Données obligatoires et facultatives</h2>
            <p>L'adresse e-mail, le pseudonyme et le mot de passe sont nécessaires pour créer un compte inscrit. Sans eux, l'inscription ne peut pas aboutir. Un accès invité peut fonctionner sans adresse e-mail ni mot de passe. L'avatar est facultatif. Les données de réponses, scores et temps de réponse sont produites lorsque vous jouez et sont nécessaires au fonctionnement des parties, statistiques et classements concernés.</p>
          </section>

          <section aria-labelledby="privacy-providers">
            <h2 id="privacy-providers">5. Destinataires et prestataires</h2>
            <ul>
              <li><strong>Synapz :</strong> les données sont accessibles aux personnes habilitées à exploiter et administrer le service.</li>
              <li><strong>Hetzner Online GmbH :</strong> hébergement du service, de sa base de données et des avatars, sous réserve de confirmation de la configuration de production.</li>
              <li><strong>Resend :</strong> reçoit l'adresse e-mail et les informations nécessaires à l'envoi des seuls e-mails transactionnels décrits ci-dessus.</li>
              <li><strong>OpenAI :</strong> reçoit l'image d'avatar normalisée afin d'effectuer sa modération automatisée avant son stockage.</li>
              <li><strong>Autres utilisateurs :</strong> peuvent voir les pseudonymes, avatars, profils, scores et classements rendus visibles par les fonctionnalités de jeu.</li>
            </ul>
            <p>Aucun prestataire de paiement, de publicité ou de mesure d'audience n'est intégré au fonctionnement actuellement audité.</p>
          </section>

          <section aria-labelledby="privacy-transfers">
            <h2 id="privacy-transfers">6. Transferts hors de l'Espace économique européen</h2>
            <p>Le code du projet ne permet pas de déterminer les régions effectives de traitement utilisées par Resend et OpenAI, ni l'existence et les garanties d'éventuels transferts hors de l'Espace économique européen. Ces informations doivent être vérifiées dans les contrats et paramètres des comptes effectivement utilisés avant publication. La région effective de l'infrastructure Hetzner doit également être confirmée.</p>
          </section>

          <section aria-labelledby="privacy-retention">
            <h2 id="privacy-retention">7. Durée de conservation</h2>
            <div className="privacy-table-wrap">
              <table>
                <thead><tr><th>Catégorie</th><th>Durée ou critère actuellement défini</th></tr></thead>
                <tbody>
                  <tr><td>Session</td><td>30 jours par défaut, avec prolongation lorsque la session approche de son expiration ; révocation à la déconnexion ou après certaines opérations de sécurité.</td></tr>
                  <tr><td>Lien de vérification ou de changement d'e-mail</td><td>Validité de 24 heures. La purge de l'enregistrement après expiration ou utilisation reste à définir.</td></tr>
                  <tr><td>Lien de réinitialisation du mot de passe</td><td>Validité de 30 minutes. La purge de l'enregistrement après expiration ou utilisation reste à définir.</td></tr>
                  <tr><td>Avatar</td><td>Le fichier est remplacé lors d'un nouvel envoi. La durée et la suppression définitive restent à définir.</td></tr>
                  <tr><td>Comptes, profils, parties, réponses, progression, statistiques, signalements et journaux</td><td>À définir avant publication.</td></tr>
                  <tr><td>Sauvegardes</td><td>Stratégie et délai résiduel après suppression à vérifier avant publication.</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="privacy-security">
            <h2 id="privacy-security">8. Sécurité</h2>
            <p>Synapz met en œuvre des mesures techniques et organisationnelles visant à protéger les données, notamment le hachage des mots de passe, des contrôles d'accès, des sessions protégées et des limitations contre certains abus. Ces mesures réduisent les risques sans pouvoir garantir une sécurité absolue.</p>
          </section>

          <section aria-labelledby="privacy-rights">
            <h2 id="privacy-rights">9. Vos droits</h2>
            <p>Selon les conditions prévues par le RGPD et la base légale du traitement concerné, vous pouvez demander l'accès, la rectification ou l'effacement de vos données, la limitation d'un traitement, vous y opposer, ou demander la portabilité des données concernées. Lorsqu'un traitement repose sur votre consentement, vous pouvez le retirer sans remettre en cause les traitements antérieurs.</p>
            <p>Pour exercer vos droits : <strong>{PRIVACY_CONTACT}</strong>.</p>
            <p>Vous pouvez également introduire une réclamation auprès de la <a className="legal-external-link" href="https://www.cnil.fr/" target="_blank" rel="noopener noreferrer">CNIL <span aria-hidden="true">↗</span></a>.</p>
          </section>

          <section aria-labelledby="privacy-deletion">
            <h2 id="privacy-deletion">10. Suppression du compte</h2>
            <p>Synapz ne propose pas encore de bouton ni de procédure automatisée de suppression du compte. Une demande d'effacement doit être adressée au contact indiqué ci-dessus. Avant publication, Synapz doit rendre ce canal opérationnel et définir le sort du profil, de l'historique de jeu, des classements, des notifications et de l'avatar associés.</p>
          </section>

          <section aria-labelledby="privacy-storage">
            <h2 id="privacy-storage">11. Cookies et stockage local</h2>
            <p>Synapz utilise un cookie de session nommé <code>sid</code>, strictement nécessaire à l'authentification et à la continuité de la session. Il est inaccessible au code JavaScript de la page, limité au site et protégé lors des connexions de production.</p>
            <p>Le navigateur conserve aussi localement une référence d'avatar associée à l'identifiant du joueur afin d'actualiser son affichage. Elle peut être supprimée avec les données locales du navigateur. Aucun traceur de mesure d'audience ou de publicité n'a été identifié dans l'application auditée.</p>
          </section>

          <section aria-labelledby="privacy-minors">
            <h2 id="privacy-minors">12. Mineurs</h2>
            <p>Aucune limite d'âge, collecte de date de naissance ou procédure de consentement parental n'est actuellement définie dans Synapz. La politique relative aux mineurs doit être décidée avant le lancement ; aucune donnée supplémentaire ne sera demandée uniquement pour compléter le présent document.</p>
          </section>

          <section aria-labelledby="privacy-automation">
            <h2 id="privacy-automation">13. Modération automatisée des avatars</h2>
            <p>Lorsqu'un utilisateur envoie un avatar, l'image est redimensionnée et transmise à l'API d'OpenAI pour rechercher certains contenus problématiques. Une image signalée est automatiquement refusée et n'est pas enregistrée comme avatar. Les conditions de conservation, la région de traitement et les autres conditions applicables à l'API utilisée doivent être vérifiées avant publication. En cas de contestation, l'utilisateur pourra contacter Synapz à l'adresse indiquée ci-dessus.</p>
          </section>

          <section aria-labelledby="privacy-changes">
            <h2 id="privacy-changes">14. Modification de cette politique</h2>
            <p>Cette politique peut évoluer lorsque les fonctionnalités, traitements, prestataires ou règles applicables changent. Sa date de dernière mise à jour sera modifiée lors de tout changement significatif.</p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}