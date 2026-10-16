# Architecture d'Attesta

Statut : à jour à la fin de la Phase 3 (2026-10-16). Décisions détaillées : [adr/](adr/README.md).

## Vue d'ensemble

```mermaid
flowchart LR
  U[Candidat · navigateur] -->|HTTPS, formulaires, SSE| W
  subgraph CR[Cloud Run · europe-west9]
    W[apps/web<br/>Express 5 + EJS]
    W --> L[packages/llm<br/>pipeline, contrôle de fidélité]
    W --> R[packages/render<br/>gabarit unique + Chromium sandboxé]
    W --> T[worker_thread<br/>analyse PDF bornée]
  end
  W --> DB[(Cloud SQL PostgreSQL 16<br/>sessions · quotas · compteurs · coûts)]
  L -->|identité du service, sans clé| V[(Vertex AI région eu<br/>Claude)]
  L & R & W --> SC[packages/schema<br/>contrat Zod]
  GH[GitHub Actions] -->|WIF, sans clé| AR[(Artifact Registry)]
  GH -->|deploy.sh : révision, test de fumée, paliers| CR
```

- **Un seul service** (`apps/web`) sert les pages, la génération (avec progression SSE), l'aperçu et l'export PDF. Il n'y a pas de worker séparé ([ADR 0009](adr/0009-hebergement-et-execution.md)) : Chromium est un processus à part et borné, et l'analyse des PDF importés tourne dans un `worker_thread` avec délai et plafond mémoire.
- **Sans état local** : sessions, verrou et quota d'IA, limiteur de requêtes et coûts sont dans PostgreSQL, avec des mises à jour atomiques. Le service peut donc tourner sur plusieurs instances.
- **pg-boss** arrivera en Phase 4 pour la veille planifiée (`packages/jobwatch`).

## Flux de génération d'un CV

```mermaid
sequenceDiagram
  participant N as Navigateur
  participant W as Web (Cloud Run)
  participant DB as PostgreSQL
  participant M as Claude (Vertex eu)
  N->>W: GET /cv/generer/flux?jeton=… (ou POST /cv/generer sans JS)
  W->>DB: jeton consommé, verrou + quota réservés (atomique)
  W->>M: analyse de l'offre (cache par empreinte)
  W-->>N: SSE « Offre analysée »
  W->>M: rédaction à partir des faits numérotés (≤ 2 relances)
  W->>W: contrôle de fidélité déterministe, retrait des lignes non prouvées
  W->>DB: session rechargée ; abandon si effacée ou profil modifié
  W-->>N: SSE « done »
  N->>W: relecture ligne par ligne, corrections, case « j'ai relu »
  N->>W: POST /cv/etape/5 → PDF (même HTML que l'aperçu)
```

## Modèle de données (ERD)

Modèle **cible**. Tables en place à la fin de la Phase 3 : `session`, `ia_quota`, `rate_limit`, `llm_usage`. Les autres (comptes, générations conservées, veille) arrivent en Phase 4 avec leur usage.

