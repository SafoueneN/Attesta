# Décisions d'architecture (ADR)

| #                                                          | Décision                                                                                                      | Statut                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| [0001](0001-monolithe-modulaire-typescript.md)             | Monolithe modulaire, TypeScript, workspaces npm                                                               | **remplacé par 0011**              |
| [0002](0002-schema-contrat-unique.md)                      | Schéma Zod unique, traçabilité par pointeurs JSON                                                             | accepté, prolongé par 0017         |
| [0003](0003-pipeline-llm.md)                               | Pipeline LLM en 4 étapes, contrôle de fidélité, mode dégradé                                                  | accepté, amendé par 0016           |
| [0004](0004-donnees-postgres-pgboss.md)                    | PostgreSQL + pgvector, SQL explicite, pg-boss                                                                 | accepté, amendé par 0009 et 0013   |
| [0005](0005-rendu-pdf.md)                                  | Gabarit HTML unique, Puppeteer                                                                                | accepté, amendé par 0009 et 0018   |
| [0006](0006-donnees-personnelles-securite.md)              | Rétention, minimisation, sécurité                                                                             | accepté, prolongé par 0019         |
| [0007](0007-veille-emploi.md)                              | Veille emploi : sources, matching, envoi                                                                      | accepté, précisé par 0010          |
| [0008](0008-fournisseur-llm.md)                            | Fournisseur LLM : Claude sur Vertex AI, région UE                                                             | accepté, amendé par 0016           |
| [0009](0009-hebergement-et-execution.md)                   | Google Cloud Paris ; pas de worker pour le parcours interactif ; comptes en Phase 4                           | accepté, hébergement gelé par 0021 |
| [0010](0010-veille-comptes-envoi.md)                       | Veille emploi, comptes sans mot de passe, envoi par Brevo, job quotidien                                      | accepté, précisé par 0014          |
| [0011](0011-microservices-extraction.md)                   | Six microservices extraits progressivement du monolithe                                                       | accepté, amendé par 0022 et 0023   |
| [0012](0012-communication-entre-services.md)               | REST synchrone, jetons relayés ou de service, outbox et pg-boss local                                         | accepté                            |
| [0013](0013-une-base-par-service.md)                       | Une base et un rôle par service, une instance PostgreSQL en local                                             | accepté                            |
| [0014](0014-authentification-jwt.md)                       | Lien magique, JWT RS256 de 15 min, refresh rotatif, JWKS, jeton d'invité                                      | accepté, amendé par 0022 et 0024   |
| [0015](0015-gateway.md)                                    | Gateway Express : routage, identité, débit, en-têtes, corrélation                                             | accepté                            |
| [0016](0016-llm-client.md)                                 | `llm-client` partagé, budget de 20 € par mois réparti, prompts versionnés                                     | accepté                            |
| [0017](0017-contrats-openapi-zod.md)                       | OpenAPI généré depuis Zod, format d'erreur commun, tests de contrat                                           | accepté, amendé par 0023           |
| [0018](0018-rendu-pdf-centralise.md)                       | Rendu PDF centralisé dans letters-export                                                                      | accepté                            |
| [0019](0019-rgpd-distribue.md)                             | RGPD réparti : suppression par outbox, export agrégé, consentements                                           | accepté                            |
| [0020](0020-observabilite.md)                              | Journaux corrélés, `/health` et `/ready`                                                                      | accepté                            |
| [0021](0021-cible-execution-et-outillage.md)               | docker-compose local, profils, ports, devcontainer, Vitest, Google Cloud gelé                                 | accepté                            |
| [0022](0022-frontend-react.md)                             | Frontend React + Vite + Tailwind, même origine, jeton d'accès en mémoire                                      | accepté                            |
| [0023](0023-autonomie-des-services.md)                     | Lockfile par service, paquets en `file:`, bouchons, `openapi.yaml` versionné                                  | accepté, précisé par 0025          |
| [0024](0024-roles.md)                                      | Rôles candidat et administrateur, sans accès aux données des candidats                                        | accepté                            |
| [0025](0025-paquets-partages-compiles.md)                  | Paquets du socle livrés compilés, copiés par `install-links`                                                  | accepté                            |
| [0026](0026-ajustements-extraction.md)                     | Ajustements de l'extraction : boucles de fond, migrations au démarrage, fidélité unique                       | **proposé**                        |
| [0027](0027-pieces-justificatives.md)                      | Pièces justificatives jointes au profil ; niveaux déclaré, sourcé, justifié                                   | **proposé**                        |
| [0028](0028-roles-de-l-ia.md)                              | Rôles de l'IA : huit assistants, chacun dans le service propriétaire, rien sans validation                    | **proposé**                        |
| [0029](0029-assistants-evolutions.md)                      | Évolutions des assistants : résultats conservés, modèle par étape, rappels, export traduit                    | **proposé**                        |
| [0030](0030-comptes-identifiant-mot-de-passe.md)           | Comptes par identifiant et mot de passe ; e-mail saisi dans la veille seulement                               | **proposé**                        |
| [0031](0031-sources-offres-allemagne.md)                   | Sources d'offres pour l'Allemagne : Arbeitnow et sites d'employeurs (sans clé), Jooble                        | **proposé**                        |
| [0032](0032-retrait-correspondance-redactrice.md)          | Retrait de la correspondance et de la rédactrice de candidature                                               | **proposé**                        |
| [0033](0033-pays-veille.md)                                | Pays de la veille et des offres : Allemagne, France, Canada, Tunisie                                          | **proposé**                        |
| [0034](0034-catalogue-offres-synchronise.md)               | Catalogue d'offres synchronisé, toutes régions                                                                | **proposé**                        |
| [0035](0035-flux-rss-tunisie.md)                           | Flux RSS publics de sites d'emploi tunisiens (Tanitjobs, Tunisie Travail)                                     | **proposé**                        |
| [0036](0036-usages-cv-par-pays.md)                         | Usages du CV selon le pays visé, photo et informations personnelles                                           | **proposé**                        |
| [0037](0037-export-word.md)                                | Export du CV au format Word (.docx), sans dépendance                                                          | **proposé**                        |
| [0038](0038-import-par-regles.md)                          | Import de CV sans IA, par règles                                                                              | **proposé**                        |
| [0039](0039-codes-de-recuperation.md)                      | Mot de passe oublié par codes de récupération                                                                 | **proposé**                        |
| [0040](0040-suivi-des-candidatures.md)                     | Suivi des candidatures, sans IA                                                                               | **proposé**                        |
| [0041](0041-modeles-de-cv.md)                              | Cinq modèles de CV, tous lisibles par les ATS                                                                 | **proposé**                        |
| [0042](0042-cv-en-ligne.md)                                | CV en ligne partageable                                                                                       | **proposé**                        |
| [0043](0043-exemples-de-cv.md)                             | Exemples de CV par métier                                                                                     | **proposé**                        |
| [0044](0044-extension-navigateur.md)                       | Extension de navigateur « Cibler cette offre »                                                                | **proposé**                        |
| [0045](0045-avis-et-tarifs.md)                             | Emplacements pour les avis et les tarifs, sans contenu inventé                                                | **proposé**                        |
| [0046](0046-tests-de-mutation-et-proprietes.md)            | Tests de mutation (Stryker) et tests de propriétés (fast-check)                                               | **proposé**                        |
| [0047](0047-fournisseurs-llm-multiples.md)                 | Fournisseurs LLM multiples (Claude, Groq, Cerebras, Mistral, OpenRouter, Gemini, Ollama) et repli automatique | **proposé**                        |
| [0048](0048-retrait-du-monolithe-et-ouverture-publique.md) | Retrait du monolithe et préparation de l'ouverture au public                                                  | **proposé**                        |

Format : contexte, décision, options considérées, conséquences. Un ADR accepté n'est jamais réécrit : on le
remplace ou on l'amende par un nouvel ADR, et seule sa ligne de statut reçoit le renvoi.
