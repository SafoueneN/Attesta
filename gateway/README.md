# Gateway

> Statut : **pas encore de code** ; construite en Phase 2 ([ADR 0015](../docs/adr/0015-gateway.md)).

Point d'entrée unique de l'API, port 4000. Routage `/api/<service>`, vérification du JWT par JWKS,
limitation de débit, en-têtes de sécurité, `X-Request-Id`, journal d'accès sans donnée personnelle.
Aucune logique métier, aucune base. Les chemins `/internal/*` ne sont jamais routés.
