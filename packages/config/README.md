# `@attesta/config`

> Statut : **pas encore de code** ; créé en Phase 2. Décision : [0021](../../docs/adr/0021-cible-execution-et-outillage.md).

Lecture et validation Zod des variables d'environnement, échec explicite au démarrage.

Origine : `packages/shared/src/config.ts`.

Règle : **aucune logique métier** ici. Ce paquet n'importe jamais un service ; une règle ESLint le vérifie.
