# Service `letters-export` : Lettres et export PDF

Lettres de motivation (**fonction nouvelle**) rédigées à partir des seules lignes vérifiées du CV ciblé, en trois tons ; chaque paragraphe est soumis au contrôle de fidélité de `cv-generation` et retiré s'il n'est pas prouvé. Seul service à embarquer Chromium : rendu PDF du CV (ciblé et vérifié, ou non adapté), des lettres et des rapports de veille, file bornée (503 au-delà), aperçu HTML identique au PDF. Aucun PDF n'est stocké.

| Élément      | Valeur                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port         | 4006 (débogueur : 9236)                                                                                                                               |
| Base et rôle | `attesta_letters` (aucun accès à la base d'un autre service)                                                                                          |
| Contrat      | [openapi.yaml](openapi.yaml), généré depuis les schémas Zod : `npm run openapi`                                                                       |
| IA           | `lettre` (prompt `prompts/lettre/v1.md`), budget de 5 € par mois ; en démonstration, lettre composée des lignes vérifiées recopiées.                  |
| Appelle      | `cv-generation` (CV vérifié et contrôle des paragraphes) et `profiles`, avec le jeton de l'utilisateur relayé.                                        |
| Décisions    | [0018](../../docs/adr/0018-rendu-pdf-centralise.md), [0016](../../docs/adr/0016-llm-client.md), [0026](../../docs/adr/0026-ajustements-extraction.md) |
| Responsable  | voir [CODEOWNERS](../../.github/CODEOWNERS)                                                                                                           |

## Démarrer seul

Prérequis : Node 22 (`nvm use 22.18.0`, puis `node -v`), Docker pour la base.

```bash
# 1. Base locale (depuis la racine du dépôt) : PostgreSQL + une base et un rôle par service
docker compose up -d db db-init

# 2. Dans ce dossier uniquement
cd services/letters-export
cp .env.example .env
npm ci
npm run dev            # http://localhost:4006/health, migrations jouées au démarrage
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

Les routes `/v1/…` sont publiques à travers la gateway sous `/api/letters` ; les routes `/internal/…` ne sont
jamais routées par la gateway (réseau interne seulement). 🔒 : jeton exigé.

| Méthode | Chemin                              | Rôle                                                                                      |
| ------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| GET     | `/health`                           | vivacité : le processus répond                                                            |
| GET     | `/ready`                            | disponibilité : la base répond (503 sinon)                                                |
| POST    | `/v1/letters` 🔒                    | Rédige une lettre de motivation à partir d'un CV vérifié ; chaque paragraphe est contrôlé |
| GET     | `/v1/letters` 🔒                    | Lettres de l'utilisateur                                                                  |
| GET     | `/v1/letters/{id}` 🔒               | Une lettre et le contrôle de chaque paragraphe                                            |
| PUT     | `/v1/letters/{id}` 🔒               | Modifie la lettre ; les paragraphes sont recontrôlés, les écarts signalés                 |
| DELETE  | `/v1/letters/{id}` 🔒               | Supprime une lettre                                                                       |
| POST    | `/v1/letters/{id}/pdf` 🔒           | PDF de la lettre, produit à la demande et jamais stocké                                   |
| POST    | `/v1/exports/cv` 🔒                 | PDF du CV : ciblé (génération vérifiée) ou non adapté (profil enregistré)                 |
| POST    | `/v1/exports/cv/preview` 🔒         | HTML exact du PDF, pour l'aperçu (sans script, sans ressource externe)                    |
| GET     | `/v1/admin/stats` 🔒                | Compteurs et consommation du LLM, sans donnée personnelle                                 |
| POST    | `/internal/v1/reports/offers` 🔒    | PDF du rapport des offres de la veille (jeton de service reports:render)                  |
| POST    | `/internal/v1/reports/gaps` 🔒      | PDF du rapport des points à améliorer (jeton de service reports:render)                   |
| GET     | `/internal/v1/users/{id}/export` 🔒 | Données du service pour l'export RGPD (users:export)                                      |
| DELETE  | `/internal/v1/users/{id}` 🔒        | Efface les lettres d'un utilisateur, idempotent (users:delete)                            |

## Données personnelles (ADR 0019)

| Donnée                                            | Finalité    | Conservation                                      |
| ------------------------------------------------- | ----------- | ------------------------------------------------- |
| Lettres (texte, sources, contrôle par paragraphe) | candidature | jusqu'à la suppression du compte ; invités : 24 h |
| Consommation du LLM                               | budget      | 13 mois, sans contenu                             |

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
- `CV_GENERATION_URL`
- `PROFILES_URL`
- `LLM_PROVIDER`
- `LLM_MODEL`
- `LLM_TIMEOUT_MS`
- `VERTEX_PROJECT_ID`
- `VERTEX_REGION`
- `LLM_MONTHLY_BUDGET_EUR`
- `PUPPETEER_EXECUTABLE_PATH`
- `PDF_MAX_CONCURRENCY`
- `PDF_TIMEOUT_MS`
- `PDF_NO_SANDBOX`
