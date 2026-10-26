# Service `profiles` : Profil candidat

Profil candidat versionné (une version par enregistrement, aucune si rien ne change), contrat Zod `Profile` de `packages/shared-schemas`, import d'un CV PDF : texte extrait dans un processus enfant borné (mémoire, CPU, délai), puis extraction par Claude et **ancrage** dans le texte du PDF (tout élément absent du PDF est écarté). Rien n'est enregistré sans la relecture du candidat.

| Élément      | Valeur                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port         | 4002 (débogueur : 9232)                                                                                                                                   |
| Base et rôle | `attesta_profiles` (aucun accès à la base d'un autre service)                                                                                             |
| Contrat      | [openapi.yaml](openapi.yaml), généré depuis les schémas Zod : `npm run openapi`                                                                           |
| IA           | `extraction-cv` (prompt `prompts/extraction-cv/v1.md`), budget de 2 € par mois ; indisponible en mode démonstration.                                      |
| Appelle      | aucun service ; LLM.                                                                                                                                      |
| Décisions    | [0011](../../docs/adr/0011-microservices-extraction.md), [0016](../../docs/adr/0016-llm-client.md), [0023](../../docs/adr/0023-autonomie-des-services.md) |
| Responsable  | voir [CODEOWNERS](../../.github/CODEOWNERS)                                                                                                               |

## Démarrer seul

Prérequis : Node 22 (`nvm use 22.18.0`, puis `node -v`), Docker pour la base.

```bash
# 1. Base locale (depuis la racine du dépôt) : PostgreSQL + une base et un rôle par service
docker compose up -d db db-init

# 2. Dans ce dossier uniquement
cd services/profiles
cp .env.example .env
npm ci
npm run dev            # http://localhost:4002/health, migrations jouées au démarrage
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

Les routes `/v1/…` sont publiques à travers la gateway sous `/api/profiles` ; les routes `/internal/…` ne sont
jamais routées par la gateway (réseau interne seulement). 🔒 : jeton exigé.

| Méthode | Chemin                                  | Rôle                                                                                     |
| ------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET     | `/health`                               | vivacité : le processus répond                                                           |
| GET     | `/ready`                                | disponibilité : la base répond (503 sinon)                                               |
| GET     | `/v1/profiles/me` 🔒                    | Dernière version du profil de l'utilisateur (candidat ou invité)                         |
| PUT     | `/v1/profiles/me` 🔒                    | Enregistre une nouvelle version du profil (aucune si rien n'a changé)                    |
| DELETE  | `/v1/profiles/me` 🔒                    | Efface toutes les versions du profil                                                     |
| GET     | `/v1/profiles/me/versions` 🔒           | Historique des versions du profil                                                        |
| GET     | `/v1/profiles/me/versions/{version}` 🔒 | Une version passée du profil                                                             |
| POST    | `/v1/profiles/import` 🔒                | Pré-remplit un profil depuis un CV PDF (multipart, champ « cv ») ; rien n'est enregistré |
| GET     | `/v1/admin/stats` 🔒                    | Compteurs et consommation du LLM, sans donnée personnelle                                |
| GET     | `/internal/v1/profiles/me` 🔒           | Profil de l'utilisateur du jeton relayé (cv-generation, letters-export)                  |
| GET     | `/internal/v1/users/{id}/profile` 🔒    | Profil d'un utilisateur (jeton de service profiles:read, veille quotidienne)             |
| GET     | `/internal/v1/users/{id}/export` 🔒     | Données du service pour l'export RGPD (jeton de service users:export)                    |
| DELETE  | `/internal/v1/users/{id}` 🔒            | Efface les données d'un utilisateur, idempotent (jeton de service users:delete)          |

## Données personnelles (ADR 0019)

| Donnée                                                                           | Finalité                     | Conservation                                                                 |
| -------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| Profil complet (identité, coordonnées, parcours, compétences)                    | source unique du CV          | jusqu'à la suppression du compte ; invités : 24 h                            |
| Consommation du LLM (étape, jetons, coût)                                        | budget                       | 13 mois, sans contenu ni utilisateur                                         |
| Pièces justificatives (fichier chiffré AES-256-GCM, nature, nom, élément appuyé) | appuyer le profil (ADR 0027) | jusqu'à leur suppression, à celle du profil ou du compte ; comptes seulement |

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
