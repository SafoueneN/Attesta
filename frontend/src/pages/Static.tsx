import { Link } from "react-router";
import { PageHeader, useDocumentTitle } from "../components/ui";
import { LEGAL } from "../lib/legal";
import { ContactEmail, LegalArticle } from "./Legal";

export function NotFound() {
  useDocumentTitle("Page introuvable");
  return (
    <div className="mx-auto max-w-xl text-center">
      <PageHeader title="Page introuvable" lead="Cette adresse ne correspond à aucune page d'Attesta." />
      <Link to="/" className="link">
        Revenir à l'accueil
      </Link>
    </div>
  );
}

export function Forbidden() {
  useDocumentTitle("Accès refusé");
  return (
    <div className="mx-auto max-w-xl text-center">
      <PageHeader title="Accès refusé" lead="Cette page est réservée aux administrateurs." />
      <Link to="/" className="link">
        Revenir à l'accueil
      </Link>
    </div>
  );
}

export function Privacy() {
  return (
    <LegalArticle
      title="Politique de confidentialité"
      sections={[
        [
          "Responsable du traitement",
          [
            <>
              {LEGAL.publisher}, éditeur d'Attesta (voir les{" "}
              <Link to="/mentions-legales" className="link">
                mentions légales
              </Link>
              ). Contact pour toute question ou demande relative à vos données : <ContactEmail />.
            </>,
          ],
        ],
        [
          "Ce que nous traitons, et pourquoi",
          [
            "Votre profil (parcours, compétences, coordonnées que vous choisissez d'indiquer), les offres que vous collez, les CV ciblés et lettres générés : pour vous fournir le service que vous demandez (exécution des conditions d'utilisation).",
            "Selon le pays visé, et seulement si vous les indiquez : photo d'identité, date de naissance, nationalité, autorisation de travail. La photo et les pièces justificatives sont chiffrées et ne sont jamais envoyées à l'IA.",
            "Votre compte repose sur un identifiant et un mot de passe, conservé sous forme d'empreinte (scrypt), jamais en clair. Aucune adresse e-mail n'est demandée pour le créer.",
            "Veille emploi : vos critères et l'adresse e-mail de réception, utilisés uniquement pour vous envoyer les rapports et les rappels, sur la base de votre consentement, que vous pouvez retirer à tout moment par le lien de désabonnement présent dans chaque e-mail.",
            "Sécurité : une empreinte de votre adresse IP, jamais l'adresse elle-même, pour limiter les abus (intérêt légitime).",
          ],
        ],
        [
          "Intelligence artificielle",
          [
            "La reformulation est faite par un modèle Claude (Anthropic) exécuté sur Google Cloud Vertex AI, dans l'Union européenne. Le modèle ne reçoit ni votre nom, ni vos coordonnées, ni vos employeurs : seulement les faits à reformuler, numérotés. Vos données ne servent pas à entraîner de modèle.",
            "Chaque ligne produite est contrôlée par du code, sans IA : une ligne qui ne renvoie pas à votre profil est retirée avant affichage. Aucune décision vous concernant n'est prise de façon automatisée.",
          ],
        ],
        [
          "Destinataires",
          [
            `Vos données ne sont ni vendues ni partagées à des fins publicitaires. Elles sont traitées par nos seuls sous-traitants techniques, liés par un contrat conforme à l'article 28 du RGPD : l'hébergeur et le fournisseur d'IA (${LEGAL.host.name}, ${LEGAL.host.region}), et le prestataire d'envoi des e-mails de veille.`,
            "Un CV que vous partagez par lien en ligne est visible de toute personne qui détient ce lien, jusqu'à ce que vous le révoquiez.",
          ],
        ],
        [
          "Transferts hors de l'Union européenne",
          [
            "Aucun : en production, le service et l'IA sont configurés pour ne traiter vos données que dans l'Union européenne.",
          ],
        ],
        [
          "Durées de conservation",
          [
            "Sans compte : données effacées 24 heures après votre arrivée.",
            "Avec un compte : jusqu'à sa suppression, ou 18 mois sans connexion. Les PDF ne sont jamais conservés.",
            "Offres collectées : 60 jours après leur publication. Journal des événements du compte : 13 mois.",
          ],
        ],
        [
          "Cookies",
          [
            "Attesta n'utilise que des cookies techniques indispensables (maintien de la session, parcours sans compte), exemptés de consentement. Aucun cookie publicitaire ni de mesure d'audience.",
          ],
        ],
        [
          "Vos droits",
          [
            "Depuis votre compte, vous pouvez exporter toutes vos données (fichier JSON) et supprimer définitivement votre compte, avec effet sur tous nos services.",
            <>
              Vous disposez aussi des droits d'accès, de rectification, d'effacement, de limitation, de
              portabilité et d'opposition, et du droit de retirer votre consentement : écrivez à{" "}
              <ContactEmail />. Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la
              CNIL (
              <a href="https://www.cnil.fr" className="link" target="_blank" rel="noreferrer">
                cnil.fr
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
              ).
            </>,
          ],
        ],
      ]}
    />
  );
}
