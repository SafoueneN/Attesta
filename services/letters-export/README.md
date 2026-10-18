# Service `letters-export` : Lettres et export PDF

Lettres de motivation générées à partir du profil et de l'offre (fonction nouvelle), rendu PDF unique de tous les documents (CV, lettres, rapports), aperçu HTML.

| Élément      | Valeur                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Port         | 4006 (débogueur : 9236)                                                                                    |
| Base et rôle | `attesta_letters` (aucun accès à la base d'un autre service)                                               |
| Contrat      | [openapi.yaml](openapi.yaml), généré par `npm run openapi`                                                 |
| Décisions    | [0018](../../docs/adr/0018-rendu-pdf-centralise.md), [0023](../../docs/adr/0023-autonomie-des-services.md) |
| Responsable  | voir [CODEOWNERS](../../.github/CODEOWNERS)                                                                |

> **État** : socle autonome en place (configuration validée, journaux, `/health`, `/ready`, erreurs au
> format commun, Dockerfile). Le code métier est extrait du monolithe en Phase M4, sans réécriture.

## Démarrer seul

Prérequis : Node 22 (`nvm use 22.18.0`, puis `node -v`), Docker pour la base.

```bash
# 1. Base locale (depuis la racine du dépôt) : PostgreSQL + une base et un rôle par service
docker compose up -d db db-init

# 2. Dans ce dossier uniquement
cd services/letters-export
cp .env.example .env
npm ci
npm run dev            # http://localhost:4006/health, rechargement à chaud
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

Avec Docker : `docker compose up letters-export` depuis la racine, ou
`docker build -f services/letters-export/Dockerfile -t attesta/letters-export .`.

## Endpoints

| Méthode | Chemin    | Rôle                                       |
| ------- | --------- | ------------------------------------------ |
| GET     | `/health` | vivacité : le processus répond             |
| GET     | `/ready`  | disponibilité : la base répond (503 sinon) |

Les routes métier sont ajoutées dans `src/routes.ts` (liste `operations` pour l'OpenAPI).

## Variables d'environnement

| Variable       | Obligatoire | Défaut        | Rôle                                           |
| -------------- | ----------- | ------------- | ---------------------------------------------- |
| `DATABASE_URL` | oui         |               | base `attesta_letters` avec le rôle du service |
| `PORT`         | non         | 4006          | port d'écoute                                  |
| `NODE_ENV`     | non         | `development` | `development`, `test` ou `production`          |
| `LOG_LEVEL`    | non         | `info`        | niveau des journaux JSON                       |
| `TRUST_PROXY`  | non         | `0`           | proxys de confiance devant le service          |

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

`packages/render` (gabarits, Puppeteer, profil seccomp)

## Dépendances

cv-generation (CV vérifié), profiles, LLM
