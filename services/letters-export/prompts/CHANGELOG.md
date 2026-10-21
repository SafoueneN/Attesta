# Journal des prompts du service letters-export

Chaque prompt est versionné dans `prompts/<étape>/vN.md`. Une nouvelle version ne remplace jamais un
fichier existant : on ajoute `vN+1.md` et on met à jour la version déclarée dans `src/letters.ts`
(ADR 0016, point 8). Toute modification passe une relecture humaine.

## 2026-10-21 : lettre v1 (fonction nouvelle)

- `lettre/v1` : lettre de motivation rédigée à partir des seules lignes vérifiées du CV ciblé, chaque
  paragraphe citant ses sources ; exigences non prouvées jamais revendiquées ; trois tons. Chaque
  paragraphe passe ensuite le contrôle de fidélité de `cv-generation` ; un paragraphe non prouvé est
  retiré avant tout affichage.
