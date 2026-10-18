# ADR 0022 : Frontend React + Vite, client de la gateway

- Statut : accepté le 2026-10-18 ; **remplace la partie « interface EJS » de l'[ADR 0011](0011-microservices-extraction.md)**
  et **amende le point 4 de l'[ADR 0014](0014-authentification-jwt.md)** (pose et lecture des cookies)
- Décideurs : chef de projet

## Contexte

L'ADR 0011 gardait `apps/web` (Express + EJS, rendu serveur) comme client de la gateway. Le cahier des
charges de la migration demande une application web en **React + Vite + TypeScript + Tailwind CSS**, avec
routage, routes protégées, rôles, React Query, toasts et validation Zod côté client, qui consomme
**uniquement la gateway**. `apps/web` reste la référence de la suite de parité tant que le nouveau
frontend ne la passe pas.

## Décision

1. **`frontend/`** : application monopage React 19, Vite, TypeScript strict, Tailwind CSS, React Router
   (routes protégées par rôle, [ADR 0024](0024-roles.md)), TanStack Query pour l'état serveur, schémas Zod
   de `packages/shared-schemas` pour valider les formulaires. Une couche `src/api/` est la seule à appeler
   `fetch` ; les composants passent par des hooks React Query.
2. **Même origine** : en production locale (compose), le frontend est servi par un nginx non-root qui
   sert les fichiers statiques et relaie `/api/*` vers la gateway. En développement, le serveur Vite relaie
   `/api` vers `http://localhost:4000`. Aucune CORS à ouvrir, et les cookies restent de première partie.
3. **Jetons** (amende ADR 0014, point 4) :
   - le **jeton d'accès** (15 min) est renvoyé dans le corps et gardé **en mémoire** (jamais dans
     `localStorage`) ; il part dans `Authorization: Bearer` ;
   - le **refresh token** est posé par `auth`, via la gateway, dans le cookie `attesta_rt` :
     `HttpOnly`, `Secure` (sauf `http://localhost`), `SameSite=Strict`, `Path=/api/auth/v1/session` ;
   - au chargement et sur une réponse 401, la couche `api/` appelle `POST /api/auth/v1/session/refresh`
     une seule fois (requêtes concurrentes regroupées), puis rejoue la requête ;
   - protection CSRF : `SameSite=Strict` sur le seul cookie, et en-tête `X-Attesta-Csrf: 1` exigé par
     `auth` sur les routes qui lisent ce cookie (une requête intersite ne peut pas l'ajouter sans
     déclencher une vérification CORS, que la gateway refuse).
   - Le parcours anonyme utilise le **jeton d'invité** de l'ADR 0014 (point 7), gardé en mémoire et
     doublé d'un cookie `attesta_guest` du même type que `attesta_rt` pour survivre à un rechargement.
4. **SSE** : la progression de la génération est lue par `fetch` en flux (et non `EventSource`, qui ne
   permet pas d'envoyer l'en-tête `Authorization`).
5. **Accessibilité** WCAG 2.1 AA : axe-core dans chaque test Playwright, focus géré à chaque changement
   de route, résumé d'erreurs focalisé, thèmes clair et sombre. Les acquis de `apps/web` (libellés,
   messages, parcours en 5 étapes, retour sans perte) sont repris à l'identique.
6. **Retrait d'`apps/web`** : en Phase M5, quand `e2e/parite`, adaptée au nouveau frontend, est verte sur
   `--profile full`. Jusque-là, les deux interfaces coexistent (3080 : EJS, 5173 en dev / 8080 en compose :
   React).

## Options considérées

| Option                                            | Conforme au cahier des charges | Fonctionne sans JS | Travail                   |
| ------------------------------------------------- | ------------------------------ | ------------------ | ------------------------- |
| A. React + Vite, même origine via nginx (retenue) | oui                            | non                | réécriture des écrans     |
| B. Garder `apps/web` (EJS)                        | non                            | oui                | faible                    |
| C. Next.js (rendu serveur)                        | partiellement (pas Vite)       | partiellement      | serveur Node en plus, BFF |
| D. Jetons dans `localStorage`                     | oui                            | non                | faible, **vol par XSS**   |

## Conséquences

- Plus facile : interface riche (aperçu, relecture ligne par ligne, tableaux de bord), équipe frontend
  indépendante, déploiement statique.
- Plus difficile : le parcours ne fonctionne plus sans JavaScript (perte acceptée, signalée dans
  `docs/conformite.md`) ; deux interfaces à maintenir jusqu'en M5 ; la parité doit être réécrite avec les
  mêmes scénarios.
- À revoir : si le frontend est servi depuis un autre domaine que l'API, revoir les cookies et la CSRF.
