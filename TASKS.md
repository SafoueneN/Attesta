# Tasks

Suivi opérationnel de la migration vers 6 microservices (ADR 0011). Le détail par phase et les
critères de fin sont dans [docs/backlog.md](docs/backlog.md). Une tâche cochée signifie : faite,
vérifiée par des commandes réellement exécutées, et revue.

## Active

- [ ] **Phase 1 : fondations** - branche `chore/phase-1-fondations`, PR unique
  - [x] Tag `v0.4-monolithe` posé sur `main` et poussé
  - [ ] ADR 0011 à 0021 rédigés ; ADR 0001 marqué « remplacé »
  - [ ] `docs/architecture.md` : architecture cible, propriété des données, flux
  - [ ] Arborescence `gateway/`, `services/*`, `packages/*` (README de périmètre, sans code mort)
  - [ ] `.vscode/` (extensions, settings, launch, tasks) et `.devcontainer/`
  - [ ] Compose : 6 bases, 6 rôles cloisonnés, profils `core` et `full`
  - [ ] CI GitHub en matrice par unité (paquets, applications, puis services)
  - [ ] Modèles d'issues et de PR, étiquettes
  - [ ] Suite Playwright de parité écrite et verte sur le monolithe
  - [ ] Revue de code du lot, documentation à jour, point de fin de phase

## Waiting On

- [ ] **Identifiants Claude (clé API ou projet Vertex)** - from chef de projet, since 2026-10-18
  - Débloque le premier `npm run evals:live` (plafond 20 €/mois, coupure automatique)
- [ ] **Exigence éventuelle de Jest par l'enseignant** - since 2026-10-18
  - Si oui : tâche séparée de bascule Vitest → Jest (environ une demi-journée)
- [ ] **Désactiver SonarLint pour ce dossier** - from chef de projet, since 2026-10-18
  - VS Code relance ses 3 JVM (environ 2 Go) ; Extensions → SonarLint → « Désactiver (espace de travail) »

## Someday

- [ ] **Phase 2 : socle commun** - logger, config, erreurs, gateway, service auth (JWT RS256, JWKS, refresh rotatif), `/health` et `/ready`
- [ ] **Phase 3 : service gabarit profiles** - CRUD, import PDF, OpenAPI, tests, `services/_template`
- [ ] **Phase 4 : 5 services extraits** - cv-generation, jobs-matching, job-watch, letters-export, auth (RGPD)
- [ ] **Phase 5 : interface et intégration** - web via la gateway, accessibilité, E2E, coûts LLM
- [ ] **Phase 6 : durcissement** - sécurité, RGPD, performance, dette, checklist, tag `v1.0`
- [ ] **Bascule éventuelle vers Jest** - seulement si l'enseignant l'impose
- [ ] **Déploiement GCP** - Terraform gelé (ADR 0021), hors périmètre de la soutenance

## Done

- [x] ~~Phase 0 : cadrage de la migration, réponses Q1 à Q5~~ (2026-10-18)
- [x] ~~Mémoire du poste libérée : SQL Server arrêté, service Intel redémarré~~ (2026-10-18)
