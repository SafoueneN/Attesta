# Backlog

Chaque phase livre un produit utilisable. Les tailles (S, M, L) sont indicatives.

## Phase 0 : Cadrage (terminée)

- [x] Structure du dépôt, workspaces, TypeScript strict
- [x] Schéma Zod v1 + export JSON Schema + tests
- [x] ADR 0001 à 0007, architecture, ERD, plan de tests
- [x] Réponses aux questions bloquantes Q1 à Q4 (`docs/questions.md`)

## Phase 1 : Socle sans IA (livrée le 2026-10-16)

| #    | Tâche                                                                                                                | État                                                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | `packages/shared` : config validée par Zod, logger pino avec redact, erreurs typées                                  | fait                                                                                                                                                       |
| 1.2  | ESLint + Prettier, règle de frontières entre paquets                                                                 | fait ; **commitlint reporté en Phase 3** (s'applique en CI sur les PR, sans hook local)                                                                    |
| 1.3  | `apps/web` : Express 5, helmet + CSP à nonce, sessions PostgreSQL, CSRF, rate limiting, `/health`                    | fait                                                                                                                                                       |
| 1.4  | Formulaire en 5 étapes, « Étape n sur 5 », retour sans perte, erreurs annoncées et focalisées, thème clair et sombre | fait ; fonctionne sans JavaScript                                                                                                                          |
| 1.5  | Migrations                                                                                                           | **réduit, conformément à Q3** : table `session` seulement. Les tables de comptes et de générations arrivent en Phase 2 avec leur usage (pas de code mort). |
| 1.6  | `packages/render` : gabarit `ats` + `design`, dates uniformes, polices embarquées                                    | fait                                                                                                                                                       |
| 1.7  | Worker + pg-boss                                                                                                     | **reporté en Phase 2** : rendu dans le processus web en attendant (ADR 0005)                                                                               |
| 1.8  | Export PDF depuis la saisie (sans reformulation, comme le mode dégradé)                                              | fait                                                                                                                                                       |
| 1.9  | Docker multi-étapes (non-root, Chromium, polices, `HEALTHCHECK`), `compose` : web, migration, PostgreSQL + pgvector  | fait ; **MailHog reporté en Phase 4** (aucun e-mail avant)                                                                                                 |
| 1.10 | CI de base : lint, typecheck, couverture, ATS, Playwright + axe-core, image Docker + E2E sur conteneur               | écrite ; **jamais exécutée sur GitHub** (pas encore de dépôt distant)                                                                                      |

Reste de la Phase 1, non bloquant : sections Projets et Certifications dans le formulaire (déjà dans le schéma et le gabarit).

## Phase 2 : Intelligence (livrée le 2026-10-16)

| #   | Tâche                                                                                             | État                                                                                                |
| --- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 2.1 | `LlmProvider` + adaptateur Claude (Vertex UE / API directe) + `ScriptedProvider` + `DemoProvider` | fait ; adaptateur réel testé par contrat, **jamais appelé en réel** (pas d'identifiants)            |
| 2.2 | Prompts v1 versionnés + changelog                                                                 | fait (`prompts/`)                                                                                   |
| 2.3 | Import d'un CV PDF : extraction du texte, étape 1, relecture                                      | fait (désactivé en mode démo)                                                                       |
| 2.4 | Pipeline : analyse et rédaction, relances bornées, cache, quotas, budget, journal des coûts       | fait ; coûts journalisés, **pas encore en base** (table `llm_usage` en Phase 3)                     |
| 2.5 | Contrôle de fidélité déterministe                                                                 | fait ; traces conservées en session, **pas en base** (`cv_line_trace` en Phase 3, avec les comptes) |
| 2.6 | SSE de progression ; mode dégradé                                                                 | fait                                                                                                |
| 2.7 | Vue de traçabilité, score avant export, mots-clés signalés, corrections                           | fait (relecture ligne par ligne avec la source de chaque ligne)                                     |
| 2.8 | Jeu d'évaluation + porte CI                                                                       | fait en rejeu (4 cas, bloquant en CI) ; `npm run evals:live` prêt, **non exécuté**                  |
| 2.9 | Juge LLM d'implication                                                                            | **non fait** (optionnel) ; à décider après une mesure réelle                                        |

## Phase 3 : Industrialisation

Reportés des phases précédentes : worker + pg-boss (rendu PDF et génération hors du processus web), comptes et droits RGPD (export, suppression), tables `cv_generation`, `cv_line_trace`, `llm_usage`, commitlint, profil seccomp Chromium, analyse des PDF importés dans un `worker_thread` (délai, limites mémoire), verrou de génération et quota partagés en base (plusieurs instances). Puis :

CI/CD complète (Trivy, npm audit, gitleaks, build et push de l'image signée), environnements dev, préprod et prod, déploiement progressif + rollback testé, IaC Terraform de l'hébergeur UE, sauvegardes et restauration testées, métriques et alertes, runbook, tests ATS et a11y étendus, droits RGPD (export et suppression), revue de sécurité indépendante.

## Phase 4 : Veille emploi

Connecteurs (BA, puis Adzuna et Jooble, puis France Travail), normalisation et déduplication, BGE-M3 (TEI) + HNSW, recherche lexicale, RRF, ESCO, rerank du top 20, anonymisation, rapports 1 et 2, double opt-in, envoi + désabonnement en un clic + webhooks de plainte, planification idempotente, pilote DE puis FR.

## V2 (hors périmètre)

Normes locales de CV (DE, FR, US), vie privée renforcée, réalisations atomiques, entretien miroir, audit de biais.
