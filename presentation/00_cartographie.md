# Cartographie du dépôt Attesta par membre

> Phase 1 du dossier de présentation. Document établi par lecture du code (branche `chore/phase-2-socle`).
> Répartition validée le 2026-10-26 (noms fournis par l'équipe ; autres choix délégués). Fiches : `membre_X_<nom>.md`.

## 0. Constats préalables

- **`git log --author` ne permet pas de répartir le travail** : les 32 commits du dépôt ont tous le même
  auteur (`SafoueneN`). La répartition ci-dessous est donc **proposée à partir du découpage du code**, pas
  de l'historique.
- Le dépôt compte **6 microservices** (`services/*`), ce qui donne un découpage naturel : **un service par
  membre**. La gateway, le frontend React, les paquets partagés, `compose.yaml` et la CI/CD sont répartis
  ou rangés dans la partie commune.
- Le monolithe d'origine (`apps/web`, `apps/worker`, `packages/llm`, `packages/render`…) est encore présent
  et lancé par `compose.yaml` (services `web`, `migrate`, `veille`) ; c'est la référence de la suite de
  parité `e2e/parite` (ADR 0011).
- Tous les services sont en **TypeScript / Node 22 / Express 5 / PostgreSQL (`pg`) / Zod 4**, testés avec
  **Vitest** (+ tests de mutation **Stryker**, `stryker.config.json`).
- Toute l'IA passe par **`packages/llm-client`** (SDK `@anthropic-ai/sdk` ^0.135.0 et
  `@anthropic-ai/vertex-sdk` ^0.21.0) ; modèle par défaut lu dans les `config.ts` : `claude-opus-5-5`
  (variable `LLM_MODEL`, surcharges par étape `LLM_STEP_MODELS`).

## 1. Répartition proposée

| Membre | Module (service) | Entité CRUD | Fonctionnalité avancée | Assistant IA |
|---|---|---|---|---|
| 1. Yassine Trigui | Utilisateurs et sécurité — `services/auth` + `gateway` | `app_user` (compte) | Authentification JWT signée, publiée par JWKS ; rôles ; jetons de rafraîchissement ; codes de récupération ; gateway avec liste blanche | Aucun appel LLM dans `auth` → retenu : le client LLM commun `packages/llm-client` (fournisseurs, coût, budget mensuel) |
| 2. Safouene Saassouki | Profils — `services/profiles` | `profile_version` (profil versionné) | Import de CV (PDF/texte) : extraction par règles + LLM, pièces justificatives, photo | Extraction de CV (`extraction-cv`) et coach d'entretien de profil (`entretien-profil`, `faits-reponse`) |
| 3. Ali Riahi | Génération de CV — `services/cv-generation` | `generation` (CV généré) | Pipeline de génération en flux SSE avec **contrôle de fidélité** (chaque ligne pointe vers sa source) | Rédaction (`redaction`) + juge de fidélité (`juge-fidelite`) ; assistants : coach, ATS, traduction, plan de progression |
| 4. Ahmed Chaouch | Offres et correspondance — `services/jobs-matching` | `user_offer` (offre saisie) | Ingestion multi-sources (Adzuna, Arbeitnow, BA, Jooble, RSS, employeurs) et classement hybride (plein texte `tsvector` + vecteurs pgvector) | Analyse d'offre (`analyse-offre`) et explication de correspondance (`explication-correspondance`) ; le reclassement est présenté par le membre 6 |
| 5. Neila Jribi | Lettres et exports — `services/letters-export` | `cover_letter` (lettre) | Rendu PDF/DOCX/HTML (Puppeteer + EJS, modèles de CV), CV en ligne partagé, suivi des candidatures | Lettre (`lettre`), message recruteur, réponse à formulaire, traduction de lettre |
| 6. Ghassen Bougache | Veille emploi — `services/job-watch` | `watch_subscription` (abonnement) + `reminder` | Veille quotidienne : collecte, classement, envoi d’un e-mail par jour, désabonnement en un clic (RFC 8058), webhook Brevo, rapports PDF (offres, écarts de compétences) | Aucun appel LLM direct dans `job-watch` → retenu : la correspondance sémantique qu'il déclenche via `/internal/v1/matching` (embeddings BGE-M3/TEI + pgvector, fusion RRF, reclassement `rerank-offres`), code hébergé dans `jobs-matching` |

## 2. Fichiers par membre

### Membre 1 — Yassine Trigui — `services/auth` + `gateway`

