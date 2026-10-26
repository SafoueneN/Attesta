# Service `auth` : Comptes et identité

Connexion sans mot de passe (lien magique de 15 min), JWT RS256 de 15 min publiés par JWKS, refresh token rotatif en cookie HttpOnly avec détection de réutilisation, jeton d'invité (2 h, 24 h au plus), rôles candidat et administrateur, jetons de service, orchestration RGPD : export agrégé de tous les services et suppression distribuée par outbox.

| Élément      | Valeur                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port         | 4001 (débogueur : 9231)                                                                                                                                                                         |
| Base et rôle | `attesta_auth` (aucun accès à la base d'un autre service)                                                                                                                                       |
| Contrat      | [openapi.yaml](openapi.yaml), généré depuis les schémas Zod : `npm run openapi`                                                                                                                 |
| IA           | aucun appel LLM.                                                                                                                                                                                |
| Appelle      | tous les services détenteurs de données (`/internal/v1/users/{id}` et `/export`), avec un jeton de service `users:delete` ou `users:export` signé localement ; SMTP.                            |
| Décisions    | [0014](../../docs/adr/0014-authentification-jwt.md), [0019](../../docs/adr/0019-rgpd-distribue.md), [0024](../../docs/adr/0024-roles.md), [0026](../../docs/adr/0026-ajustements-extraction.md) |
| Responsable  | voir [CODEOWNERS](../../.github/CODEOWNERS)                                                                                                                                                     |

## Démarrer seul

Prérequis : Node 22 (`nvm use 22.18.0`, puis `node -v`), Docker pour la base.

```bash
# 1. Base locale (depuis la racine du dépôt) : PostgreSQL + une base et un rôle par service
docker compose up -d db db-init

# 2. Dans ce dossier uniquement
cd services/auth
cp .env.example .env
npm ci
npm run dev            # http://localhost:4001/health, migrations jouées au démarrage
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

Les routes `/v1/…` sont publiques à travers la gateway sous `/api/auth` ; les routes `/internal/…` ne sont
jamais routées par la gateway (réseau interne seulement). 🔒 : jeton exigé.

| Méthode | Chemin                               | Rôle                                                                                            |
| ------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| GET     | `/health`                            | vivacité : le processus répond                                                                  |
| GET     | `/ready`                             | disponibilité : la base répond (503 sinon)                                                      |
| POST    | `/v1/login-links`                    | Envoie un lien de connexion à usage unique (réponse identique que le compte existe ou non)      |
| GET     | `/v1/login-links/{token}`            | Adresse masquée visée par un lien, sans le consommer                                            |
| POST    | `/v1/session`                        | Consomme le lien ; jeton d'accès dans le corps, refresh token en cookie HttpOnly                |
| POST    | `/v1/session/refresh`                | Nouveau jeton d'accès (rotation du refresh token, ou renouvellement de l'invité)                |
| POST    | `/v1/session/guest`                  | Jeton d'invité pour le parcours sans compte (2 h, 24 h au plus)                                 |
| DELETE  | `/v1/session`                        | Déconnexion : révocation de la famille de refresh tokens                                        |
| GET     | `/v1/me` 🔒                          | Compte connecté et historique des consentements                                                 |
| PUT     | `/v1/me/consents` 🔒                 | Accorde ou retire le consentement aux communications                                            |
| GET     | `/v1/me/export` 🔒                   | Export JSON de toutes les données du compte, agrégé depuis chaque service (RGPD, art. 15 et 20) |
| DELETE  | `/v1/me` 🔒                          | Suppression définitive du compte, propagée à tous les services (RGPD, art. 17)                  |
| GET     | `/.well-known/jwks.json`             | Clés publiques de vérification des jetons (JWKS)                                                |
| GET     | `/v1/admin/stats` 🔒                 | Compteurs de comptes et de l'outbox RGPD, sans donnée personnelle                               |
| POST    | `/internal/v1/token`                 | Jeton de service de 5 min (interne, jamais routé par la gateway)                                |
| GET     | `/internal/v1/users/{id}/contact` 🔒 | Adresse d'envoi d'un compte (jeton de service users:contact)                                    |

## Données personnelles (ADR 0019)

| Donnée                                                | Finalité                 | Conservation                                                |
| ----------------------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| Adresse e-mail, rôle, dates de création et d'activité | connexion, envoi du lien | jusqu'à la suppression du compte, ou 18 mois sans connexion |
| Empreinte du lien de connexion (SHA-256)              | connexion                | 15 minutes                                                  |
| Empreintes des refresh tokens                         | session                  | 7 jours d'inactivité, 30 jours au plus                      |
| Journal de consentement (IP en HMAC)                  | preuve du consentement   | jusqu'à la suppression du compte                            |
| Audit (type d'événement, date, identifiant)           | traçabilité RGPD         | 13 mois, sans adresse ni IP                                 |

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
- `APP_BASE_URL`
- `SMTP_URL`
- `MAIL_FROM`
- `AUTH_PRIVATE_KEY`
- `AUTH_KEY_ID`
- `ADMIN_EMAILS`
- `IP_HASH_SECRET`
- `COOKIE_PATH`
- `COOKIE_SECURE`
- `SERVICE_SECRET_JOB_WATCH`
- `PROFILES_URL`
- `CV_GENERATION_URL`
- `JOBS_MATCHING_URL`
- `JOB_WATCH_URL`
- `LETTERS_EXPORT_URL`
