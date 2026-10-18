# Service `job-watch`

> Statut : **pas encore de code** ; extraction prévue en Phase 4. Fiche détaillée (endpoints,
> dépendances, données personnelles) écrite au moment de l'extraction.

| Élément      | Valeur                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Port (hôte)  | 4005                                                                                               |
| Base et rôle | `attesta_watch`                                                                                    |
| Décisions    | [0010](../../docs/adr/0010-veille-comptes-envoi.md), [0019](../../docs/adr/0019-rgpd-distribue.md) |

## Périmètre

Veille emploi : abonnements, consentement, double opt-in, désabonnement en un clic, exécution quotidienne (pg-boss), deux rapports PDF par e-mail.

## Code existant à extraire (sans réécriture)

`packages/jobwatch/src/{daily,mail,anonymize,gaps,usage}.ts`, `apps/worker`, routes `/veille`, tables `watch_subscription`, `match_result`, `email_delivery`, `email_event`

## Dépendances

jobs-matching (classement), letters-export (rapports PDF), SMTP

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
