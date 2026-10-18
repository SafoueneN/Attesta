# ADR 0021 : Cible d'exécution locale, outillage de l'équipe et tests

- Statut : accepté le 2026-10-18 (décisions Q2 et Q4) ; **remplace pour la soutenance la partie
  « hébergement » de l'[ADR 0009](0009-hebergement-et-execution.md)**, gelée et documentée
- Décideurs : chef de projet

## Contexte

La démonstration se fait en soutenance, sur un poste, avec `docker compose`. Six équipiers doivent
démarrer en une commande, sur Windows comme sous Linux. L'infrastructure Google Cloud (Terraform, CD) est
écrite mais n'a jamais été appliquée. Le projet utilise TypeScript strict et Vitest.

## Décision

1. **Cible officielle : docker-compose en local.** Services sans profil (toujours démarrés) :
   l'infrastructure (`db`, `db-init`, `mailpit`). Profils :

   | Profil | Contenu                                                                          | Usage                   |
   | ------ | -------------------------------------------------------------------------------- | ----------------------- |
   | `core` | parcours principal : web, gateway, auth, profiles, cv-generation, letters-export | développement, démo CV  |
   | `full` | `core` + jobs-matching, job-watch                                                | soutenance, E2E complet |
   | `tei`  | modèle BGE-M3 réel (2 Go)                                                        | optionnel               |

   Pendant la migration, `core` contient le monolithe (`web`, `migrate`), et chaque service y entre au
   moment de son extraction. Commandes : `docker compose --profile core up --build` et
   `docker compose --profile full up --build`.

2. **Ports exposés sur l'hôte**, fixes et modifiables par variables :

   | Composant      | Port | Débogueur |
   | -------------- | ---- | --------- |
   | web            | 3080 | 9229      |
   | gateway        | 4000 | 9230      |
   | auth           | 4001 | 9231      |
   | profiles       | 4002 | 9232      |
   | cv-generation  | 4003 | 9233      |
   | jobs-matching  | 4004 | 9234      |
   | job-watch      | 4005 | 9235      |
   | letters-export | 4006 | 9236      |
   | PostgreSQL     | 5433 | -         |
   | Mailpit        | 8025 | -         |

3. **Devcontainer** : Node 22, accès au Docker de l'hôte, PostgreSQL + pgvector et Mailpit de compose ;
   un équipier ouvre le dossier dans VS Code, choisit « Rouvrir dans le conteneur » et lance les tests.
4. **VS Code versionné** (`.vscode/`) : extensions recommandées, formatage à l'enregistrement, ESLint en
   correction automatique, fins de ligne LF, débogage par composant et tâches (démarrage, tests, lint,
   build).
5. **Tests : TypeScript strict et Vitest conservés** (Q2). L'API de Vitest est compatible avec celle de
   Jest ; une bascule imposée par l'enseignant serait une tâche séparée d'environ une demi-journée.
   Couverture minimale de 80 % sur la logique métier de chaque service ; Playwright pour la parité et les
   parcours ; LLM simulé en test.
6. **CI en matrice** : une entrée par unité (paquets partagés, applications, puis chaque service et la
   gateway dès qu'ils existent), plus les tâches transverses (parité E2E, secrets, images).
7. **Google Cloud gelé** : `infra/terraform`, `cd.yml` et `rollback.yml` sont conservés et documentés
   mais inactifs (le CD ne part pas sans projet Google Cloud). La CI garde `terraform validate`, peu
   coûteux, pour éviter que le code ne pourrisse. Un déploiement réel serait un ADR à part.

## Options considérées

| Option                                    | Démarrage d'un équipier | Coût     | Fidélité à la soutenance |
| ----------------------------------------- | ----------------------- | -------- | ------------------------ |
| A. Compose local + devcontainer (retenue) | une commande            | nul      | identique                |
| B. Déploiement Google Cloud               | compte et facturation   | variable | réseau requis le jour J  |
| C. Kubernetes local (kind, minikube)      | lourd                   | nul      | complexité sans bénéfice |

## Conséquences

- Plus facile : une seule façon de lancer le projet, identique pour l'équipe, la CI et le jury.
- Plus difficile : la pile `full` demande environ 4 à 6 Go de RAM ; le profil `core` est le défaut.
- Le Terraform peut dériver de l'architecture en services ; il sera revu si un déploiement est décidé.
