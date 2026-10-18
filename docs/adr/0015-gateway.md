# ADR 0015 : Gateway d'API

- Statut : accepté le 2026-10-18
- Décideurs : chef de projet, équipe

## Contexte

Six services exposent une API. Il faut un point d'entrée unique qui applique les protections communes
(identité, limitation de débit, en-têtes, corrélation) avant d'atteindre un service, sans y mettre de
logique métier.

## Décision

1. **Express 5 + `http-proxy-middleware`** dans `gateway/` : Express est déjà la pile du projet, et le
   mandataire gère les flux, dont le SSE, sans mise en mémoire tampon.
2. **Routage par préfixe** : `/api/auth` → auth, `/api/profiles` → profiles, `/api/cv` → cv-generation,
   `/api/jobs` → jobs-matching, `/api/watch` → job-watch, `/api/letters` → letters-export. Le préfixe est
   retiré avant transmission. Les chemins `/internal/*` ne sont **jamais** routés.
3. **Identité** : vérification du JWT par JWKS ([ADR 0014](0014-authentification-jwt.md)) sur toutes les
   routes, sauf une liste blanche explicite et testée : demande et consommation du lien magique,
   rafraîchissement, JWKS, confirmation et désabonnement de veille par jeton, webhook du fournisseur
   d'e-mail (qui a sa propre authentification).
4. **Limitation de débit** (`express-rate-limit`, déjà utilisé) : plafond global par IP, plafonds serrés
   sur la demande de lien magique, la génération et l'export. Stockage en mémoire : une seule instance de
   gateway en local ; à reporter sur un stockage partagé en cas de mise à l'échelle.
5. **En-têtes** : `helmet` (déjà utilisé), pas de `X-Powered-By` ; taille des corps limitée (1 Mo, 10 Mo
   pour l'import PDF).
6. **Corrélation** : `X-Request-Id` accepté s'il est bien formé (UUID), sinon généré, puis transmis au
   service et renvoyé dans la réponse ([ADR 0020](0020-observabilite.md)).
7. **Journal d'accès** sans donnée personnelle : méthode, route normalisée (jetons de lien remplacés par
   `:jeton`), statut, durée, `requestId`. Ni corps, ni chaîne de requête, ni en-tête `Authorization`.
8. **Délais** : 10 s par défaut, 120 s pour la génération et l'export, aucun délai d'inactivité sur le
   flux SSE tant que des événements arrivent.

## Options considérées

| Option                                       | Apprentissage | Logique en TypeScript, testable | Infra en plus         |
| -------------------------------------------- | ------------- | ------------------------------- | --------------------- |
| A. Express + http-proxy-middleware (retenue) | faible        | oui (supertest)                 | non                   |
| B. Traefik ou nginx                          | moyen         | non (configuration, plugins)    | une image             |
| C. Kong, Tyk                                 | élevé         | plugins Lua ou Go               | une image et une base |

## Conséquences

- Plus facile : protections communes écrites une fois, testées comme du code.
- Plus difficile : la gateway est un point unique de défaillance en local ; elle reste sans état, avec
  `/health` et `/ready`, et redémarre automatiquement.
- La gateway ne connaît aucun schéma métier : elle ne contrôle que l'identité, la taille et le débit.
- `http-proxy-middleware` est la seule dépendance nouvelle : mandataire HTTP éprouvé, compatible SSE.
