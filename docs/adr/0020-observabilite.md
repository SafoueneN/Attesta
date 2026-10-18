# ADR 0020 : Observabilité répartie

- Statut : accepté le 2026-10-18 ; adapte la section « Observabilité » de `docs/architecture.md` à la
  cible locale ([ADR 0021](0021-cible-execution-et-outillage.md))
- Décideurs : chef de projet, équipe

## Contexte

Une requête traverse désormais jusqu'à quatre processus (web, gateway, cv-generation, profiles). Sans
identifiant commun, un incident ne se diagnostique pas. Les journaux ne doivent contenir aucune donnée
personnelle.

## Décision

1. **Journaux structurés** pino en JSON (déjà utilisé), au format commun fourni par `packages/logger` :
   `time`, `level`, `service`, `requestId`, `msg`, `event` et des champs techniques. Les règles de
   masquage existantes (`redact`) sont étendues et testées.
2. **Corrélation** : `X-Request-Id` est créé par `apps/web` (ou par la gateway pour un appel direct à
   l'API), propagé par le client HTTP de `http-kit`, conservé dans `AsyncLocalStorage` et ajouté à chaque
   ligne de journal. Les jobs pg-boss reçoivent un `requestId` à leur création.
3. **Santé** sur chaque processus :
   - `GET /health` (vivacité) : le processus répond, sans dépendance ; sert à redémarrer un processus bloqué ;
   - `GET /ready` (disponibilité) : base joignable, migrations à jour, configuration valide ; sert aux
     `healthcheck` de compose et à l'ordre de démarrage (`depends_on: condition: service_healthy`).

   Le monolithe garde `/livez` et `/health` jusqu'à son retrait.

4. **Événements métier** conservés et préfixés par service (`generation`, `llm_usage`, `pdf_export`,
   `veille_terminee`…), toujours sans contenu personnel.
5. **Pas de pile de métriques ni de traces distribuées en local** (Prometheus, OpenTelemetry) : coût en
   mémoire disproportionné pour la cible. Les coûts LLM sont lus dans les tables `llm_usage` et affichés
   par le tableau de bord de la Phase 5.

## Options considérées

| Option                                 | RAM locale | Diagnostic d'une requête  | Effort |
| -------------------------------------- | ---------- | ------------------------- | ------ |
| A. Journaux corrélés + santé (retenue) | nulle      | bon (`grep requestId`)    | faible |
| B. OpenTelemetry + Jaeger              | ~500 Mo    | excellent                 | moyen  |
| C. Prometheus + Grafana                | ~400 Mo    | métriques, pas de requête | moyen  |

## Conséquences

- Plus facile : `docker compose logs | grep <requestId>` suit une requête de bout en bout.
- À revoir en production : export OpenTelemetry depuis `packages/logger` et `http-kit`, sans changer les
  services.
