# Décisions d'architecture (ADR)

| # | Décision | Statut |
|---|---|---|
| [0001](0001-monolithe-modulaire-typescript.md) | Monolithe modulaire, TypeScript, workspaces npm | proposé |
| [0002](0002-schema-contrat-unique.md) | Schéma Zod unique, traçabilité par pointeurs JSON | proposé (v1 implémentée) |
| [0003](0003-pipeline-llm.md) | Pipeline LLM en 4 étapes, contrôle de fidélité, mode dégradé | proposé, fournisseur à confirmer |
| [0004](0004-donnees-postgres-pgboss.md) | PostgreSQL + pgvector, SQL explicite, pg-boss | proposé, incertitude BM25 |
| [0005](0005-rendu-pdf.md) | Gabarit HTML unique, Puppeteer en worker | proposé |
| [0006](0006-donnees-personnelles-securite.md) | Rétention, minimisation, sécurité | proposé |
| [0007](0007-veille-emploi.md) | Veille emploi : sources, matching, envoi | proposé |

Format : contexte, décision, alternatives, conséquences. Un ADR accepté n'est jamais modifié : on le remplace par un nouvel ADR.
