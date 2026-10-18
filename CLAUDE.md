# Consignes pour les assistants de code (Claude Code et autres)

Attesta génère des CV ciblés et fidèles. Le dépôt migre d'un monolithe modulaire vers 6 microservices
([ADR 0011](docs/adr/0011-microservices-extraction.md)). Suivi : [TASKS.md](TASKS.md) ; détail par
phase : [docs/backlog.md](docs/backlog.md).

## Avant toute commande

- Node 22 : `nvm use 22.18.0`, puis vérifier `node -v`. S'arrêter si la version est différente.
- Commandes compatibles PowerShell et Git Bash ; chemins relatifs dans les scripts.
- Ne jamais lire, écrire ni committer de secret : seul `.env.example` est versionné.

## Règles d'architecture (non négociables)

1. Un service possède son code, sa base, son API et ses tests ; aucun accès à la base d'un autre service.
2. `packages/*` ne contient aucune logique métier ; un paquet n'importe jamais un service.
3. Contrats : schémas Zod de `packages/shared-schemas`, OpenAPI généré, tests de contrat (ADR 0017).
4. Appels LLM uniquement par `packages/llm-client` ; jamais de contenu personnel dans les journaux.
5. Fidélité : aucune compétence ajoutée ; chaque ligne générée renvoie à sa source ; contrôle de fidélité
   avant tout affichage ou export.
6. Aucune dépendance sans justification en une ligne (dans l'ADR ou la PR). Aucun fichier hors périmètre.
7. Toute décision structurante a un ADR (`docs/adr/`). Un ADR accepté n'est jamais réécrit.

## Vérifier avant de déclarer « terminé »

```bash
npm run lint && npm run typecheck && npm test        # unitaires et intégration
npm run test:parite                                  # parité fonctionnelle, serveur local
docker compose --profile core up -d --build --wait   # pile locale
E2E_BASE_URL=http://localhost:3080 MAILPIT_URL=http://localhost:8025 npx playwright test e2e/parite
```

La suite `e2e/parite` doit rester verte après **chaque** extraction de service.

## Conventions

- Français pour l'interface, les messages d'erreur, la documentation et les commits.
- Commits conventionnels (`feat(profiles): …`), branches courtes, une PR par lot, revue avant fusion.
- TypeScript strict, imports relatifs avec l'extension `.js` (NodeNext), Vitest pour les tests.
