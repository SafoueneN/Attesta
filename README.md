# Attesta : le CV qui dit vrai

Génération de CV ciblés par offre, **prouvables ligne par ligne**. L'IA reformule, le candidat décide.

> **Statut : Phase 4 livrée (veille emploi), en local.** CV ciblé par Claude (Vertex AI, UE), chaque ligne vérifiée ; comptes sans mot de passe ; veille quotidienne : offres de la Bundesagentur für Arbeit, matching hybride (lexical + BGE-M3, RRF, rerank), deux rapports PDF par e-mail, double opt-in, désabonnement en un clic. Infrastructure Google Cloud (Paris) en Terraform, CI/CD progressive. Rien n'a encore été déployé sur un vrai projet.

## Démarrage rapide

```bash
docker compose --profile core up --build
```

Puis ouvrir http://localhost:3080 (port modifiable avec `ATTESTA_PORT`). Les e-mails (connexion, confirmation, rapports) arrivent dans Mailpit : http://localhost:8025. Veille quotidienne à la demande : `docker compose run --rm veille` ([runbook](docs/runbook.md#veille-emploi-en-local)).

## Développement

Prérequis : Node.js 22 (`nvm use`), Docker pour la pile complète.

```bash
npm install
npm run lint          # ESLint + Prettier
npm run typecheck     # TypeScript strict
npm test              # unitaires, intégration, extraction ATS du PDF
npm run test:e2e      # Playwright + axe-core
npm run evals         # évaluation de fidélité (rejeu, sans réseau)
npm run test:parite   # parité fonctionnelle de la migration (serveur local)
```

Ou, sans rien installer d'autre que Docker et VS Code : « Dev Containers : Rouvrir dans le conteneur »
(Node 22, bases, Mailpit et base de test fournis).

Détails et dépannage : [docs/runbook.md](docs/runbook.md).

## Structure

**Migration en cours vers 6 microservices** ([ADR 0011](docs/adr/0011-microservices-extraction.md)) : le
monolithe ci-dessous reste servi et gelé par le tag `v0.4-monolithe` ; chaque service en est extrait sans
réécriture, sous le contrôle de la suite de parité `e2e/parite`. Suivi : [TASKS.md](TASKS.md).

```
services/            Cible : auth, profiles, cv-generation, jobs-matching, job-watch, letters-export
gateway/             Cible : point d'entrée de l'API (JWT, débit, corrélation)
packages/            Cible : shared-schemas, llm-client, logger, config, http-kit (sans logique métier)
e2e/parite/          Suite de parité Playwright, verte avant et après chaque extraction
infra/postgres/      Bases et rôles cloisonnés par service (db-init)
.vscode/ .devcontainer/   Poste de développement en une commande

Monolithe v0.4 (en cours d'extraction) :
apps/web/            Express 5 + EJS : parcours en 5 étapes, aperçu, export, comptes, veille
apps/worker/         Exécution quotidienne de la veille (Cloud Run Job)
packages/schema/     Contrat Zod + JSON Schema : profil, offre, CV ciblé, rapport de fidélité
packages/llm/        Pipeline LLM : fournisseurs, prompts, contrôle de fidélité, import PDF
packages/render/     Gabarit HTML/CSS unique (ats, design) + Puppeteer
packages/jobwatch/   Veille emploi : sources, ESCO, vecteurs, matching, rapports, envoi, pg-boss
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
- [Backlog](docs/backlog.md) et [suivi des tâches](TASKS.md)
- [Consignes pour les assistants de code](CLAUDE.md)
- [Questions ouvertes](docs/questions.md)

## Licence

[MIT](LICENSE). Données tierces : villes GeoNames (CC BY 4.0), classification ESCO (Commission européenne) ; polices Source Sans 3 (SIL Open Font License).
