# ADR 0026 : Ajustements décidés pendant l'extraction des services et du frontend

- Statut : **proposé** le 2026-10-21, à valider par le chef de projet ; **amende** les ADR
  [0012](0012-communication-entre-services.md) (point 4), [0013](0013-une-base-par-service.md) (point 4),
  [0018](0018-rendu-pdf-centralise.md) (point 2), [0021](0021-cible-execution-et-outillage.md) (point 1) et
  [0022](0022-frontend-react.md) (point 1)
- Décideurs : chef de projet (validation), équipe

## Contexte

L'extraction des six services, de la gateway et du frontend React (phases M2 à M5) a fait apparaître des
écarts entre les ADR acceptés et ce qui s'implémente simplement et correctement. Les ADR acceptés ne sont
pas réécrits (règle 7 de `CLAUDE.md`) : les écarts sont regroupés ici, chacun avec sa raison.

## Décision

1. **Pas de pg-boss dans les services** (amende ADR 0012, point 4). Le travail de fond tient en deux
   boucles locales, plus simples à tester et sans schéma de file à migrer :
   - `auth` : l'outbox RGPD est lue toutes les 5 s par `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP
LOCKED)`, ce qui réserve chaque ligne à une seule instance ; recul exponentiel (10 s à 1 h), abandon et
     journal `ERROR` après 24 h ;
   - `job-watch` : exécution quotidienne sous **verrou consultatif PostgreSQL** (`pg_try_advisory_lock`),
     planifiée chaque minute à l'heure de Paris (`DAILY_RUN_HOUR`) ou lancée par l'administrateur ;
     idempotence par la base (un envoi par abonné et par jour, une offre envoyée une fois). Une relance par
     abonné en cas d'échec.
2. **Migrations jouées au démarrage du service** (amende ADR 0013, point 4), avec son propre rôle, par
   l'API programmatique de `node-pg-migrate` (`MIGRATE_ON_START=true` par défaut). Un conteneur `migrate`
   par service doublerait la pile ; `npm run migrate` reste disponible pour les jouer à part.
3. **L'analyse d'offre a lieu dans `jobs-matching`, à l'enregistrement de l'offre** : `cv-generation` ne
   fait plus que la rédaction et le contrôle de fidélité. Une offre est analysée une fois, quel que soit le
   nombre de CV générés. En cas de panne ou de budget atteint, une analyse sans IA (termes techniques)
   prend le relais, signalée par `providerKind = demo`.
4. **`jobs-matching` entre dans le profil `core`** (amende ADR 0021, point 1) : le parcours principal en a
   besoin pour analyser l'offre collée. `full` ajoute `job-watch`.
5. **Un seul contrôle de fidélité** : `cv-generation` expose `POST /internal/v1/generations/{id}/check`,
   qui contrôle des lignes libres contre l'instantané du profil de la génération. `letters-export` y
   soumet chaque paragraphe de lettre ; un paragraphe rédigé et non prouvé est retiré avant affichage, un
   paragraphe modifié par le candidat est gardé avec ses écarts signalés (comme une ligne de CV).
6. **Lettres rédigées depuis les seules lignes vérifiées du CV ciblé**, et non depuis le profil brut : le
   modèle ne reçoit ni nom, ni coordonnées, ni employeur, et ne peut citer que des faits déjà contrôlés.
7. **Aperçu du CV par `POST /v1/exports/cv/preview`** (amende ADR 0018, point 2, qui prévoyait un GET) :
   la requête porte un corps (génération, variante). L'aperçu est affiché dans un `iframe` `srcdoc` sans
   permission (`sandbox=""`).
8. **Versions du frontend compatibles avec Node 22.18** (précise ADR 0022, point 1) : React Router 7 et
   jsdom 26, car React Router 8 et jsdom 30 exigent Node ≥ 22.22, alors que le poste de référence est en
   22.18.0 (`CLAUDE.md`).
9. **Liens des e-mails vers le frontend** : connexion `…/connexion/{jeton}`, confirmation et désabonnement
   `…/veille/{confirmer|desabonner}/{jeton}` ; ces pages demandent une action explicite (un antivirus qui
   visite les liens ne consomme rien). L'en-tête `List-Unsubscribe` (RFC 8058) vise directement l'API
   `…/api/watch/v1/subscriptions/unsubscribe/{jeton}`, seule à accepter le POST en un clic.
10. **Brouillon du parcours dans `sessionStorage`** : il survit à un rechargement, jamais à la fermeture de
    l'onglet ; le serveur ne reçoit que le profil validé. Les données d'un invité ne sont pas rattachées au
    compte créé ensuite : le profil est réenregistré depuis le brouillon à l'étape 2.
11. **Relecture humaine exigée avant l'export d'un CV reformulé** (case « J'ai relu mon CV »), reprise du
    monolithe : le contrôle déterministe ne voit pas une paraphrase infidèle (ADR 0003).
12. **Adresse de réception de la veille choisie par le candidat** : le formulaire propose l'e-mail du
    profil, sinon celui du compte, et reste modifiable. `job-watch` la garde dans
    `watch_subscription.recipient_email` (NULL : adresse du compte, lue chez `auth` à l'envoi). Toute adresse
    autre que celle du compte, ou modifiée sur une veille active, repasse la veille « en attente » et reçoit
    un lien de double opt-in : aucune offre ne part vers une adresse non confirmée. L'adresse figure dans
    l'export RGPD et disparaît avec la veille.

## Options considérées

| Sujet                | Option retenue                              | Option écartée                    | Raison                                    |
| -------------------- | ------------------------------------------- | --------------------------------- | ----------------------------------------- |
| Travail de fond      | Boucle + `SKIP LOCKED` / verrou consultatif | pg-boss par service               | moins de code et de schéma, même garantie |
| Migrations           | Au démarrage, rôle du service               | Conteneur `migrate` par service   | pile deux fois plus courte                |
| Fidélité des lettres | Appel au contrôle de `cv-generation`        | Copie du contrôle dans le service | une seule règle, aucune divergence        |
| Frontend             | React Router 7, jsdom 26                    | Monter Node à 22.22               | poste de référence imposé en 22.18        |

## Conséquences

- Plus facile : moins de dépendances (aucune pg-boss), un seul contrôle de fidélité à maintenir, une
  analyse d'offre mutualisée.
- Plus difficile : `letters-export` dépend de `cv-generation` pour créer ou modifier une lettre (déjà le cas
  pour lire le CV vérifié) ; la veille quotidienne reste séquentielle (suffisant pour le volume visé).
- À revoir : pg-boss (ou un courtier) si la veille dépasse quelques milliers d'abonnés.
