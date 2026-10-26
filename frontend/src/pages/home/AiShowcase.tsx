import { useState } from "react";
import { Link } from "react-router";
import { ArrowBadge, buttonClass, WITH_ARROW } from "../../components/ui";

/*
 * Vitrine des assistants sur l'accueil : pour quatre d'entre eux, un « avant / après » sur un exemple fictif.
 * Rien n'est appelé : c'est une démonstration de ce que fait chaque assistant, pas une réponse de l'IA.
 */

const DEMOS = [
  {
    label: "Juge de fidélité",
    name: "le juge",
    before: "« Pilotage de la clôture mensuelle pour l'ensemble du groupe »",
    beforeNote: "Votre source dit : « Participation à la clôture de la filiale ».",
    after: "« Participation à la clôture mensuelle de la filiale »",
    afterNote: "Reformulation proposée, contrôlée, appliquée en un clic.",
  },
  {
    label: "Conseillère ATS",
    name: "la conseillère",
    before: "Excel et Sage sont dans votre profil, mais pas dans ce CV : le logiciel ne les voit pas.",
    beforeNote: "Lisibilité : 50 %.",
    after: "Résumé : « Outils : Sage, Excel », recopié de votre profil avec sa source.",
    afterNote: "Lisibilité : 100 %, sans rien inventer.",
  },
  {
    label: "Coach d'entretien",
    name: "le coach",
    before: "« J'ai amélioré la clôture. »",
    beforeNote: "Méthode STAR : 1 sur 4.",
    after:
      "« La clôture prenait trois semaines. J'ai mis en place un rapprochement mensuel : 10 jours gagnés. »",
    afterNote: "STAR : 4 sur 4, relance du recruteur préparée.",
  },
  {
    label: "Intervieweuse",
    name: "l'intervieweuse",
    before: "« Saisie et révision des comptes »",
    beforeNote: "Une réalisation sans chiffre ni résultat.",
    after: "« Révision de 60 dossiers clients par an, sans retard de dépôt »",
    afterNote: "Chiffres tirés de votre réponse, ajoutés seulement après votre coche.",
  },
];

export function AiShowcase() {
  const [i, setI] = useState(0);
  const d = DEMOS[i]!;
  return (
    <section aria-labelledby="vitrine-ia" className="py-20 lg:py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-3xl">
          <p className="eyebrow">Six assistants · une règle</p>
          <h2
            id="vitrine-ia"
            className="mt-3 text-4xl font-extrabold tracking-tight text-balance lg:text-6xl"
          >
            L'IA travaille pour vous. Elle n'invente jamais à votre place.
          </h2>
        </div>
        <Link to="/assistants" className={`${buttonClass("primary", "lg")} ${WITH_ARROW}`}>
          Découvrir le Studio IA
          <ArrowBadge />
        </Link>
      </div>
      <div className="mt-10 flex flex-wrap gap-2" role="tablist" aria-label="Exemples d'assistants">
        {DEMOS.map((x, j) => (
          <button
            key={x.label}
            type="button"
            role="tab"
            aria-selected={j === i}
            onClick={() => setI(j)}
            className={`rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${j === i ? "bg-accent text-on-accent" : "border border-line text-ink-muted hover:text-ink"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div key={i} role="tabpanel" aria-label={d.label} className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="showcase-before rounded-[2rem] border border-line bg-surface p-8">
          <p className="text-xs font-extrabold tracking-[0.1em] text-ink-subtle uppercase">Avant</p>
          <p className="mt-4 text-2xl leading-snug text-ink-muted">{d.before}</p>
          <p className="mt-6 text-sm text-ink-subtle">{d.beforeNote}</p>
        </div>
        <div className="showcase-after relative rounded-[2rem] bg-accent-soft p-8 ring-2 ring-accent">
          <span className="verdict-stamp absolute top-6 right-6 rounded-lg border-[3px] border-proved px-3 py-1 text-xs font-black tracking-[0.12em] text-proved uppercase">
            Sourcé
          </span>
          <p className="text-xs font-extrabold tracking-[0.1em] text-accent-text uppercase">Avec {d.name}</p>
          <p className="mt-4 text-2xl leading-snug font-bold">{d.after}</p>
          <p className="mt-6 text-sm text-ink-muted">{d.afterNote}</p>
        </div>
      </div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["0", "compétence inventée"],
          ["100 %", "des lignes reliées à une source"],
          ["6", "assistants, du profil à l'entretien"],
          ["1 clic", "pour valider ou refuser une proposition"],
        ].map(([v, l]) => (
          <div key={l} className="card p-5">
            <dt className="sr-only">{l}</dt>
            <dd className="text-3xl font-extrabold text-accent-text">{v}</dd>
            <dd className="text-sm text-ink-muted">{l}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