| Rôle | Fichiers |
|---|---|
| Modèle / migrations | `services/auth/migrations/1761000000000_auth.sql` (`app_user`, `login_token`, `refresh_token`, `consent_log`, `audit_event`, `outbox`), `1761900000000_password-accounts.sql`, `1762200000000_recovery-codes.sql` (`recovery_code`) |
| Routes / contrôleurs | `services/auth/src/routes.ts` (21 routes : `/v1/accounts`, `/v1/session*`, `/v1/me*`, `/.well-known/jwks.json`, `/v1/admin/stats`, `/internal/v1/token`…) |
| Services / logique | `src/store.ts`, `src/keys.ts` (clés JWKS), `src/passwords.ts` (scrypt de `node:crypto`), `src/cookies.ts`, `src/mail.ts`, `src/rgpd.ts`, `src/config.ts`, `src/db.ts`, `src/app.ts`, `src/server.ts` |
| Contrat | `services/auth/openapi.yaml`, `src/openapi.ts`, `packages/shared-schemas/src/api/auth.ts` |
| Gateway | `gateway/src/routing.ts` (table des 6 services, routes publiques), `gateway/src/app.ts`, `config.ts`, `server.ts`, `gateway/tests/gateway.test.ts` |
| Front | `frontend/src/pages/Login.tsx`, `Account.tsx`, `Admin.tsx`, `frontend/src/auth/session.tsx`, `auth/guards.tsx`, `components/RecoveryCodes.tsx`, `api/client.ts` |
| Tests | `services/auth/tests/` : `accounts`, `app`, `config`, `db`, `openapi`, `passwords` (`.test.ts`) ; `frontend/tests/login.test.tsx` |
| Docker | `services/auth/Dockerfile`, `gateway/Dockerfile` ; `compose.yaml` services `auth` (port 4001), `gateway` (port 4000) |
| IA (proposé) | `packages/llm-client/src/` : `anthropic-provider.ts`, `budget.ts`, `pricing.ts`, `prompts.ts`, `provider.ts`, `demo-provider.ts`, `scripted-provider.ts` |
| ADR | 0014 (JWT), 0015 (gateway), 0024 (rôles), 0030 (mot de passe), 0039 (codes de récupération), 0016 (llm-client) |

### Membre 2 — Safouene Saassouki — `services/profiles`

| Rôle | Fichiers |
|---|---|
| Modèle / migrations | `migrations/1761000000000_profiles.sql` (`profile_version`, `llm_usage`), `1761700000000_evidence.sql` (`profile_evidence`), `1761800000000_assistant-vote.sql`, `1762100000000_photo.sql` (`profile_photo`) |
| Routes | `src/routes.ts` (`GET/PUT/DELETE /v1/profiles/me`, versions, `/v1/profiles/import`, entretien, justificatifs, photo) |
| Services | `src/store.ts`, `src/extraction.ts`, `src/import-rules.ts`, `src/pdf-text-child.ts`, `src/evidence.ts`, `src/assistant.ts` |
| Contrat | `openapi.yaml`, `packages/shared-schemas/src/profile.ts`, `api/profiles.ts` |
| Front | `frontend/src/pages/Builder.tsx` (assistant de saisie), `Evidence.tsx`, `assistants/ProfileCoach.tsx`, `lib/profileForm.ts`, `lib/draftStore.tsx` |
| Tests | `tests/` : `app`, `config`, `db`, `extraction`, `import-rules`, `openapi` ; `frontend/tests/profileForm.test.ts` |
| Docker | `services/profiles/Dockerfile` ; `compose.yaml` service `profiles` (port 4002) |
| IA | `prompts/extraction-cv/v1.md`, `entretien-profil/v1-v2.md`, `faits-reponse/v1-v2.md`, `prompts/CHANGELOG.md` |

### Membre 3 — Ali Riahi — `services/cv-generation`

