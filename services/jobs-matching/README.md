# Service `jobs-matching`

> Statut : **pas encore de code** ; extraction prévue en Phase 4. Fiche détaillée (endpoints,
> dépendances, données personnelles) écrite au moment de l'extraction.

| Élément      | Valeur                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Port (hôte)  | 4004                                                                                              |
| Base et rôle | `attesta_jobs`                                                                                    |
| Décisions    | [0007](../../docs/adr/0007-veille-emploi.md), [0013](../../docs/adr/0013-une-base-par-service.md) |

## Périmètre

Offres saisies et collectées (BA Jobsuche, Adzuna), analyse d'offre, ESCO, vecteurs (pgvector), recherche hybride, fusion RRF, rerank LLM.

## Code existant à extraire (sans réécriture)

`packages/jobwatch/src/{sources,esco,embeddings,matching,ranking,geo,text}`, `packages/llm/src/rerank.ts`, tables `job_posting`, `job_embedding`, `esco_cache`, `job_source_run`

## Dépendances

sources publiques, TEI (optionnel), LLM

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
