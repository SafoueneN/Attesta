# Service `job-watch` : Veille emploi

Abonnements (métiers, ville résolue, rayon, temps de travail), double opt-in par e-mail, désabonnement en un clic (RFC 8058), exécution quotidienne sous verrou consultatif, idempotente (un e-mail par abonné et par jour, jamais deux fois la même offre, jamais d'e-mail vide), rapports PDF (offres et points à améliorer), webhook du fournisseur d'e-mail (plaintes, rebonds), journal des exécutions et lancement manuel par l'administrateur.

| Élément      | Valeur                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port         | 4005 (débogueur : 9235)                                                                                                                                                               |
| Base et rôle | `attesta_watch` (aucun accès à la base d'un autre service)                                                                                                                            |
| Contrat      | [openapi.yaml](openapi.yaml), généré depuis les schémas Zod : `npm run openapi`                                                                                                       |
| IA           | aucun appel direct (le rerank est fait par `jobs-matching`).                                                                                                                          |
| Appelle      | `auth` (adresse d'envoi, `users:contact`), `profiles` (`profiles:read`), `jobs-matching` (`matching:run`), `letters-export` (`reports:render`), tous avec un jeton de service ; SMTP. |
| Décisions    | [0010](../../docs/adr/0010-veille-comptes-envoi.md), [0019](../../docs/adr/0019-rgpd-distribue.md), [0026](../../docs/adr/0026-ajustements-extraction.md)                             |
| Responsable  | voir [CODEOWNERS](../../.github/CODEOWNERS)                                                                                                                                           |

## Démarrer seul

Prérequis : Node 22 (`nvm use 22.18.0`, puis `node -v`), Docker pour la base.

```bash
# 1. Base locale (depuis la racine du dépôt) : PostgreSQL + une base et un rôle par service
docker compose up -d db db-init

# 2. Dans ce dossier uniquement
cd services/job-watch
cp .env.example .env
npm ci
npm run dev            # http://localhost:4005/health, migrations jouées au démarrage
```

Aucune installation à la racine n'est nécessaire : les paquets partagés sont copiés depuis leur version
compilée ([ADR 0025](../../docs/adr/0025-paquets-partages-compiles.md)). Les jetons sont vérifiés par le
JWKS d'`auth` (`AUTH_JWKS_URL`) : démarrez `auth` aussi, ou toute la pile avec `docker compose --profile full up`.

## Commandes

| Commande                | Effet                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | serveur avec rechargement à chaud, lit `.env`                                                            |
| `npm test`              | tests Vitest ; ceux d'intégration créent puis suppriment une base PostgreSQL jetable (ignorés sans base) |
| `npm run test:coverage` | tests et couverture (seuil : 80 % des lignes de `src/`)                                                  |
| `npm run typecheck`     | TypeScript strict, sources et tests                                                                      |
| `npm run build`         | compilation dans `dist/`                                                                                 |
| `npm run migrate`       | migrations seules (`migrations/*.sql`)                                                                   |
| `npm run openapi`       | régénère `openapi.yaml` après un changement de route                                                     |

## Endpoints

Les routes `/v1/…` sont publiques à travers la gateway sous `/api/watch` ; les routes `/internal/…` ne sont
jamais routées par la gateway (réseau interne seulement). 🔒 : jeton exigé.

| Méthode | Chemin                                  | Rôle                                                                                  |
| ------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| GET     | `/health`                               | vivacité : le processus répond                                                        |
| GET     | `/ready`                                | disponibilité : la base répond (503 sinon)                                            |
| GET     | `/v1/subscriptions/me` 🔒               | Abonnement à la veille de l'utilisateur connecté                                      |
| PUT     | `/v1/subscriptions/me` 🔒               | Crée ou modifie la veille ; double opt-in par e-mail tant qu'elle n'est pas confirmée |
| DELETE  | `/v1/subscriptions/me` 🔒               | Arrête la veille (retrait du consentement journalisé)                                 |
| GET     | `/v1/subscriptions/me/matches` 🔒       | Offres envoyées par la veille ces 30 derniers jours                                   |
| POST    | `/v1/subscriptions/confirm/{token}`     | Confirmation de la veille (double opt-in), par le jeton du lien                       |
| POST    | `/v1/subscriptions/unsubscribe/{token}` | Désabonnement en un clic (RFC 8058), par le jeton du lien                             |
| POST    | `/v1/webhooks/brevo`                    | Plaintes, rebonds et désabonnements signalés par le fournisseur d'e-mail              |
| GET     | `/v1/admin/stats` 🔒                    | Compteurs de la veille, sans donnée personnelle                                       |
| GET     | `/v1/admin/runs` 🔒                     | Dernières exécutions de la veille et leur bilan                                       |
| POST    | `/v1/admin/runs` 🔒                     | Lance l'exécution du jour maintenant (idempotente)                                    |
| GET     | `/internal/v1/users/{id}/export` 🔒     | Données du service pour l'export RGPD (users:export)                                  |
| DELETE  | `/internal/v1/users/{id}` 🔒            | Efface la veille d'un utilisateur, idempotent (users:delete)                          |

## Données personnelles (ADR 0019)

| Donnée                                                                               | Finalité                | Conservation                                               |
| ------------------------------------------------------------------------------------ | ----------------------- | ---------------------------------------------------------- |
| Critères de veille, statut, jetons de confirmation (haché) et de désabonnement       | veille                  | jusqu'à la suppression du compte ; non confirmée : 7 jours |
| Adresse de réception choisie (vide : adresse du compte), confirmée par double opt-in | envoi de la veille      | jusqu'à la suppression de la veille ou du compte           |
| Journal du consentement à la veille                                                  | preuve du double opt-in | jusqu'à la suppression du compte                           |
| Offres proposées (instantané), envois                                                | rapport, déduplication  | jusqu'à la suppression du compte                           |
| Compteur de plaintes et rebonds, exécutions                                          | délivrabilité           | 13 mois, sans adresse                                      |

Aucun journal ne contient d'e-mail, de nom, de texte de CV, d'offre ou de prompt (masquage par `packages/logger`).
L'export (`/internal/v1/users/{id}/export`) et l'effacement idempotent (`DELETE /internal/v1/users/{id}`)
sont appelés par `auth` avec un jeton de service.

## Variables d'environnement

Toutes sont validées au démarrage ; une variable invalide arrête le service avec son nom (jamais sa valeur).
Modèle : [.env.example](.env.example).

- `NODE_ENV`
- `PORT`
- `LOG_LEVEL`
- `TRUST_PROXY`
- `DATABASE_URL`
- `MIGRATE_ON_START`
- `AUTH_JWKS_URL`
- `AUTH_URL`
- `PROFILES_URL`
- `JOBS_MATCHING_URL`
- `LETTERS_EXPORT_URL`
- `SERVICE_SECRET`
- `APP_BASE_URL`
- `SMTP_URL`
- `MAIL_FROM`
- `IP_HASH_SECRET`
- `BREVO_WEBHOOK_TOKEN`
- `DAILY_RUN_ENABLED`
- `DAILY_RUN_HOUR`
