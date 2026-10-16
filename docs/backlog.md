# Backlog

Chaque phase livre un produit utilisable. Les tailles (S, M, L) sont indicatives.

## Phase 0 : Cadrage (en cours, en attente de validation)

- [x] Structure du dépôt, workspaces, TypeScript strict
- [x] Schéma Zod v1 + export JSON Schema + 11 tests
- [x] ADR 0001 à 0007, architecture, ERD, plan de tests
- [ ] Réponses aux questions bloquantes (`docs/questions.md`)

## Phase 1 : Socle sans IA

| #    | Tâche                                                                                                                                                      | Taille |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.1  | `packages/shared` : config validée par Zod, logger pino avec redact, erreurs typées                                                                        | S      |
| 1.2  | ESLint + Prettier, règle de frontières entre paquets, Conventional Commits (commitlint)                                                                    | S      |
| 1.3  | `apps/web` : Express, helmet + CSP, sessions PostgreSQL, CSRF, rate limiting, `/health`                                                                    | M      |
| 1.4  | Formulaire en 5 étapes (EJS, amélioration progressive), « Étape n sur 5 », retour sans perte, erreurs annoncées en `aria-live`, thème clair et sombre      | L      |
| 1.5  | Migrations initiales : `app_user`, `consent_log`, `profile`, `profile_version`, `job_offer_input`, `cv_generation`, `export` ; purge des sessions anonymes | M      |
| 1.6  | `packages/render` : gabarit `ats` + `design`, formatage des dates, polices embarquées                                                                      | M      |
| 1.7  | Worker + pg-boss : job `render-pdf` avec Puppeteer                                                                                                         | M      |
| 1.8  | Export PDF ATS depuis la saisie (sans reformulation, équivalent au mode dégradé)                                                                           | S      |
| 1.9  | Docker multi-étapes (non-root, Chromium, polices, `HEALTHCHECK`), `compose` : app, worker, PostgreSQL + pgvector, MailHog                                  | M      |
| 1.10 | CI de base : lint, typecheck, tests unitaires, Playwright E2E, test ATS, axe-core                                                                          | M      |

**Sortie** : PDF généré depuis la saisie ; tests unitaires et E2E verts ; `docker compose up` suffit.

## Phase 2 : Intelligence

- 2.1 `LlmProvider` + adaptateur réel + `FakeProvider` (M)
- 2.2 Prompts v1 versionnés (extraction, analyse de l'offre, rédaction) + changelog (M)
- 2.3 Import d'un CV PDF : extraction du texte, étape 1, relecture du profil (M)
- 2.4 Pipeline étapes 2 et 3 avec relance bornée, cache, quotas, `llm_usage` (L)
- 2.5 Contrôle de fidélité déterministe (étape 4) + `cv_line_trace` (L)
- 2.6 SSE de progression ; mode dégradé (M)
- 2.7 Vue de traçabilité (survol ou focus d'une ligne → source), score avant export, mots-clés signalés (M)
- 2.8 Jeu d'évaluation + script `evals` + gate CI « 0 invention » (L)
- 2.9 Option : juge LLM d'implication (M)

## Phase 3 : Industrialisation

CI/CD complète (Trivy, npm audit, gitleaks, build et push de l'image signée), environnements dev, préprod et prod, déploiement progressif + rollback testé, IaC Terraform de l'hébergeur UE, sauvegardes et restauration testées, métriques et alertes, runbook, tests ATS et a11y étendus, droits RGPD (export et suppression), revue de sécurité indépendante.

## Phase 4 : Veille emploi

Connecteurs (BA, puis Adzuna et Jooble, puis France Travail), normalisation et déduplication, BGE-M3 (TEI) + HNSW, recherche lexicale, RRF, ESCO, rerank du top 20, anonymisation, rapports 1 et 2, double opt-in, envoi + désabonnement en un clic + webhooks de plainte, planification idempotente, pilote DE puis FR.

## V2 (hors périmètre)

Normes locales de CV (DE, FR, US), vie privée renforcée, réalisations atomiques, entretien miroir, audit de biais.