| Rôle | Fichiers |
|---|---|
| Modèle / migrations | `migrations/1761000000000_cvgen.sql` (`generation`, `ia_quota`, `llm_usage`), `1761800000000_assistants.sql` (`assistant_result`, `assistant_vote`) |
| Routes | `src/routes.ts` (`/v1/generations` CRUD, `PATCH …/lines`, `/judge`, `/interview`, `/translate`, `/ats`, `/learning-plan`) |
| Services | `src/pipeline.ts`, `src/faithfulness.ts`, `src/facts.ts`, `src/corrections.ts`, `src/assistants.ts`, `src/upstreams.ts`, `src/store.ts`, `src/resources.ts` |
| Contrat | `openapi.yaml`, `packages/shared-schemas/src/cv.ts`, `pointer.ts`, `api/cv.ts`, `api/assistants.ts` |
| Front | `frontend/src/pages/Generations.tsx`, `studio/*` (`Studio`, `JudgeScene`, `CoachScene`, `AtsScene`, `TranslateScene`, `PlanScene`), `assistants/GenerationAssistants.tsx`, `api/sse.ts` |
| Tests | `tests/` : `app`, `config`, `db`, `faithfulness`, `faithfulness-campagne`, `openapi`, `pipeline`, `upstreams` ; `evals/juge-fidelite.json`, `scripts/eval-juge.ts` |
| Docker | `services/cv-generation/Dockerfile` ; service `cv-generation` (port 4003) |
| IA | `prompts/redaction`, `juge-fidelite`, `coach-questions`, `coach-retour`, `conseils-ats`, `traduction`, `plan-progression` |

### Membre 4 — Ahmed Chaouch — `services/jobs-matching`

| Rôle | Fichiers |
|---|---|
| Modèle / migrations | `migrations/1761000000000_jobs.sql` (`user_offer`, `job_source_run`, `job_posting`, `job_embedding`, `esco_cache`, `llm_usage`), `1761800000000_assistant-vote.sql`, `1762000000000_anglais.sql` |
| Routes | `src/routes.ts` (`/v1/offers` CRUD sans mise à jour, `/v1/postings`, `/v1/postings/:id/explain`, `/v1/cities`, `/internal/v1/ingestion`, `/internal/v1/matching`) |
| Services | `src/ingestion.ts`, `src/sources/*.ts` (adzuna, arbeitnow, ba, jooble, rss, employers, places, http), `src/matching.ts`, `src/ranking.ts`, `src/rerank.ts`, `src/embeddings.ts`, `src/esco.ts`, `src/analysis.ts`, `src/explain.ts`, `src/anonymize.ts`, `src/catalogue.ts`, `src/geo.ts`, `src/repository.ts` ; données `data/employeurs.json`, `data/villes.json` |
| Contrat | `openapi.yaml`, `packages/shared-schemas/src/offer.ts`, `api/jobs.ts` |
| Front | `frontend/src/pages/Offers.tsx`, `lib/offer.ts` (+ étape offre dans `Builder.tsx`) |
| Tests | `tests/` : `app`, `config`, `db`, `openapi`, `places`, `sources`, `units` |
| Docker | `services/jobs-matching/Dockerfile` ; service `jobs-matching` (port 4004) ; service optionnel `tei` (profil `tei`) |
| IA | `prompts/analyse-offre`, `rerank-offres`, `explication-correspondance` |

### Membre 5 — Neila Jribi — `services/letters-export`

| Rôle | Fichiers |
|---|---|
| Modèle / migrations | `migrations/1761000000000_letters.sql` (`cover_letter`, `llm_usage`), `1761800000000_assistant-vote.sql`, `1761800000001_applications.sql` (`application_text`, `application_tracking`), `1762300000000_cv-share.sql` (`cv_share`) |
| Routes | `src/routes.ts` (`/v1/letters` CRUD complet, `/pdf`, `/translate`, `/v1/exports/cv` [pdf, docx, preview], `/v1/shares`, `/v1/public/cv/:token`, `/v1/applications/*`) |
| Services | `src/letters.ts`, `src/applications.ts`, `src/render/*.ts` (pdf, docx, html, letter, report, annex, norms…), `templates/*.ejs` et `*.css`, `src/upstreams.ts`, `src/store.ts` |
| Contrat | `openapi.yaml`, `packages/shared-schemas/src/api/letters.ts`, `api/reports.ts` |
| Front | `frontend/src/pages/Letters.tsx`, `Applications.tsx`, `SharedCv.tsx` |
| Tests | `tests/` : `app`, `config`, `db`, `norms`, `openapi`, `render-pdf-ats`, `render-render`, `render-report`, `upstreams` |
| Docker | `services/letters-export/Dockerfile` (Chromium pour Puppeteer) ; service `letters-export` (port 4006) |
| IA | `prompts/lettre`, `message-recruteur`, `reponse-formulaire`, `traduction-lettre` |

### Membre 6 — Ghassen Bougache — `services/job-watch`

