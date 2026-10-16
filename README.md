# Attesta : le CV qui dit vrai

Génération de CV ciblés par offre, **prouvables ligne par ligne**. L'IA reformule, le candidat décide.

> **Statut : Phase 1 livrée (socle sans IA).** Parcours en 5 étapes, aperçu et export PDF lisible par les ATS, sans reformulation par IA. Le pipeline LLM arrive en Phase 2.

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
```

Détails et dépannage : [docs/runbook.md](docs/runbook.md).

## Structure

```
apps/web/            Express 5 + EJS : parcours en 5 étapes, aperçu, export
packages/schema/     Contrat Zod + JSON Schema : profil, offre, CV ciblé, rapport de fidélité
packages/llm/        Pipeline 4 étapes (Phase 2)
packages/render/     Gabarit HTML/CSS unique (ats, design) + Puppeteer
packages/jobwatch/   Veille emploi (Phase 4)
packages/shared/     Config validée, logger sans PII, erreurs
db/                  Migrations SQL, seeds
prompts/             Prompts versionnés + changelog
evals/               Jeu de référence, métriques de fidélité
infra/               Dockerfile (CI : .github/workflows ; compose.yaml à la racine)
docs/                ADR, architecture, tests, backlog, questions
```

## Documentation

- [Architecture et ERD](docs/architecture.md)
- [Décisions (ADR)](docs/adr/README.md)
- [Plan de tests](docs/plan-de-tests.md)
- [Runbook](docs/runbook.md)
- [Backlog](docs/backlog.md)
- [Questions ouvertes](docs/questions.md)
