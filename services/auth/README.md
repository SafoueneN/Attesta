# Service `auth`

> Statut : **pas encore de code** ; extraction prévue en Phase 2 (socle), finalisé en 4 (RGPD). Fiche détaillée (endpoints,
> dépendances, données personnelles) écrite au moment de l'extraction.

| Élément      | Valeur                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Port (hôte)  | 4001                                                                                               |
| Base et rôle | `attesta_auth`                                                                                     |
| Décisions    | [0014](../../docs/adr/0014-authentification-jwt.md), [0019](../../docs/adr/0019-rgpd-distribue.md) |

## Périmètre

Comptes sans mot de passe (lien magique), JWT RS256 de 15 min, refresh rotatif, JWKS, jetons d'invité et de service, consentements, journal d'audit, orchestration de la suppression et de l'export RGPD.

## Code existant à extraire (sans réécriture)

`apps/web/src/accounts.ts`, `apps/web/src/account-routes.ts` (partie comptes), tables `app_user`, `login_token`, `consent_log`

## Dépendances

SMTP ; appelle chaque service sur `/internal/v1/users/{id}` (outbox RGPD)

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