| Rôle | Fichiers |
|---|---|
| Modèle / migrations | `migrations/1761000000000_watch.sql` (`watch_subscription`, `watch_consent`, `match_result`, `email_delivery`, `email_event`, `watch_run`), `1761600000000_watch-recipient.sql`, `1761800000000_reminders.sql` (`reminder`), `1762000000000_pays.sql` |
| Routes | `src/routes.ts` (`GET/PUT/DELETE /v1/subscriptions/me`, `/matches`, `/confirm/:token`, `/v1/reminders`, `/v1/webhooks/brevo`, `/v1/admin/runs`) |
| Services | `src/daily.ts` (tournée quotidienne), `src/gaps.ts` (écarts de compétences), `src/reminders.ts`, `src/mail.ts`, `src/upstreams.ts` (appels auth, profiles, jobs-matching, letters-export), `src/store.ts` |
| Front | `frontend/src/pages/Watch.tsx` (+ `WatchLink` confirmer / désabonner dans `App.tsx`) |
| Tests | `tests/` : `app`, `config`, `db`, `openapi`, `reminders`, `units`, `upstreams` |
| Docker | `services/job-watch/Dockerfile` ; service `job-watch` (port 4005, **profil `full` seulement**) |
| IA | aucune invocation directe de `llm-client` (voir points à confirmer) |

## 3. Partie commune

| Sujet | Fichiers |
|---|---|
| Orchestration | `compose.yaml` : `db` (pgvector 0.8.0-pg16), `db-init`, `mailpit`, `frontend` (8080), `gateway` (4000), 6 services (4001-4006), `migrate`, `web` (3080, monolithe), `veille`, `tei` ; volumes `db-data`, `tei-models` ; profils `core`, `full`, `veille`, `tei` |
| Frontend | `frontend/` (React ^19.3.1, Vite ^8.3.4, TanStack Query ^5.104.5), `frontend/Dockerfile` (nginx-unprivileged 1.27-alpine), `nginx.conf`, `security-headers.conf` |
| Paquets partagés | `packages/shared-schemas`, `packages/llm-client`, `packages/http-kit`, `packages/logger`, `packages/config` |
| CI | `.github/workflows/ci.yml` — déclencheurs `push` sur `main` et `pull_request` ; jobs `qualite` (lint, types, migrations, `npm audit`), `unites` + `tests` (matrice par unité), `secrets`, `infra` (Terraform validé), `commits` (PR), `e2e` (parité + accessibilité), `image` (pile compose, parité complète, vulnérabilités) |
| CD | `.github/workflows/cd.yml` — `workflow_run` de `ci` sur `main` + `release` ; jobs `publier` (build, scan Trivy, push vers Artifact Registry GCP), `preprod`, `prod` (tag `v*`) |
| Autres workflows | `labels.yml`, `mutation.yml`, `rollback.yml` |
| Documentation | `docs/architecture.md`, `docs/adr/0001…0046`, `docs/plan-de-tests.md`, `docs/runbook.md` |

## 4. Points à confirmer (état au 2026-10-26)

1. ✅ **Noms** : membres 1 à 6 = Yassine Trigui, Safouene Saassouki, Ali Riahi, Ahmed Chaouch, Neila Jribi,
   Ghassen Bougache, dans l'ordre des services ci-dessus (ordre choisi par défaut, à corriger si besoin).
2. ✅ **IA du membre 1** : client LLM commun `packages/llm-client`.
3. ✅ **IA du membre 6** : correspondance sémantique déclenchée par la veille (code dans `jobs-matching`).
4. ✅ **Gateway** : rattachée au membre 1.
5. ⚠️ **CD** : `cd.yml` ne pousse que l'image du monolithe (`infra/Dockerfile`). Signalé dans `commun.md` ;
   extension proposée dans `presentation/propositions/cd-microservices.yml` (non ajoutée au projet).
6. ✅ **Route de désabonnement** : présente dans `services/job-watch/src/routes.ts` (déclaration
   `app.post(` écrite sur plusieurs lignes, d'où l'absence dans la première recherche).
7. ✅ **`services/profiles/.env`** : non versionné, ignoré par `.gitignore`, jamais lu ni cité.
8. ✅ **Tests** : lancés le 2026-10-26 (Node 22.18.0, PostgreSQL local) ; résultats dans chaque fiche.
9. ✅ **Livrable** : `rapport_equipe.pdf` ; pas de support `.pptx` (non demandé).
