# `@attesta/http-kit`

> Statut : **pas encore de code** ; créé en Phase 2. Décision : [0011](../../docs/adr/0011-microservices-extraction.md), [0012](../../docs/adr/0012-communication-entre-services.md).

Intergiciels Express communs : corrélation, format d'erreur, `/health` et `/ready`, vérification JWT, client HTTP interne, générateur OpenAPI.

Origine : `packages/shared/src/errors.ts`, `apps/web/src/security.ts` (partie générique).

Règle : **aucune logique métier** ici. Ce paquet n'importe jamais un service ; une règle ESLint le vérifie.
