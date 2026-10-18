# ADR 0013 : Une base par service, une instance PostgreSQL en local

- Statut : accepté le 2026-10-18 ; **amende l'[ADR 0004](0004-donnees-postgres-pgboss.md)** (une base
  unique devient une base par service ; PostgreSQL 16, pgvector et pg-boss sont conservés)
- Décideurs : chef de projet, équipe

## Contexte

Règle du projet : un service possède sa base, et aucun service n'accède à la base d'un autre. Le poste
local a une mémoire limitée (incident du 2026-10-18 : moins de 2 Go libres). Aucune donnée réelle
n'existe : il n'y a pas de migration de données, seulement une répartition des tables.

## Décision

1. **Une instance PostgreSQL 16 + pgvector** dans compose, **une base et un rôle par service** :

   | Base               | Rôle propriétaire  | Tables (héritées de l'ERD v0.4, ou nouvelles avec +)                                                  |
   | ------------------ | ------------------ | ----------------------------------------------------------------------------------------------------- |
   | `attesta_auth`     | `attesta_auth`     | `app_user`, `login_token`, `consent_log`, + `refresh_token`, `audit_event`, `outbox`, schéma `pgboss` |
   | `attesta_profiles` | `attesta_profiles` | `profile_version`, + `llm_usage`                                                                      |
   | `attesta_cvgen`    | `attesta_cvgen`    | + `generation`, `cv_line_trace`, `ia_quota`, `llm_usage`                                              |
   | `attesta_jobs`     | `attesta_jobs`     | `job_posting`, `job_embedding` (pgvector), `esco_cache`, `job_source_run`, + `llm_usage`              |
   | `attesta_watch`    | `attesta_watch`    | `watch_subscription`, `match_result`, `email_delivery`, `email_event`, schéma `pgboss`                |
   | `attesta_letters`  | `attesta_letters`  | + `cover_letter`, `llm_usage`                                                                         |
   | `attesta_web`      | `attesta_web`      | `session` (technique : brouillon du parcours, aucune donnée métier durable)                           |

   La base `attesta` du monolithe reste en service jusqu'à la fin de l'extraction, puis disparaît.

2. **Cloisonnement** : chaque rôle est `LOGIN`, propriétaire de sa seule base ; `CONNECT` est retiré à
   `PUBLIC` sur chaque base, et seul son rôle (et le superutilisateur d'administration) peut s'y connecter.
   Aucun rôle applicatif n'est superutilisateur ni `CREATEDB`. Le cloisonnement est vérifié par un test
   (connexion refusée d'un rôle à la base d'un autre).
3. **Initialisation idempotente** : un service compose `db-init` exécute `infra/postgres/init.sql` à
   chaque démarrage (rôles et bases créés seulement s'ils manquent). L'extension `vector` est créée par
   l'administrateur dans `attesta_jobs` uniquement. Contrairement à `docker-entrypoint-initdb.d`, ce
   mécanisme fonctionne aussi sur un volume existant.
4. **Migrations par service** : `services/<nom>/migrations/*.sql` (node-pg-migrate, déjà utilisé), jouées
   par la commande `migrate` de l'image du service, avec son propre rôle, avant le démarrage. La CI vérifie
   la montée, la descente et la remontée de chaque service.
5. **Pools** : 5 connexions au plus par service en local (7 bases × 5 restent loin de la limite de 100).
6. **Identifiants** : le service `auth` attribue les `user_id` (UUID). Les autres services les stockent
   sans clé étrangère vers une autre base ; la cohérence est assurée par l'événement de suppression
   ([ADR 0019](0019-rgpd-distribue.md)).
7. **Mots de passe** : en local, des valeurs `*-dev-uniquement` définies dans compose (comme aujourd'hui) ;
   hors poste local, ils sont injectés par l'hébergeur. Jamais de vrai secret dans le dépôt.

## Options considérées

| Option                                          | Isolation | RAM locale | Exploitation                                   |
| ----------------------------------------------- | --------- | ---------- | ---------------------------------------------- |
| A. Une instance, une base par service (retenue) | bonne     | ~150 Mo    | simple                                         |
| B. Une instance par service                     | totale    | ~1 Go      | lourde                                         |
| C. Une base, un schéma par service              | moyenne   | ~150 Mo    | simple, mais jointures tentantes entre schémas |

## Conséquences

- Plus facile : chaque service se teste avec sa propre base ; aucune jointure entre domaines n'est
  possible, donc aucun couplage caché.
- Plus difficile : pas de transaction ni de clé étrangère entre services ; les rapports agrégés (coûts LLM,
  export RGPD) passent par les API.
- À revoir en production : une instance managée par service, ou une instance partagée avec les mêmes rôles.
