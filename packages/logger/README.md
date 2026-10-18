# `@attesta/logger`

> Statut : **pas encore de code** ; créé en Phase 2. Décision : [0020](../../docs/adr/0020-observabilite.md).

Journaux pino au format commun, masquage des données personnelles, `requestId` depuis le contexte.

Origine : `packages/shared/src/logger.ts`.

Règle : **aucune logique métier** ici. Ce paquet n'importe jamais un service ; une règle ESLint le vérifie.
