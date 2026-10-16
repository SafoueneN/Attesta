# ADR 0001 : Monolithe modulaire en TypeScript, workspaces npm

- Statut : proposé
- Date : 2026-10-16

## Contexte

Attesta comprend cinq domaines (interface, schéma, pipeline LLM, rendu PDF, veille emploi). L'équipe est réduite et le produit doit pouvoir être découpé plus tard. La stack impose Node.js 22 LTS, Express, EJS et Zod.

## Décision

1. **Monolithe modulaire** : une application `apps/web` et des paquets internes `packages/{schema,llm,render,jobwatch,shared}`, reliés par des **workspaces npm** (pas de pnpm, Nx ou Turborepo : aucun besoin démontré).
2. **TypeScript strict** (écart argumenté par rapport à un JavaScript simple) : les types sont inférés depuis les schémas Zod (`z.infer`), donc le contrat de `packages/schema` est vérifié à la compilation dans tous les modules. Coût : une étape `tsc`, sans transpileur supplémentaire.
3. Règle de dépendance : `schema` et `shared` ne dépendent de rien d'interne ; `llm`, `render` et `jobwatch` dépendent de `schema` et `shared` ; seul `apps/web` assemble. Une vérification de lint (Phase 1) interdit les imports croisés entre `llm`, `render` et `jobwatch`.
4. Les tâches lourdes (rendu Puppeteer, pipeline, veille) tournent dans un **processus worker** distinct, avec la même image mais une autre commande, et consomment la file pg-boss (ADR 0004).

## Alternatives écartées

- Microservices dès le départ : coût d'exploitation disproportionné pour une petite équipe.
- JavaScript + JSDoc : le contrat Zod partagé perd la vérification à la compilation.

## Conséquences

- Un seul dépôt, une seule CI, une image Docker avec deux commandes (`web`, `worker`).
- Le découpage futur se fait par paquet ; les frontières sont déjà matérialisées.
- Poste de développement : Node 22 requis (`.nvmrc`).
