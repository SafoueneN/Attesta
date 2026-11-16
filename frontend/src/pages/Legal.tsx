import type { ReactNode } from "react";
import { Link } from "react-router";
import { PageHeader, useDocumentTitle } from "../components/ui";
import { LEGAL } from "../lib/legal";

/** Adresse de contact cliquable (fournie au build). */
export function ContactEmail() {
  return (
    <a href={`mailto:${LEGAL.contactEmail}`} className="link">
      {LEGAL.contactEmail}
    </a>
  );
}

/** Page de texte juridique : titre, version, puis sections. */
export function LegalArticle({ title, sections }: { title: string; sections: [string, ReactNode[]][] }) {
  useDocumentTitle(title);
  return (
    <article className="mx-auto max-w-3xl">
      <PageHeader title={title} lead={`Version du ${LEGAL.version}.`} />
      <div className="space-y-8">
        {sections.map(([heading, paragraphs]) => (
          <section key={heading}>
            <h2 className="text-xl font-bold">{heading}</h2>
            {paragraphs.map((p, i) => (
              <p key={i} className="mt-2 text-ink-muted">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}

export function LegalNotice() {
  return (
    <LegalArticle
      title="Mentions légales"
      sections={[
        [
          "Éditeur",
          [
            <>
              Attesta est édité par {LEGAL.publisher}, personne physique, à titre non professionnel. Directeur
              de la publication : {LEGAL.publisher}.
            </>,
            <>
              Contact : <ContactEmail />.
            </>,
          ],
        ],
        [
          "Hébergement",
          [
            `${LEGAL.host.name}, ${LEGAL.host.address}. Données hébergées dans l'Union européenne, ${LEGAL.host.region}.`,
          ],
        ],
        [
          "Propriété intellectuelle",
          [
            <>
              Le code source d'Attesta est publié sous licence MIT. Les contenus que vous saisissez (profil,
              CV, lettres) restent les vôtres ; voir les{" "}
              <Link to="/conditions" className="link">
                conditions générales d'utilisation
              </Link>
              .
            </>,
            "Les offres d'emploi affichées proviennent de sources tierces (services publics de l'emploi et agrégateurs) ; elles restent la propriété de leurs auteurs et renvoient à leur annonce d'origine.",
          ],
        ],
        [
          "Données personnelles",
          [
            <>
              Le traitement de vos données est décrit dans la{" "}
              <Link to="/confidentialite" className="link">
                politique de confidentialité
              </Link>
              .
            </>,
          ],
        ],
      ]}
    />
  );
}

export function Terms() {
  return (
    <LegalArticle
      title="Conditions générales d'utilisation"
      sections={[
        [
          "Objet",
          [
            "Attesta aide à rédiger des CV et des lettres ciblés pour une offre d'emploi, à partir des seules informations de votre profil. Les présentes conditions s'appliquent à toute utilisation du service, avec ou sans compte. Utiliser le service vaut acceptation de ces conditions.",
          ],
        ],
        [
          "Accès au service",
          [
            "Le service est gratuit pendant la phase de lancement. Il est fourni en l'état, sans garantie de disponibilité permanente : il peut être interrompu pour maintenance, mise à jour ou incident.",
            "Le parcours sans compte conserve vos données 24 heures. Le compte repose sur un identifiant et un mot de passe, sans adresse e-mail : vous êtes seul responsable de la confidentialité de votre mot de passe et de vos codes de récupération. Sans eux, le compte ne peut pas être récupéré.",
          ],
        ],
        [
          "Vos engagements",
          [
            "Vous ne saisissez que des informations exactes vous concernant, ou celles d'une personne qui vous a autorisé à le faire. Vous restez responsable des documents que vous envoyez aux recruteurs : relisez chaque CV et chaque lettre avant de l'utiliser.",
            "Sont interdits : l'extraction automatisée des contenus ou des offres, le contournement des limites d'usage, toute tentative d'accès aux données d'autrui, et l'usage du service pour produire des documents trompeurs.",
          ],
        ],
        [
          "Intelligence artificielle et fidélité",
          [
            "Les reformulations sont proposées par un modèle d'IA, puis contrôlées par du code : une ligne qui ne renvoie pas à votre profil est retirée, et une compétence demandée par l'offre mais absente de votre profil est signalée, jamais ajoutée. Ce contrôle réduit fortement le risque d'erreur sans l'annuler : la relecture finale vous appartient.",
            "Attesta ne garantit ni l'obtention d'un entretien ni celle d'un emploi.",
          ],
        ],
        [
          "Vos contenus",
          [
            "Vous restez propriétaire de vos contenus. Vous accordez à l'éditeur le seul droit de les traiter pour vous rendre le service (stockage, génération, export, envoi de la veille), pendant la durée de conservation prévue par la politique de confidentialité. Vous pouvez les exporter et les supprimer à tout moment depuis votre compte.",
          ],
        ],
        [
          "Offres d'emploi tierces",
          [
            "Les offres proviennent de sources externes. L'éditeur ne vérifie pas leur contenu et n'est pas partie à la relation entre candidat et employeur. Signalez une offre frauduleuse à l'adresse de contact.",
          ],
        ],
        [
          "Responsabilité",
          [
            "Dans les limites permises par la loi, la responsabilité de l'éditeur ne peut être engagée pour les dommages indirects, la perte de données due à la perte de vos identifiants, ni l'usage que vous faites des documents produits.",
          ],
        ],
        [
          "Suspension et fin",
          [
            "L'éditeur peut suspendre un compte qui ne respecte pas ces conditions. Vous pouvez supprimer votre compte à tout moment ; la suppression est définitive et s'étend à tous nos services. Un compte sans connexion pendant 18 mois est supprimé.",
          ],
        ],
        [
          "Modification et droit applicable",
          [
            "Ces conditions peuvent évoluer ; la version en vigueur et sa date figurent sur cette page. Elles sont régies par le droit français. En cas de litige, une solution amiable est recherchée avant toute action ; à défaut, les tribunaux français sont compétents, sous réserve des règles protectrices du consommateur.",
            <>
              Contact : <ContactEmail />.
            </>,
          ],
        ],
      ]}
    />
  );
}
