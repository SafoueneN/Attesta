# ADR 0014 : Authentification par lien magique, JWT RS256 et refresh rotatif

- Statut : accepté le 2026-10-18 (décision Q5) ; précise l'[ADR 0010](0010-veille-comptes-envoi.md) pour
  la partie comptes
- Décideurs : chef de projet

## Contexte

Le monolithe connecte l'utilisateur par lien magique (jeton de 15 min, haché en SHA-256) et garde
l'identité dans une session PostgreSQL. Avec six services, chaque service doit vérifier l'identité sans
interroger `auth` à chaque requête. Le parcours anonyme (brouillon et génération sans compte) doit rester
possible, pour la parité fonctionnelle.

## Décision

1. **Connexion inchangée côté utilisateur** : lien magique par e-mail, consentement journalisé, mêmes
   écrans. Le service `auth` reprend `app_user`, `login_token` et `consent_log`.
2. **Jeton d'accès** : JWT signé en **RS256**, durée **15 min**. Revendications : `iss=attesta-auth`,
   `aud=attesta`, `sub` (UUID de l'utilisateur), `scope`, `jti`, `iat`, `exp`. Aucune donnée personnelle
   (pas d'e-mail) dans le jeton.
3. **Refresh token** : valeur opaque de 256 bits, stockée hachée dans `attesta_auth.refresh_token`,
   **rotation à chaque usage**. La réutilisation d'un jeton déjà tourné révoque toute sa famille (vol
   présumé). Expiration : 7 jours d'inactivité, 30 jours au plus.
4. **Cookies** posés par `apps/web` (même origine) : accès dans `attesta_at` et refresh dans `attesta_rt`,
   tous deux `HttpOnly`, `Secure` (sauf sur `http://localhost`), `SameSite=Lax` ; `attesta_rt` est
   restreint au chemin de rafraîchissement. Les formulaires gardent leur jeton CSRF. Aucun jeton n'est
   lisible en JavaScript.
5. **JWKS** : `auth` publie `/.well-known/jwks.json` (identifiant `kid`, deux clés publiées pendant une
   rotation). La **gateway et chaque service** vérifient signature, `exp`, `iss` et `aud` avec un cache des
   clés (défense en profondeur : un service joint en direct sur le réseau interne refuse aussi un jeton
   invalide). Bibliothèque : `jose` (standard, sans dépendance native, cache JWKS intégré).
6. **Clé privée** : `AUTH_PRIVATE_KEY` injectée par l'environnement, jamais dans le dépôt. Hors production,
   `auth` génère une clé éphémère au démarrage si elle manque (les jetons deviennent invalides au
   redémarrage, ce qui est acceptable en local) ; en production, son absence empêche le démarrage.
7. **Jeton d'invité** pour le parcours anonyme : `sub=guest_<uuid>`, `scope=guest`, 2 h, renouvelable
   dans la limite de 24 h, sans refresh token. Chaque service purge les données d'invité après 24 h, comme
   l'actuelle session ([ADR 0006](0006-donnees-personnelles-securite.md)).
8. **Jeton de service** : `auth` émet sur `/internal/v1/token` un JWT de 5 min pour un service authentifié
   par son secret (`SERVICE_SECRET_<NOM>`, injecté), avec une audience et une portée minimales
   (`users:delete`, `users:export`, `matching:run`…).
9. **Déconnexion** : révocation de la famille de refresh tokens ; le jeton d'accès expire dans les 15 min
   (fenêtre acceptée, pas de liste de révocation).

## Options considérées

| Option                                          | Vérification locale | Révocation | Remarque                                      |
| ----------------------------------------------- | ------------------- | ---------- | --------------------------------------------- |
| A. JWT RS256 + JWKS + refresh rotatif (retenue) | oui                 | ≤ 15 min   | complexité moyenne                            |
| B. JWT HS256 à secret partagé                   | oui                 | ≤ 15 min   | chaque service pourrait **forger** des jetons |
| C. Sessions opaques vérifiées par `auth`        | non (appel réseau)  | immédiate  | `auth` devient un point de passage obligé     |

## Conséquences

- Plus facile : aucun service ne dépend d'`auth` à chaque requête ; l'identité est vérifiable partout.
- Plus difficile : rotation des clés et familles de refresh tokens, à tester précisément (réutilisation,
  expiration, déconnexion).
- Les tests utilisent une paire de clés générée à la volée ; aucune clé n'est commitée.
