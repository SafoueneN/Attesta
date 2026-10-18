# ADR 0018 : Rendu PDF centralisé dans `letters-export`

- Statut : accepté le 2026-10-18 ; **amende l'[ADR 0005](0005-rendu-pdf.md)** (le gabarit unique et
  Puppeteer quittent `packages/render` pour le service `letters-export`)
- Décideurs : chef de projet, équipe

## Contexte

Trois documents sont rendus en PDF : le CV (gabarits `ats` et `design`), la lettre de motivation
(nouvelle) et les deux rapports de veille. Chromium pèse environ 300 Mo en mémoire et exige un profil
seccomp dédié pour garder sa sandbox ([ADR 0009](0009-hebergement-et-execution.md)). Le poste local est
contraint en mémoire.

## Décision

1. **Un seul service embarque Chromium** : `letters-export`. Son image reprend le `Dockerfile` durci
   actuel (non-root, polices, profil `infra/seccomp/chromium.json`).
2. **API de rendu** :
   - `POST /v1/exports/cv` : lit le CV **vérifié** chez `cv-generation` (ou le profil seul chez
     `profiles`, comme l'export sans génération actuel), puis renvoie le PDF ;
   - `GET /v1/exports/cv/preview` : renvoie exactement le HTML imprimé, affiché dans l'aperçu ;
   - `POST /v1/letters/{id}/pdf` : rend une lettre ;
   - `POST /internal/v1/reports/pdf` : rend un rapport de veille à partir des données fournies par
     `job-watch` (jeton de service).
3. **Fidélité** : `letters-export` refuse de rendre un CV dont le rapport de fidélité n'est pas
   « vérifié » ; il ne reçoit jamais de texte libre à la place du CV.
4. **Aucun PDF stocké** (rétention inchangée) : le PDF est produit à la demande et transmis.
5. **Bornes** : concurrence 2, délai de 20 s par rendu (valeurs actuelles), file d'attente bornée,
   réponse `503` au-delà, avec un message en français.

## Options considérées

| Option                                            | Chromium en mémoire | Cohérence du rendu | Couplage                                |
| ------------------------------------------------- | ------------------- | ------------------ | --------------------------------------- |
| A. Rendu centralisé dans letters-export (retenue) | 1 instance          | un seul gabarit    | job-watch et web dépendent d'un service |
| B. Chaque service rend ses PDF                    | jusqu'à 3           | gabarits dupliqués | faible                                  |
| C. Un service de rendu à part (7e)                | 1 instance          | bon                | hors du découpage imposé                |

## Conséquences

- Plus facile : une seule image lourde, un seul profil seccomp, un gabarit cohérent.
- Plus difficile : la veille dépend de `letters-export` pour ses pièces jointes. Parade : reprises côté
  job-watch, et aucun e-mail plutôt qu'un e-mail sans rapport.
