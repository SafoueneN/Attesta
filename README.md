# Attesta : le CV qui dit vrai

Génération de CV ciblés par offre, **prouvables ligne par ligne**. L'IA reformule, le candidat décide.

> **Statut : Phase 3 livrée (industrialisation).** CV ciblé par Claude (Vertex AI, UE), chaque ligne vérifiée ; état partagé dans PostgreSQL ; infrastructure Google Cloud (Paris) en Terraform ; CI/CD avec déploiement progressif et retour arrière. Rien n'a encore été déployé sur un vrai projet. Veille emploi : Phase 4.

## Démarrage rapide

```bash
docker compose up --build
```

Puis ouvrir http://localhost:3080 (port modifiable avec `ATTESTA_PORT`).

## Développement

Prérequis : Node.js 22 (`nvm use`), Docker pour la pile complète.

```bash
npm install
npm run lint          # ESLint + Prettier
npm run typecheck     # TypeScript strict
npm test              # unitaires, intégration, extraction ATS du PDF
npm run test:e2e      # Playwright + axe-core
npm run evals         # évaluation de fidélité (rejeu, sans réseau)
```

Détails et dépannage : [docs/runbook.md](docs/runbook.md).

## Structure

```
apps/web/            Express 5 + EJS : parcours en 5 étapes, aperçu, export
packages/schema/     Contrat Zod + JSON Schema : profil, offre, CV ciblé, rapport de fidélité
packages/llm/        Pipeline LLM : fournisseurs, prompts, contrôle de fidélité, import PDF
packages/render/     Gabarit HTML/CSS unique (ats, design) + Puppeteer
packages/jobwatch/   Veille emploi (Phase 4)
packages/shared/     Config validée, logger sans PII, erreurs
db/                  Migrations SQL, seeds
prompts/             Prompts versionnés + changelog
evals/               Jeu de référence, métriques de fidélité
infra/               Dockerfile, seccomp Chromium, Terraform, scripts de déploiement
scripts/             test de fumée d'un déploiement
docs/                ADR, architecture, tests, backlog, questions
```

## Documentation

- [Architecture et ERD](docs/architecture.md)
- [Décisions (ADR)](docs/adr/README.md)
- [Plan de tests](docs/plan-de-tests.md)
- [Runbook](docs/runbook.md)
- [Conformité (RGPD, AI Act)](docs/conformite.md)
- [Backlog](docs/backlog.md)
- [Questions ouvertes](docs/questions.md)
