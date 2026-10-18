# `@attesta/http-kit`

Socle HTTP commun des services. Aucune logique métier, aucune base.

| Export                                                     | Rôle                                                                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `createServiceApp({ service, logger, readiness, routes })` | Express avec, dans l'ordre : helmet, `X-Request-Id`, journal d'accès, JSON (1 Mo), `/health`, `/ready`, routes, 404, erreurs |
| `startServer({ app, port, logger, onClose })`              | Écoute, puis arrêt propre sur SIGTERM et SIGINT                                                                              |
| `AppError`, `notFound`, `forbidden`, `unauthorized`        | Erreurs attendues : code stable, message public en français                                                                  |
| `parseInput(schema, valeur)`                               | Validation Zod, erreur 400 avec la liste des champs                                                                          |
| `buildOpenApi(info, opérations)`, `toYaml`                 | `openapi.yaml` du service, généré depuis les schémas Zod ([ADR 0017](../../docs/adr/0017-contrats-openapi-zod.md))           |

Format d'erreur commun ([ADR 0017](../../docs/adr/0017-contrats-openapi-zod.md)), en
`application/problem+json` :

```json
{
  "type": "urn:attesta:erreur:entree_invalide",
  "title": "Certaines informations sont invalides.",
  "status": 400,
  "errors": [{ "champ": "nom", "message": "Le nom est obligatoire." }],
  "requestId": "0b6f3c1e-1111-4222-8333-444455556666"
}
```

Dépendances : `helmet` ; `express`, `zod` et `@attesta/logger` sont des dépendances pairs, installées par
le service.

```bash
npm run build   # dist/
npm test        # Vitest
```
