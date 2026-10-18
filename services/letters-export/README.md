# Service `letters-export`

> Statut : **pas encore de code** ; extraction prévue en Phase 4. Fiche détaillée (endpoints,
> dépendances, données personnelles) écrite au moment de l'extraction.

| Élément      | Valeur                                              |
| ------------ | --------------------------------------------------- |
| Port (hôte)  | 4006                                                |
| Base et rôle | `attesta_letters`                                   |
| Décisions    | [0018](../../docs/adr/0018-rendu-pdf-centralise.md) |

## Périmètre

Lettres de motivation générées à partir du profil et de l'offre (fonction nouvelle), rendu PDF unique de tous les documents (CV, lettres, rapports), aperçu HTML.

## Code existant à extraire (sans réécriture)

`packages/render` (gabarits, Puppeteer, profil seccomp)

## Dépendances

cv-generation (CV vérifié), profiles, LLM

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
