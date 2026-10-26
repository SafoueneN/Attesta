# Service `cv-generation` : Génération de CV ciblés

Rédaction ciblée à partir des seuls faits numérotés du profil (ni nom, ni coordonnées, ni employeur envoyés au modèle), validation par le contrat strict avec deux relances bornées, puis **contrôle de fidélité déterministe** avant tout affichage : chiffres, dates, entités, titres, compétences absentes. Les lignes non prouvées sont retirées et tracées avec leurs raisons. Corrections du candidat avec révision (aucun écrasement entre onglets), quota quotidien, progression en SSE, mode dégradé sur toute panne. Seul un CV vérifié sort du service.

| Élément      | Valeur                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port         | 4003 (débogueur : 9233)                                                                                                                                                                            |
| Base et rôle | `attesta_cvgen` (aucun accès à la base d'un autre service)                                                                                                                                         |
| Contrat      | [openapi.yaml](openapi.yaml), généré depuis les schémas Zod : `npm run openapi`                                                                                                                    |
| IA           | `redaction` (prompt `prompts/redaction/v1.md`), budget de 9 € par mois, 0,50 $ au plus par CV ; en démonstration, les faits sont recopiés sans reformulation.                                      |
| Appelle      | `profiles` et `jobs-matching` avec le jeton de l'utilisateur relayé.                                                                                                                               |
| Décisions    | [0003](../../docs/adr/0003-pipeline-llm.md), [0016](../../docs/adr/0016-llm-client.md), [0018](../../docs/adr/0018-rendu-pdf-centralise.md), [0026](../../docs/adr/0026-ajustements-extraction.md) |
| Responsable  | voir [CODEOWNERS](../../.github/CODEOWNERS)                                                                                                                                                        |

## Démarrer seul

Prérequis : Node 22 (`nvm use 22.18.0`, puis `node -v`), Docker pour la base.

```bash
# 1. Base locale (depuis la racine du dépôt) : PostgreSQL + une base et un rôle par service
docker compose up -d db db-init

# 2. Dans ce dossier uniquement
cd services/cv-generation
cp .env.example .env
npm ci
npm run dev            # http://localhost:4003/health, migrations jouées au démarrage
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

Les routes `/v1/…` sont publiques à travers la gateway sous `/api/cv` ; les routes `/internal/…` ne sont
jamais routées par la gateway (réseau interne seulement). 🔒 : jeton exigé.

| Méthode | Chemin                                   | Rôle                                                                                                           |
| ------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET     | `/health`                                | vivacité : le processus répond                                                                                 |
| GET     | `/ready`                                 | disponibilité : la base répond (503 sinon)                                                                     |
| POST    | `/v1/generations` 🔒                     | Génère un CV ciblé pour une offre ; avec « Accept: text/event-stream », progression en SSE puis événement done |
| GET     | `/v1/generations` 🔒                     | Historique des générations                                                                                     |
| GET     | `/v1/generations/{id}` 🔒                | Génération, rapport de fidélité et trace des lignes écartées                                                   |
| PATCH   | `/v1/generations/{id}/lines` 🔒          | Corrections du candidat (texte modifié ou ligne retirée) ; le score est recalculé                              |
| DELETE  | `/v1/generations/{id}` 🔒                | Supprime une génération                                                                                        |
| GET     | `/v1/admin/stats` 🔒                     | Compteurs, score moyen de fidélité et consommation du LLM, sans donnée personnelle                             |
| GET     | `/internal/v1/generations/{id}` 🔒       | CV vérifié pour l'export et les lettres (jeton relayé) ; refusé s'il n'est pas vérifié                         |
| POST    | `/internal/v1/generations/{id}/check` 🔒 | Contrôle de fidélité de lignes libres (paragraphes d'une lettre) contre le profil de la génération             |
| GET     | `/internal/v1/users/{id}/export` 🔒      | Données du service pour l'export RGPD (users:export)                                                           |
| DELETE  | `/internal/v1/users/{id}` 🔒             | Efface les générations d'un utilisateur, idempotent (users:delete)                                             |

## Données personnelles (ADR 0019)

| Donnée                                                                         | Finalité            | Conservation                                      |
| ------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------- |
| Instantané du profil et de l'offre, CV ciblé, rapport de fidélité, corrections | relecture et export | jusqu'à la suppression du compte ; invités : 24 h |
| Quota quotidien (sujet en HMAC)                                                | limitation          | 2 jours                                           |
| Consommation du LLM                                                            | budget              | 13 mois, sans contenu                             |

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
- `PROFILES_URL`
- `JOBS_MATCHING_URL`
- `LLM_PROVIDER`
- `LLM_MODEL`
- `LLM_TIMEOUT_MS`
- `VERTEX_PROJECT_ID`
- `VERTEX_REGION`
- `LLM_MONTHLY_BUDGET_EUR`
- `MAX_COST_PER_CV_USD`
- `DAILY_QUOTA`
- `QUOTA_SECRET`
