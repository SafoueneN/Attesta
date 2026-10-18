# Service `auth` : Comptes et authentification

Comptes sans mot de passe (lien magique), JWT RS256 de 15 min, refresh rotatif, JWKS, jetons d'invité et de service, rôles candidat et administrateur, consentements, journal d'audit, orchestration de la suppression et de l'export RGPD.

| Élément      | Valeur                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port         | 4001 (débogueur : 9231)                                                                                                                                                                         |
| Base et rôle | `attesta_auth` (aucun accès à la base d'un autre service)                                                                                                                                       |
| Contrat      | [openapi.yaml](openapi.yaml), généré par `npm run openapi`                                                                                                                                      |
| Décisions    | [0014](../../docs/adr/0014-authentification-jwt.md), [0019](../../docs/adr/0019-rgpd-distribue.md), [0024](../../docs/adr/0024-roles.md), [0023](../../docs/adr/0023-autonomie-des-services.md) |
| Responsable  | voir [CODEOWNERS](../../.github/CODEOWNERS)                                                                                                                                                     |

> **État** : socle autonome en place (configuration validée, journaux, `/health`, `/ready`, erreurs au
> format commun, Dockerfile). Le code métier est extrait du monolithe en Phase M2, sans réécriture.

## Démarrer seul

Prérequis : Node 22 (`nvm use 22.18.0`, puis `node -v`), Docker pour la base.

```bash
# 1. Base locale (depuis la racine du dépôt) : PostgreSQL + une base et un rôle par service
docker compose up -d db db-init

# 2. Dans ce dossier uniquement
cd services/auth
cp .env.example .env
npm ci
npm run dev            # http://localhost:4001/health, rechargement à chaud
```

Aucune installation à la racine n'est nécessaire : les paquets partagés (`packages/logger`,
`packages/config`, `packages/http-kit`) sont copiés depuis leur version compilée
([ADR 0025](../../docs/adr/0025-paquets-partages-compiles.md)).

## Commandes

| Commande                | Effet                                                   |
| ----------------------- | ------------------------------------------------------- |
| `npm run dev`           | serveur avec rechargement à chaud, lit `.env`           |
| `npm test`              | tests Vitest (sans base : dépendances simulées)         |
| `npm run test:coverage` | tests et couverture (seuil : 80 % des lignes de `src/`) |
| `npm run typecheck`     | TypeScript strict, sources et tests                     |
| `npm run build`         | compilation dans `dist/`                                |
| `npm start`             | exécute `dist/server.js` (lit `.env` s'il existe)       |
| `npm run openapi`       | régénère `openapi.yaml` après un changement de route    |

Avec Docker : `docker compose up auth` depuis la racine, ou
`docker build -f services/auth/Dockerfile -t attesta/auth .`.

## Endpoints

| Méthode | Chemin    | Rôle                                       |
| ------- | --------- | ------------------------------------------ |
| GET     | `/health` | vivacité : le processus répond             |
| GET     | `/ready`  | disponibilité : la base répond (503 sinon) |

Les routes métier sont ajoutées dans `src/routes.ts` (liste `operations` pour l'OpenAPI).

## Variables d'environnement

| Variable       | Obligatoire | Défaut        | Rôle                                        |
| -------------- | ----------- | ------------- | ------------------------------------------- |
| `DATABASE_URL` | oui         |               | base `attesta_auth` avec le rôle du service |
| `PORT`         | non         | 4001          | port d'écoute                               |
| `NODE_ENV`     | non         | `development` | `development`, `test` ou `production`       |
| `LOG_LEVEL`    | non         | `info`        | niveau des journaux JSON                    |
| `TRUST_PROXY`  | non         | `0`           | proxys de confiance devant le service       |

Une variable invalide arrête le service au démarrage, avec la liste des variables en cause (jamais leur
valeur).

## Structure

```
src/
  server.ts      point d'entrée : configuration, journaux, base, écoute, arrêt propre
  app.ts         application Express (sans écoute), testée avec supertest
  config.ts      variables d'environnement (Zod)
  db.ts          pool PostgreSQL de la base du service
  routes.ts      routes métier et leur description OpenAPI
  openapi.ts     contrat généré
tests/           Vitest : application, configuration, contrat
scripts/         régénération de openapi.yaml
Dockerfile       image non-root, HEALTHCHECK sur /ready
```

## Code existant à extraire (sans réécriture)

`apps/web/src/accounts.ts`, `apps/web/src/account-routes.ts` (partie comptes), tables `app_user`, `login_token`, `consent_log`

## Dépendances

SMTP ; appelle chaque service sur `/internal/v1/users/{id}` (outbox RGPD)
