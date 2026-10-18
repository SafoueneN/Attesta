# Service `profiles`

> Statut : **pas encore de code** ; extraction prévue en Phase 3 (service gabarit). Fiche détaillée (endpoints,
> dépendances, données personnelles) écrite au moment de l'extraction.

| Élément      | Valeur                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Port (hôte)  | 4002                                                                                               |
| Base et rôle | `attesta_profiles`                                                                                 |
| Décisions    | [0011](../../docs/adr/0011-microservices-extraction.md), [0016](../../docs/adr/0016-llm-client.md) |

## Périmètre

Profil candidat (CV source) : CRUD, versions, import d'un CV PDF avec extraction LLM validée par schéma et relecture.

## Code existant à extraire (sans réécriture)

schéma du profil (`packages/schema`), `packages/llm/src/extraction.ts`, `pdf-text-child.ts`, table `profile_version`

## Dépendances

LLM (`packages/llm-client`)

## Structure attendue

```
src/
  routes/          déclaration des routes Express et de leurs schémas
  controllers/     traduction HTTP ↔ appels de services (aucune règle métier)
  services/        règles métier, testées unitairement
  repositories/    SQL explicite, une requête par fonction
  schemas/         schémas Zod propres au service (les contrats d'échange sont dans packages/shared-schemas)
tests/             unitaires, intégration (vraie base), contrat
migrations/        SQL node-pg-migrate, joué avec le rôle du service
openapi.json       généré depuis les schémas Zod, vérifié en CI (ADR 0017)
contracts/consomme.json   opérations des autres services utilisées (ADR 0017)
Dockerfile  README.md  .env.example
```
