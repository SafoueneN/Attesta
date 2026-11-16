# ADR 0048 : Retrait du monolithe et préparation de l'ouverture au public

- Statut : **proposé** le 2026-10-30, à valider par le chef de projet ; achève l'ADR
  [0011](0011-microservices-extraction.md) (retrait d'`apps/` et de `db/`)
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

Les six services, la gateway et le frontend React couvrent toutes les fonctionnalités. Le monolithe v0.4
(`apps/web`, `apps/worker`, `db/`) et ses paquets (`schema`, `shared`, `llm`, `render`, `jobwatch`) étaient
gelés : son image ne se construisait plus, mais la CI, compose, Playwright et le déploiement continu le
visaient encore, et la suite `e2e/parite` testait son interface. Avant d'ouvrir le dépôt et la plateforme au
public, il fallait aussi des pages légales et un dépôt sans supports internes.

## Décision

1. **Retrait du monolithe** : `apps/`, `db/`, les paquets `schema`, `shared`, `llm`, `render`, `jobwatch`,
   `infra/Dockerfile`, `test-support/` et les services compose `migrate`, `web`, `veille`. Le code reste
   disponible sous le tag `v0.4-monolithe`.
2. **Évaluation de fidélité dans `cv-generation`** : les cas de référence (`evals/cases.ts`) rejoués par
   `tests/evals-fidelite.test.ts` (porte bloquante, comme avant), et l'évaluation du vrai modèle par
   `npm run eval:live`. Les cas sont repris à l'identique ; seule l'analyse de l'offre est fournie en entrée,
   comme le fait jobs-matching en production.
3. **Suite de parité = `e2e/frontend`** sur la pile compose (port 8080) : parcours, comptes par identifiant
   (ADR 0030), recette par user story, accessibilité. `npm run test:parite` la lance ; la CI la joue après
   `npm run demo:seed`. `scripts/smoke.mjs` vérifie la pile (santé, CSP, session invitée vérifiée par un
   service). Trivy analyse chaque image `attesta-*`.
4. **Déploiement continu retiré** (`cd.yml` construisait l'image du monolithe). Il sera réécrit pour les
   microservices par un ADR dédié ; Terraform reste gelé et validé seulement (ADR 0021).
5. **Pages légales** : mentions légales (`/mentions-legales`), conditions générales d'utilisation
   (`/conditions`) et politique de confidentialité complétée (responsable, bases légales, destinataires,
   absence de transfert hors UE, cookies, droits, CNIL), version du 2026-10-30 journalisée avec chaque
   consentement. L'inscription fait accepter les deux textes. L'adresse de contact est fournie au build
   (`VITE_CONTACT_EMAIL`, obligatoire dans `frontend/Dockerfile`), jamais écrite dans le code.
6. **Comptes sans e-mail** : l'inscription et l'écran des codes de récupération disent explicitement qu'un
   compte sans mot de passe ni code ne peut pas être récupéré.
7. **Dépôt public** : les supports de soutenance (`rapport/`, `presentation/`, `presentation-immersive/`,
   `marketing/`) sortent du suivi git et sont ignorés.

## Options considérées

- **Garder le monolithe gelé dans le dépôt** : écarté, il entretenait une CI et une parité qui ne testaient
  plus le produit livré.
- **Garder `e2e/parite` en la réécrivant** : écarté, `e2e/frontend` couvre déjà les mêmes parcours sur la
  nouvelle interface ; deux suites auraient doublé la maintenance.
- **Adresse de contact écrite dans le code** : écartée, elle dépend de l'instance déployée.

## Conséquences

- Une seule pile à tester et à livrer ; `npm test` à la racine ne couvre plus que les paquets partagés.
- L'historique du monolithe se consulte par le tag `v0.4-monolithe`.
- Reste à faire avant un déploiement public : réécrire le déploiement continu, vérifier que l'hébergeur et le
  prestataire d'e-mails nommés par la politique correspondent aux contrats signés, et retirer les routes de
  connexion par lien (`/v1/login-links`) gardées pour d'anciens comptes (ADR 0030, point 6), sans objet sur
  une instance neuve.
