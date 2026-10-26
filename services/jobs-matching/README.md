# Service `jobs-matching` : Offres et classement

Offres collées par les candidats, analysées une fois (exigences et mots-clés recopiés tels qu'écrits ; analyse sans IA en mode dégradé) ; offres collectées auprès de sources autorisées (Bundesagentur für Arbeit, Adzuna), dédupliquées par empreinte ; vecteurs BGE-M3 (pgvector, HNSW) ; métiers voisins par ESCO ; classement par fusion de rangs (RRF) du rappel lexical et vectoriel, puis rerank LLM du top 20 avec compétences manquantes **vérifiées dans l'offre**. Le profil est anonymisé avant tout calcul.

| Élément      | Valeur                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Port         | 4004 (débogueur : 9234)                                                                                                                        |
| Base et rôle | `attesta_jobs` (aucun accès à la base d'un autre service)                                                                                      |
| Contrat      | [openapi.yaml](openapi.yaml), généré depuis les schémas Zod : `npm run openapi`                                                                |
| IA           | `analyse-offre` et `rerank-offres` (prompts versionnés dans `prompts/`), budget de 4 € par mois.                                               |
| Appelle      | sources publiques (BA, Adzuna), API ESCO, TEI (vecteurs) ; aucun autre service.                                                                |
| Décisions    | [0007](../../docs/adr/0007-veille-emploi.md), [0016](../../docs/adr/0016-llm-client.md), [0026](../../docs/adr/0026-ajustements-extraction.md) |
| Responsable  | voir [CODEOWNERS](../../.github/CODEOWNERS)                                                                                                    |

## Démarrer seul

Prérequis : Node 22 (`nvm use 22.18.0`, puis `node -v`), Docker pour la base.

```bash
# 1. Base locale (depuis la racine du dépôt) : PostgreSQL + une base et un rôle par service
docker compose up -d db db-init

# 2. Dans ce dossier uniquement
cd services/jobs-matching
cp .env.example .env
npm ci
npm run dev            # http://localhost:4004/health, migrations jouées au démarrage
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

Les routes `/v1/…` sont publiques à travers la gateway sous `/api/jobs` ; les routes `/internal/…` ne sont
jamais routées par la gateway (réseau interne seulement). 🔒 : jeton exigé.

| Méthode | Chemin                              | Rôle                                                                         |
| ------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| GET     | `/health`                           | vivacité : le processus répond                                               |
| GET     | `/ready`                            | disponibilité : la base répond (503 sinon)                                   |
| POST    | `/v1/offers` 🔒                     | Enregistre une offre collée et l'analyse (exigences, mots-clés)              |
| POST    | `/v1/offers/from-posting/{id}` 🔒   | Reprend une offre collectée comme offre visée                                |
| GET     | `/v1/offers` 🔒                     | Offres enregistrées par l'utilisateur, des plus récentes aux plus anciennes  |
| GET     | `/v1/offers/{id}` 🔒                | Une offre et son analyse                                                     |
| DELETE  | `/v1/offers/{id}` 🔒                | Supprime une offre                                                           |
| GET     | `/v1/postings` 🔒                   | Recherche dans les offres collectées auprès des sources publiques            |
| GET     | `/v1/cities` 🔒                     | Suggestions de villes de plus de 15 000 habitants (GeoNames)                 |
| GET     | `/v1/admin/stats` 🔒                | Compteurs de collecte et consommation du LLM, sans donnée personnelle        |
| GET     | `/internal/v1/offers/{id}` 🔒       | Offre et analyse pour la génération (jeton relayé)                           |
| GET     | `/internal/v1/cities/resolve` 🔒    | Coordonnées d'une ville du référentiel (jeton relayé)                        |
| POST    | `/internal/v1/ingestion` 🔒         | Collecte du jour pour des critères de veille (jeton de service matching:run) |
| POST    | `/internal/v1/matching` 🔒          | Classement des offres pour un profil (jeton de service matching:run)         |
| GET     | `/internal/v1/users/{id}/export` 🔒 | Données du service pour l'export RGPD (users:export)                         |
| DELETE  | `/internal/v1/users/{id}` 🔒        | Efface les offres d'un utilisateur, idempotent (users:delete)                |

## Données personnelles (ADR 0019)

| Donnée                                               | Finalité         | Conservation                                      |
| ---------------------------------------------------- | ---------------- | ------------------------------------------------- |
| Offres collées par le candidat et leur analyse       | génération de CV | jusqu'à la suppression du compte ; invités : 24 h |
| Offres collectées (publiques)                        | veille           | 60 jours après publication                        |
| Cache ESCO, journal d'ingestion, consommation du LLM | fonctionnement   | 30 jours, 13 mois, 13 mois                        |

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
- `LLM_PROVIDER`
- `LLM_MODEL`
- `LLM_TIMEOUT_MS`
- `VERTEX_PROJECT_ID`
- `VERTEX_REGION`
- `LLM_MONTHLY_BUDGET_EUR`
- `EMBEDDINGS_PROVIDER`
- `TEI_URL`
- `ESCO_ENABLED`
- `BA_ENABLED`
- `BA_DAILY_REQUESTS`
- `ADZUNA_APP_ID`
- `ADZUNA_APP_KEY`
- `ADZUNA_DAILY_REQUESTS`
