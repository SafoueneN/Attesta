# Architecture d'Attesta

Statut : Phase 0, proposition à valider. Les décisions détaillées figurent dans [adr/](adr/README.md).

## Vue d'ensemble

```mermaid
flowchart LR
  U[Candidat · navigateur] -->|HTTPS, formulaires, SSE| W[apps/web<br/>Express + EJS]
  W -->|enqueue| Q[(PostgreSQL<br/>pg-boss + pgvector)]
  K[worker<br/>même image] -->|consomme| Q
  K --> L[packages/llm<br/>pipeline 4 étapes]
  K --> R[packages/render<br/>Puppeteer]
  K --> J[packages/jobwatch<br/>ingestion · matching · rapports]
  L -->|API| P[(Fournisseur LLM<br/>UE)]
  J -->|API| S[(BA · Adzuna · Jooble · France Travail)]
  J -->|SMTP/API| E[(SES Francfort / Brevo)]
  L & R & J & W --> SC[packages/schema<br/>Zod]
```

- `apps/web` : routes, sessions, CSRF, vues EJS, endpoint SSE de progression, `/health`.
- `worker` : pipeline LLM, rendu PDF et veille. Il est séparé pour isoler Chromium et les appels longs du serveur HTTP.
- La génération est mise en file même en mode anonyme, ce qui donne idempotence, quotas et reprise. Le web s'abonne à la progression du job et la relaie en SSE (via `LISTEN/NOTIFY` de PostgreSQL).

## Flux de génération d'un CV

```mermaid
sequenceDiagram
  participant N as Navigateur
  participant W as Web
  participant K as Worker
  participant M as LLM
  N->>W: POST /cv/generate (profil validé, offre)
  W->>W: Zod + quota + CSRF
  W->>K: job generate-cv (singletonKey = hash)
  W-->>N: 202 + URL SSE
  K->>M: 2. analyse offre (cache)
  K-->>N: SSE « Analyse de l'offre terminée »
  K->>M: 3. rédaction ciblée (≤2 relances schéma)
  K->>K: 4. contrôle fidélité (déterministe)
  K-->>N: SSE « CV prêt · fidélité 96 % »
  N->>W: relecture + corrections + case « j'ai relu »
  N->>W: POST /cv/export
  W->>K: job render-pdf
  K-->>N: PDF (même HTML que l'aperçu)
```

## Modèle de données (ERD)

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

Logs pino JSON sans PII. Métriques Prometheus : latence par étape du pipeline, taux de rejet du schéma, score de fidélité moyen, coût LLM par CV, taux de mode dégradé, durée de rendu PDF, taux de plaintes e-mail.
