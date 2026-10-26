import { Link } from "react-router";
import { ArrowBadge, buttonClass, PageHeader, useDocumentTitle, WITH_ARROW } from "../components/ui";
import { FEATURES, PLANS } from "../lib/offer";

/**
 * Tarifs (ADR 0045). Tant qu'aucune formule n'est décidée (`PLANS` vide), la page dit la vérité : tout est
 * gratuit pendant le lancement. Les formules s'affichent dès qu'elles sont renseignées dans `lib/offer.ts`.
 */
export function Pricing() {
  useDocumentTitle("Tarifs");
  if (PLANS.length === 0)
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <PageHeader
          title="Gratuit pendant le lancement"
          lead="Toutes les fonctionnalités d'Attesta sont ouvertes sans frais pendant la phase de lancement. Les éventuelles formules payantes seront annoncées ici à l'avance ; rien ne vous sera facturé sans votre accord."
        />
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">Inclus aujourd'hui</h2>
          <ul className="space-y-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden="true" className="font-bold text-proved">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        </section>
        <Link to="/connexion" className={`${buttonClass("primary", "lg")} ${WITH_ARROW}`}>
          Créer mon compte
          <ArrowBadge />
        </Link>
      </div>
    );
  return (
    <div className="space-y-8">
      <PageHeader
        title="Tarifs"
        lead="Choisissez la formule qui vous convient ; vous pouvez changer à tout moment."
      />
      <ul className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <li key={p.name} className={`card space-y-3 ${p.highlighted ? "ring-2 ring-accent" : ""}`}>
            <h2 className="text-xl font-bold">{p.name}</h2>
            <p className="text-3xl font-extrabold">{p.price}</p>
            <ul className="space-y-1 text-sm">
              {p.features.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
