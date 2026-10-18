# ADR 0024 : Rôles candidat et administrateur

- Statut : accepté le 2026-10-18 ; **prolonge l'[ADR 0014](0014-authentification-jwt.md)** (revendications
  du jeton)
- Décideurs : chef de projet

## Contexte

Le cahier des charges demande une gestion des rôles (candidat, administrateur) avec des routes
protégées. Le monolithe n'a qu'un type de compte. L'administrateur doit pouvoir suivre la santé de la
plateforme et les coûts LLM, sans accéder aux données des candidats (minimisation, RGPD art. 5-1-c).

## Décision

1. **Deux rôles** : `candidate` (par défaut) et `admin`, dans la colonne `role` de `attesta_auth.app_user`
   et dans la revendication `role` du JWT d'accès. Le jeton d'invité porte `role=guest`.
2. **Attribution** : la variable `ADMIN_EMAILS` d'`auth` (liste séparée par des virgules) donne le rôle
   `admin` à la connexion. Aucune route ne permet de se l'attribuer. Changer la liste prend effet à la
   connexion suivante.
3. **Contrôle en profondeur** : la gateway refuse `/api/*/admin/*` sans `role=admin` (403) ; chaque
   service revérifie le rôle avec le même intergiciel de `packages/http-kit`. Le frontend masque les
   écrans d'administration, ce qui n'est qu'un confort.
4. **Périmètre de l'administrateur** : santé des services (`/ready` agrégé par la gateway), coûts LLM et
   budget du mois par service, nombre de comptes, de générations et d'exécutions de veille, file d'outbox
   RGPD en échec. **Aucune donnée personnelle** : pas de profil, de CV, d'e-mail ni de lettre.
5. **Audit** : chaque appel administrateur est journalisé (`sub`, route, statut), sans corps.

## Options considérées

| Option                                         | Simplicité | Risque                                    |
| ---------------------------------------------- | ---------- | ----------------------------------------- |
| A. Rôle dans le JWT + `ADMIN_EMAILS` (retenue) | forte      | rôle retiré effectif au plus après 15 min |
| B. Permissions fines (RBAC complet)            | faible     | surdimensionné pour deux rôles            |
| C. Console d'administration séparée            | moyenne    | une application de plus à maintenir       |

## Conséquences

- Plus facile : une seule revendication à vérifier ; tests simples (jeton admin et jeton candidat).
- Plus difficile : un rôle retiré reste valide jusqu'à l'expiration du jeton (15 min), comme la
  déconnexion (ADR 0014, point 9).
