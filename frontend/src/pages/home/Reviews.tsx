import { REVIEWS } from "../../lib/offer";

/**
 * Avis d'utilisateurs (ADR 0045) : uniquement de vrais avis, publiés avec l'accord écrit de leur auteur
 * (`lib/offer.ts`). Sans avis, la section n'apparaît pas : aucun témoignage n'est inventé.
 */
export function Reviews() {
  if (REVIEWS.length === 0) return null;
  return (
    <section aria-labelledby="avis" className="py-16">
      <h2 id="avis" className="text-3xl font-extrabold tracking-tight">
        Ils ont ciblé leur CV avec Attesta
      </h2>
      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {REVIEWS.map((r) => (
          <li key={`${r.author}-${r.consentDate}`} className="card space-y-3">
            <blockquote className="text-lg">« {r.text} »</blockquote>
            <p className="text-sm text-ink-muted">
              <b className="text-ink">{r.author}</b> · {r.role}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
