# ADR 0004 : PostgreSQL + pgvector, SQL explicite, pg-boss

- Statut : accepté, **amendé par l'[ADR 0009](0009-hebergement-et-execution.md)** (pas de worker pg-boss pour le parcours interactif ; pg-boss en Phase 4), et par l'[ADR 0013](0013-une-base-par-service.md) (une base par service)
- Date : 2026-10-16

## Décision

- **PostgreSQL 16+**, hébergé dans l'UE, avec les extensions `vector` (pgvector) et `pgcrypto`.
- **Accès en SQL explicite** avec `pg` (node-postgres), sans ORM : les requêtes hybrides (FTS, vecteurs, RRF) sont du SQL spécifique qu'un ORM masquerait mal. Les résultats sont validés par Zod en sortie de dépôt.
- **Migrations** : `node-pg-migrate` en mode fichiers SQL (`db/migrations/NNNN_nom.sql`), versionnées et rejouables en CI.
- **File de jobs : pg-boss** (même base, transactions, `singletonKey` pour l'idempotence, retries avec backoff). Pas de Redis ni de BullMQ : aucun besoin de débit qui le justifie aujourd'hui.

## Point d'incertitude : BM25

La recherche plein texte native de PostgreSQL (`ts_rank_cd`) **n'est pas BM25** : elle ne normalise pas la fréquence des termes selon la longueur du document comme le fait BM25. Options :

| Option                                                                  | Pour                      | Contre                                                             |
| ----------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| A. `ts_rank_cd` + GIN, derrière une interface `LexicalRetriever`        | natif partout             | approximation de BM25                                              |
| B. Extension `pg_search` (ParadeDB, BM25 réel)                          | vrai BM25 dans PostgreSQL | rarement disponible chez les hébergeurs PostgreSQL managés de l'UE |
| C. BM25 calculé dans l'application (index en mémoire par lot quotidien) | exact, sans dépendance    | mémoire, reconstruction de l'index                                 |

**Proposition** : A en Phase 4, avec la précision et le rappel mesurés sur le jeu de référence ; passage à B ou C seulement si l'écart est mesurable. La présentation mentionne « BM25 » : il faudra dire « recherche lexicale » tant que l'option A est en place.

## Conséquences

Une seule base à sauvegarder et à restaurer. Si la charge de jobs dépasse ce que PostgreSQL absorbe, la migration vers BullMQ est isolée derrière une interface `JobQueue`.
