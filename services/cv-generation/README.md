# Service `cv-generation`

> Statut : **pas encore de code** ; extraction prévue en Phase 4. Fiche détaillée (endpoints,
> dépendances, données personnelles) écrite au moment de l'extraction.

| Élément      | Valeur                                                                                 |
| ------------ | -------------------------------------------------------------------------------------- |
| Port (hôte)  | 4003                                                                                   |
| Base et rôle | `attesta_cvgen`                                                                        |
| Décisions    | [0003](../../docs/adr/0003-pipeline-llm.md), [0016](../../docs/adr/0016-llm-client.md) |

## Périmètre

CV ciblé par offre : analyse, rédaction à partir des seuls faits du profil, contrôle de fidélité déterministe avant tout affichage, traçabilité ligne par ligne, corrections, progression SSE, quotas.

## Code existant à extraire (sans réécriture)

`packages/llm/src/{pipeline,faithfulness,facts}.ts`, `apps/web/src/generation.ts`, `ia-routes.ts`

## Dépendances

profiles, jobs-matching (jeton relayé), LLM

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