```mermaid
erDiagram
  app_user ||--o{ consent_log : "consent"
  app_user ||--o{ profile : "possède"
  profile ||--o{ profile_version : "versions"
  app_user ||--o{ job_offer_input : "colle"
  profile_version ||--o{ cv_generation : "source"
  job_offer_input ||--o{ cv_generation : "cible"
  cv_generation ||--o{ cv_line_trace : "lignes"
  cv_generation ||--|| faithfulness_report : "contrôle"
  cv_generation ||--o{ export : "exports"
  cv_generation ||--o{ llm_usage : "coût"
  job_source ||--o{ job_posting : "fournit"
  job_posting ||--|| job_embedding : "vecteur"
  app_user ||--o{ watch_subscription : "abonne"
  watch_subscription ||--o{ match_result : "résultats"
  job_posting ||--o{ match_result : "classée"
  watch_subscription ||--o{ report : "quotidien"
  report ||--o{ email_delivery : "envoi"

  app_user {
    uuid id PK
    citext email UK
    timestamptz email_verified_at
    timestamptz last_active_at
    timestamptz created_at
  }
  consent_log {
    bigint id PK
    uuid user_id FK
    text purpose "service|veille|promo"
    bool granted
    text policy_version
    timestamptz at
    text ip_hash
  }
  profile {
    uuid id PK
    uuid user_id FK
    uuid current_version_id FK
  }
  profile_version {
    uuid id PK
    uuid profile_id FK
    int version
    jsonb data "Profile Zod"
    text schema_version
    timestamptz created_at
  }
  job_offer_input {
    uuid id PK
    uuid user_id FK
    text raw_text
    bytea text_hash
    jsonb analysis "OfferAnalysis"
    text prompt_version
  }
  cv_generation {
    uuid id PK
    uuid profile_version_id FK
    uuid offer_id FK
    jsonb tailored "TailoredCv"
    text status
    text prompt_version
    text model
    bool degraded_mode
    timestamptz reviewed_at
  }
  cv_line_trace {
    bigint id PK
    uuid generation_id FK
    text cv_path
    text text
    text_array sources
    text status
  }
  faithfulness_report {
    uuid generation_id PK
    numeric score
    int checked
    int supported
    jsonb details
  }
  export {
    uuid id PK
    uuid generation_id FK
    text variant "ats|design"
    text storage_key
    timestamptz expires_at
  }
  llm_usage {
    bigint id PK
    uuid generation_id FK
    text step
    text model
    int input_tokens
    int output_tokens
    numeric cost_eur
    int latency_ms
    int attempt
    bool schema_valid
  }
  job_source {
    text id PK
    text name
    jsonb terms "quota, attribution"
    timestamptz last_run_at
  }
  job_posting {
    uuid id PK
    text source_id FK
    text external_id
    text title
    text company
    text city
    geography location
    text lang
    text contract
    date posted_at
    text url
    text body
    bytea fingerprint UK
    tsvector tsv
    text_array esco_occupations
  }
  job_embedding {
    uuid posting_id PK
    vector_1024 embedding
    text model
  }
  watch_subscription {
    uuid id PK
    uuid user_id FK
    uuid profile_version_id FK
    jsonb filters
    text status
    timestamptz confirmed_at
    text unsubscribe_token UK
  }
  match_result {
    bigint id PK
    uuid subscription_id FK
    uuid posting_id FK
    date run_date
    numeric rrf_score
    numeric rerank_score
    jsonb breakdown
    jsonb missing_skills
  }
  report {
    uuid id PK
    uuid subscription_id FK
    date run_date
    text kind "offres|ameliorations"
    text storage_key
  }
  email_delivery {
    uuid id PK
    uuid subscription_id FK
    date run_date
    text provider_message_id
    text status
    timestamptz sent_at
  }
```

En mode anonyme, `profile_version`, `job_offer_input` et `cv_generation` sont stockés avec `user_id` nul et `expires_at` à 2 h. Une tâche de purge pg-boss tourne toutes les 15 minutes (ADR 0006).

### Index prévus

| Table           | Index                                                     | Usage              |
| --------------- | --------------------------------------------------------- | ------------------ |
| `job_posting`   | GIN sur `tsv`                                             | recherche lexicale |
| `job_posting`   | GiST sur `location`, B-tree `(lang, contract, posted_at)` | filtres durs       |
| `job_posting`   | UNIQUE `fingerprint`, UNIQUE `(source_id, external_id)`   | déduplication      |
| `job_embedding` | HNSW `vector_cosine_ops` (m = 16, ef_construction = 64)   | rappel sémantique  |
| `match_result`  | UNIQUE `(subscription_id, posting_id, run_date)`          | idempotence        |
| `report`        | UNIQUE `(subscription_id, run_date, kind)`                | idempotence        |
| `*`             | B-tree sur `expires_at`, `last_active_at`                 | purge              |

### Rétention

| Donnée                                  | Durée                                                           |
| --------------------------------------- | --------------------------------------------------------------- |
| Session anonyme et générations anonymes | 2 h d'inactivité                                                |
| PDF exporté                             | servi puis supprimé ; 24 h maximum                              |
| Compte inactif                          | 12 mois, prévenance à 11 mois                                   |
| `job_posting`                           | 60 jours après `posted_at`                                      |
| `consent_log`                           | durée du compte + 5 ans (preuve du consentement, **à valider**) |
| `llm_usage`                             | 13 mois, sans contenu                                           |

## Observabilité

- **Journaux** pino en JSON, au format Cloud Logging (`severity`, `message`), sans aucune donnée personnelle. Événements métier : `generation` (statut, raison, score, coût, durée, tentatives), `llm_usage` (jetons, coût, latence), `pdf_export` (durée).
- **Métriques** : tirées des journaux par Terraform (générations par statut, score de fidélité, coût par CV, durée de génération), plus les métriques natives de Cloud Run (latence, 5xx, instances). Pas d'exposition Prometheus : Cloud Run n'en a pas besoin.
- **Alertes** : service injoignable, erreurs 5xx, IA en mode dégradé (voir [runbook](runbook.md#surveillance-et-alertes)).
- **Coûts** : table `llm_usage` (13 mois).

Le taux de plaintes e-mail sera ajouté avec la veille (Phase 4).
