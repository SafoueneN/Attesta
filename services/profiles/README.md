# Service `profiles` : Profil candidat

Profil candidat (CV source) : CRUD, versions, import d'un CV PDF avec extraction LLM validée par schéma et relecture.

| Élément      | Valeur                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port         | 4002 (débogueur : 9232)                                                                                                                                   |
| Base et rôle | `attesta_profiles` (aucun accès à la base d'un autre service)                                                                                             |
| Contrat      | [openapi.yaml](openapi.yaml), généré par `npm run openapi`                                                                                                |
| Décisions    | [0011](../../docs/adr/0011-microservices-extraction.md), [0016](../../docs/adr/0016-llm-client.md), [0023](../../docs/adr/0023-autonomie-des-services.md) |
| Responsable  | voir [CODEOWNERS](../../.github/CODEOWNERS)                                                                                                               |

> **État** : socle autonome en place (configuration validée, journaux, `/health`, `/ready`, erreurs au
> format commun, Dockerfile). Le code métier est extrait du monolithe en Phase M3 (service gabarit), sans réécriture.

## Démarrer seul

Prérequis : Node 22 (`nvm use 22.18.0`, puis `node -v`), Docker pour la base.

```bash
# 1. Base locale (depuis la racine du dépôt) : PostgreSQL + une base et un rôle par service
docker compose up -d db db-init

# 2. Dans ce dossier uniquement
cd services/profiles
cp .env.example .env
npm ci
npm run dev            # http://localhost:4002/health, rechargement à chaud
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

Avec Docker : `docker compose up profiles` depuis la racine, ou
`docker build -f services/profiles/Dockerfile -t attesta/profiles .`.

## Endpoints

| Méthode | Chemin    | Rôle                                       |
| ------- | --------- | ------------------------------------------ |
| GET     | `/health` | vivacité : le processus répond             |
| GET     | `/ready`  | disponibilité : la base répond (503 sinon) |

Les routes métier sont ajoutées dans `src/routes.ts` (liste `operations` pour l'OpenAPI).

## Variables d'environnement

| Variable       | Obligatoire | Défaut        | Rôle                                            |
| -------------- | ----------- | ------------- | ----------------------------------------------- |
| `DATABASE_URL` | oui         |               | base `attesta_profiles` avec le rôle du service |
| `PORT`         | non         | 4002          | port d'écoute                                   |
| `NODE_ENV`     | non         | `development` | `development`, `test` ou `production`           |
| `LOG_LEVEL`    | non         | `info`        | niveau des journaux JSON                        |
| `TRUST_PROXY`  | non         | `0`           | proxys de confiance devant le service           |

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

schéma du profil (`packages/schema`), `packages/llm/src/extraction.ts`, `pdf-text-child.ts`, table `profile_version`

## Dépendances

LLM (`packages/llm-client`)
