import { Link } from "react-router";
import { PageHeader, useDocumentTitle } from "../components/ui";

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

const SECTIONS: [string, string[]][] = [
  [
    "Ce que nous traitons",
    [
      "Votre profil (parcours, compétences, coordonnées que vous choisissez d'indiquer), les offres que vous collez, les CV ciblés et lettres générés, et, si vous l'activez, vos critères de veille emploi.",
      "Votre adresse e-mail sert uniquement à vous connecter et à vous envoyer la veille que vous avez confirmée.",
    ],
  ],
  [
    "Intelligence artificielle",
    [
      "La reformulation est faite par un modèle Claude, traité dans l'Union européenne. Le modèle ne reçoit ni votre nom, ni vos coordonnées, ni vos employeurs : seulement les faits à reformuler, numérotés.",
      "Chaque ligne produite est contrôlée par du code, sans IA : une ligne qui ne renvoie pas à votre profil est retirée avant affichage.",
    ],
  ],
  [
    "Durées de conservation",
    [
      "Sans compte : données effacées 24 heures après votre arrivée.",
      "Avec un compte : jusqu'à sa suppression, ou 18 mois sans connexion. Les PDF ne sont jamais conservés.",
      "Offres collectées : 60 jours après leur publication. Journaux techniques : 13 mois, sans donnée personnelle.",
    ],
  ],
  [
    "Vos droits",
    [
      "Depuis votre compte, vous pouvez exporter toutes vos données (fichier JSON) et supprimer définitivement votre compte, avec effet sur tous nos services.",
      "Chaque e-mail de veille contient un lien de désabonnement en un clic.",
    ],
  ],
];

export function Privacy() {
  useDocumentTitle("Confidentialité");
  return (
    <article className="mx-auto max-w-3xl">
      <PageHeader title="Politique de confidentialité" lead="Version du 18 octobre 2026." />
      <div className="space-y-8">
        {SECTIONS.map(([title, paragraphs]) => (
          <section key={title}>
            <h2 className="text-xl font-bold">{title}</h2>
            {paragraphs.map((p) => (
              <p key={p} className="mt-2 text-slate-700 dark:text-slate-300">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
