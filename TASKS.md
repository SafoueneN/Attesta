# Tasks

Suivi opérationnel de la migration vers 6 microservices (ADR 0011). Le détail par phase et les
critères de fin sont dans [docs/backlog.md](docs/backlog.md). Une tâche cochée signifie : faite,
vérifiée par des commandes réellement exécutées, et revue.

## Active

- [ ] **Phase 1 : fondations** - branche `chore/phase-1-fondations`, en attente de validation du chef de projet
  - [x] Tag `v0.4-monolithe` posé sur `main` et poussé
  - [x] ADR 0011 à 0021 rédigés ; ADR 0001 marqué « remplacé », statuts des ADR amendés
  - [x] `docs/architecture.md` : architecture cible, flux, état de la migration, tables par service
  - [x] Arborescence `gateway/`, `services/*`, `packages/*` (README de périmètre, sans code mort)
  - [x] `.vscode/` (extensions, settings, launch, tasks), `.editorconfig`, `CLAUDE.md`
  - [x] Compose : 7 bases, 7 rôles cloisonnés (vérifié), profils `core` et `full`
  - [x] CI en matrice par unité (actionlint vert ; 7 unités, 204 tests, comme le passage global)
  - [x] Modèles d'issues et de PR, étiquettes (synchronisées par workflow sur `main`)
  - [x] Suite de parité verte sur le monolithe (local : 15 réussis, 2 ignorés ; compose : 17 sur 17)
  - [x] Revue de code du lot : 3 corrections appliquées
  - [ ] `.devcontainer/` : configuration validée par la CLI officielle ; **démarrage réel non vérifié**
        (téléchargement de l'image coupé deux fois, `unexpected EOF`)
  - [ ] Reconstruction de l'image après l'ajout des workspaces : **bloquée par le réseau**
        (`npm ci` : `ECONNRESET`) ; à relancer : `docker compose --profile core up -d --build --wait`

## Waiting On

- [ ] **Validation de la Phase 1 et feu vert pour la Phase 2** - from chef de projet, since 2026-10-18
- [ ] **Réseau stable pour finir les deux vérifications Docker ci-dessus** - since 2026-10-18
- [ ] **Identifiants Claude (clé API ou projet Vertex)** - from chef de projet, since 2026-10-18
  - Débloque le premier `npm run evals:live` (plafond 20 €/mois, coupure automatique)
- [ ] **Exigence éventuelle de Jest par l'enseignant** - since 2026-10-18
  - Si oui : tâche séparée de bascule Vitest → Jest (environ une demi-journée)
- [ ] **Désactiver SonarLint pour ce dossier** - from chef de projet, since 2026-10-18
  - VS Code relance ses 3 JVM (environ 2 Go) ; Extensions → SonarLint → « Désactiver (espace de travail) »
- [ ] **Créer le tableau de projet GitHub** - from chef de projet, since 2026-10-18
  - `gh` absent du poste ; colonnes et champs décrits dans `docs/backlog.md`

## Someday

- [ ] **Phase 2 : socle commun** - logger, config, http-kit, gateway, service auth (JWT RS256, JWKS, refresh rotatif), `/health` et `/ready`, plafonds de débit configurables, règle ESLint des frontières des services
- [ ] **Phase 3 : service gabarit profiles** - CRUD, import PDF, OpenAPI, tests, `services/_template`
- [ ] **Phase 4 : 5 services extraits** - cv-generation, jobs-matching, job-watch, letters-export, auth (RGPD)
- [ ] **Phase 5 : interface et intégration** - web via la gateway, accessibilité, E2E, coûts LLM
- [ ] **Phase 6 : durcissement** - sécurité, RGPD, performance, dette, checklist, tag `v1.0`
- [ ] **Bascule éventuelle vers Jest** - seulement si l'enseignant l'impose
- [ ] **Déploiement GCP** - Terraform gelé (ADR 0021), hors périmètre de la soutenance

## Done

- [x] ~~Phase 0 : cadrage de la migration, réponses Q1 à Q5~~ (2026-10-18)
- [x] ~~Mémoire du poste libérée : SQL Server arrêté, service Intel redémarré~~ (2026-10-18)
