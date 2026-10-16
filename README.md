# Attesta : le CV qui dit vrai

Génération de CV ciblés par offre, **prouvables ligne par ligne**. L'IA reformule, le candidat décide.

> **Statut : Phase 0 (cadrage).** Seul le contrat de données (`packages/schema`) est implémenté et testé. L'application web arrive en Phase 1.

## Prérequis

- Node.js 22 LTS (`nvm use`)
- Docker (à partir de la Phase 1)

## Commandes

```bash
npm install
npm run typecheck
npm test
```

## Structure

```
apps/web/            Express + EJS (Phase 1)
packages/schema/     Contrat Zod + JSON Schema : profil, offre, CV ciblé, rapport de fidélité
packages/llm/        Pipeline 4 étapes (Phase 2)
packages/render/     Gabarit HTML/CSS unique + Puppeteer (Phase 1)
packages/jobwatch/   Veille emploi (Phase 4)
packages/shared/     Config, logger, erreurs (Phase 1)
db/                  Migrations SQL, seeds
prompts/             Prompts versionnés + changelog
evals/               Jeu de référence, métriques de fidélité
infra/               Docker, CI/CD, IaC
docs/                ADR, architecture, tests, backlog, questions
```

## Documentation

- [Architecture et ERD](docs/architecture.md)
- [Décisions (ADR)](docs/adr/README.md)
- [Plan de tests](docs/plan-de-tests.md)
- [Backlog](docs/backlog.md)
- [Questions ouvertes](docs/questions.md)
