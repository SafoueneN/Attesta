# Décisions d'architecture (ADR)

| #                                              | Décision                                                                            | Statut                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------- |
| [0001](0001-monolithe-modulaire-typescript.md) | Monolithe modulaire, TypeScript, workspaces npm                                     | **remplacé par 0011**              |
| [0002](0002-schema-contrat-unique.md)          | Schéma Zod unique, traçabilité par pointeurs JSON                                   | accepté, prolongé par 0017         |
| [0003](0003-pipeline-llm.md)                   | Pipeline LLM en 4 étapes, contrôle de fidélité, mode dégradé                        | accepté, amendé par 0016           |
| [0004](0004-donnees-postgres-pgboss.md)        | PostgreSQL + pgvector, SQL explicite, pg-boss                                       | accepté, amendé par 0009 et 0013   |
| [0005](0005-rendu-pdf.md)                      | Gabarit HTML unique, Puppeteer                                                      | accepté, amendé par 0009 et 0018   |
| [0006](0006-donnees-personnelles-securite.md)  | Rétention, minimisation, sécurité                                                   | accepté, prolongé par 0019         |
| [0007](0007-veille-emploi.md)                  | Veille emploi : sources, matching, envoi                                            | accepté, précisé par 0010          |
| [0008](0008-fournisseur-llm.md)                | Fournisseur LLM : Claude sur Vertex AI, région UE                                   | accepté, amendé par 0016           |
| [0009](0009-hebergement-et-execution.md)       | Google Cloud Paris ; pas de worker pour le parcours interactif ; comptes en Phase 4 | accepté, hébergement gelé par 0021 |
| [0010](0010-veille-comptes-envoi.md)           | Veille emploi, comptes sans mot de passe, envoi par Brevo, job quotidien            | accepté, précisé par 0014          |
| [0011](0011-microservices-extraction.md)       | Six microservices extraits progressivement du monolithe                             | accepté                            |
| [0012](0012-communication-entre-services.md)   | REST synchrone, jetons relayés ou de service, outbox et pg-boss local               | accepté                            |
| [0013](0013-une-base-par-service.md)           | Une base et un rôle par service, une instance PostgreSQL en local                   | accepté                            |
| [0014](0014-authentification-jwt.md)           | Lien magique, JWT RS256 de 15 min, refresh rotatif, JWKS, jeton d'invité            | accepté                            |
| [0015](0015-gateway.md)                        | Gateway Express : routage, identité, débit, en-têtes, corrélation                   | accepté                            |
| [0016](0016-llm-client.md)                     | `llm-client` partagé, budget de 20 € par mois réparti, prompts versionnés           | accepté                            |
| [0017](0017-contrats-openapi-zod.md)           | OpenAPI généré depuis Zod, format d'erreur commun, tests de contrat                 | accepté                            |
| [0018](0018-rendu-pdf-centralise.md)           | Rendu PDF centralisé dans letters-export                                            | accepté                            |
| [0019](0019-rgpd-distribue.md)                 | RGPD réparti : suppression par outbox, export agrégé, consentements                 | accepté                            |
| [0020](0020-observabilite.md)                  | Journaux corrélés, `/health` et `/ready`                                            | accepté                            |
| [0021](0021-cible-execution-et-outillage.md)   | docker-compose local, profils, ports, devcontainer, Vitest, Google Cloud gelé       | accepté                            |

Format : contexte, décision, options considérées, conséquences. Un ADR accepté n'est jamais réécrit : on le
remplace ou on l'amende par un nouvel ADR, et seule sa ligne de statut reçoit le renvoi.
