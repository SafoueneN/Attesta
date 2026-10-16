# Décisions d'architecture (ADR)

| #                                              | Décision                                                                            | Statut                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------- |
| [0001](0001-monolithe-modulaire-typescript.md) | Monolithe modulaire, TypeScript, workspaces npm                                     | accepté                           |
| [0002](0002-schema-contrat-unique.md)          | Schéma Zod unique, traçabilité par pointeurs JSON                                   | accepté                           |
| [0003](0003-pipeline-llm.md)                   | Pipeline LLM en 4 étapes, contrôle de fidélité, mode dégradé                        | accepté (mis en œuvre en Phase 2) |
| [0004](0004-donnees-postgres-pgboss.md)        | PostgreSQL + pgvector, SQL explicite, pg-boss                                       | proposé, incertitude BM25         |
| [0005](0005-rendu-pdf.md)                      | Gabarit HTML unique, Puppeteer en worker (en processus en Phase 1)                  | proposé                           |
| [0006](0006-donnees-personnelles-securite.md)  | Rétention, minimisation, sécurité                                                   | accepté                           |
| [0007](0007-veille-emploi.md)                  | Veille emploi : sources, matching, envoi                                            | proposé                           |
| [0008](0008-fournisseur-llm.md)                | Fournisseur LLM : Claude sur Vertex AI, région UE                                   | accepté                           |
| [0009](0009-hebergement-et-execution.md)       | Google Cloud Paris ; pas de worker pour le parcours interactif ; comptes en Phase 4 | accepté                           |

Format : contexte, décision, alternatives, conséquences. Un ADR accepté n'est jamais modifié : on le remplace par un nouvel ADR.
