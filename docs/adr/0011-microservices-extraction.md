# ADR 0011 : Six microservices extraits du monolithe modulaire

- Statut : accepté le 2026-10-18 ; **remplace l'[ADR 0001](0001-monolithe-modulaire-typescript.md)**
- Décideurs : chef de projet (décision Q1 de la Phase 0 de migration), équipe de 6

## Contexte

L'ADR 0001 a retenu un monolithe modulaire et écarté les microservices pour leur coût d'exploitation. Le
contexte a changé : le cours exige **6 microservices, un par membre de l'équipe**, chacun étant une
mini-application complète (CRUD, fonctionnalité avancée, usage du LLM, DevOps, tests). Le monolithe est
livré jusqu'à sa Phase 4 et gelé par le tag `v0.4-monolithe`. Rien n'a été déployé : **aucune donnée de
production n'est à migrer**.

## Décision

1. **Six services**, chacun propriétaire de son code, de sa base, de son API, de ses tests, de son
   `Dockerfile`, de son `README.md` et de son `.env.example` :

   | Service          | Périmètre                                                                      | Code existant extrait                                                                 |
   | ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
   | `auth`           | Comptes, lien magique, JWT, consentements, audit, orchestration RGPD           | `apps/web/src/accounts.ts`, `account-routes.ts`                                       |
   | `profiles`       | Profil candidat versionné (CV source), import de CV PDF                        | `packages/schema` (profil), `packages/llm/src/extraction.ts`, `pdf-text-child.ts`     |
   | `cv-generation`  | Pipeline de CV ciblé, contrôle de fidélité, traçabilité, corrections           | `packages/llm/src/{pipeline,faithfulness,facts}.ts`, `apps/web/src/generation.ts`     |
   | `jobs-matching`  | Offres (saisies et collectées), analyse d'offre, sources, ESCO, matching       | `packages/jobwatch/src/{sources,esco,embeddings,matching,ranking,geo,text}`, `rerank` |
   | `job-watch`      | Abonnements de veille, double opt-in, exécution quotidienne, rapports, e-mails | `packages/jobwatch/src/{daily,mail,anonymize,gaps,usage}`, `apps/worker`              |
   | `letters-export` | Lettres de motivation (**fonction nouvelle**), rendu PDF de tous les documents | `packages/render`                                                                     |

2. **Deux composants transverses** : `gateway/` (point d'entrée unique de l'API, [ADR 0015](0015-gateway.md))
   et `apps/web` (interface EJS, devenue un client de la gateway sans logique métier, [ADR 0012](0012-communication-entre-services.md)).
3. **Code partagé strictement limité**, sans logique métier : `packages/shared-schemas` (contrats Zod),
   `packages/llm-client` ([ADR 0016](0016-llm-client.md)), `packages/logger`, `packages/config` et
   `packages/http-kit` (intergiciels Express communs : corrélation, erreurs, santé, vérification JWT).
   `http-kit` est un **ajout argumenté** à la liste initiale : sans lui, ces intergiciels de sécurité
   seraient copiés sept fois et divergeraient.
4. **Extraction progressive, pas de réécriture** (motif « étrangleur ») : le code est déplacé de `packages/*`
   vers `services/*/src`, avec son historique (`git mv`) et ses tests. Le monolithe reste servi tant qu'une
   fonction n'est pas basculée. Après **chaque** extraction, la suite Playwright de parité
   (`npm run test:parite`) doit rester verte.
5. **Règles de dépendance vérifiées par ESLint** : un service n'importe que `@attesta/{shared-schemas,
llm-client,logger,config,http-kit}` ; jamais un autre service ; un paquet partagé n'importe jamais un
   service. Un service n'accède jamais à la base d'un autre ([ADR 0013](0013-une-base-par-service.md)).
6. Ordre d'extraction : `profiles` (gabarit, Phase 3), puis `cv-generation`, `jobs-matching`, `job-watch`,
   `letters-export`, et enfin `auth` finalisé avec le RGPD distribué (Phase 4). `auth` est démarré dès la
   Phase 2, car tous les autres en dépendent.

## Options considérées

| Option                                    | Complexité | Coût d'exploitation | Conformité au cours | Risque de régression |
| ----------------------------------------- | ---------- | ------------------- | ------------------- | -------------------- |
| A. Garder le monolithe modulaire          | faible     | faible              | **non conforme**    | nul                  |
| B. Réécrire 6 services de zéro            | élevée     | élevé               | conforme            | **élevé**            |
| C. Extraire progressivement (**retenue**) | moyenne    | élevé               | conforme            | maîtrisé (parité)    |

## Conséquences

- Plus facile : un membre de l'équipe possède un service de bout en bout ; les services évoluent, se testent
  et se déploient indépendamment.
- Plus difficile : appels réseau, contrats à tenir, cohérence à terme (suppression RGPD), observabilité
  répartie, environ 4 à 6 Go de RAM pour la pile complète en local.
- Le parcours anonyme est conservé : `auth` délivre un jeton d'invité ([ADR 0014](0014-authentification-jwt.md)).
- À la fin de la Phase 4, `packages/{schema,llm,render,jobwatch,shared}` et `apps/worker` ont disparu,
  absorbés par les services et les paquets partagés ; l'ERD hérité est réparti dans `docs/architecture.md`.

## Actions

1. [x] Tag `v0.4-monolithe`.
2. [ ] Suite de parité verte sur le monolithe avant toute extraction (Phase 1).
3. [ ] Règle ESLint des frontières étendue à `services/*` et `gateway/` (Phase 2, avec le premier code).
