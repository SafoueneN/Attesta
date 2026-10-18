# `@attesta/logger`

Journaux JSON (pino) communs à tous les services ([ADR 0020](../../docs/adr/0020-observabilite.md)).
Aucune logique métier.

- `createLogger({ service, level })` : une ligne JSON par événement, avec `service`, `severity`, `time`,
  `message` et le `requestId` de la requête en cours.
- `runWithContext({ requestId }, fn)` : tout journal émis pendant `fn` porte ce `requestId`
  (`http-kit` l'appelle pour chaque requête, les jobs pg-boss pour chaque tâche).
- Masquage (`REDACTED_PATHS`) : cookies, en-tête `Authorization`, corps, profil, offre, lettre, jetons,
  e-mails, noms, téléphones. C'est un filet de sécurité : on ne passe jamais de contenu personnel au
  logger.

```bash
npm run build   # dist/
npm test        # Vitest
```
