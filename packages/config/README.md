# `@attesta/config`

Lecture de l'environnement d'un service, validée par Zod au démarrage. Aucune logique métier.

- `loadEnv(schema)` : valide `process.env` ; en cas d'erreur, `ConfigError` liste **toutes** les variables
  invalides, sans jamais recopier leur valeur. Le service s'arrête avant d'écouter.
- `serviceEnv(port)` : `NODE_ENV`, `PORT` (défaut propre au service), `LOG_LEVEL`, `TRUST_PROXY`.
- `databaseUrl`, `serviceUrl` (URL ou `mock`, [ADR 0023](../../docs/adr/0023-autonomie-des-services.md)),
  `envBool(défaut)`.

Chaque service déclare son schéma dans `src/config.ts` et documente chaque variable dans `.env.example`.

```bash
npm run build   # dist/
npm test        # Vitest
```
