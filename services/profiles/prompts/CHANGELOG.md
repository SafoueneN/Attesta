# Journal des prompts du service profiles

Chaque prompt est versionné dans `prompts/<étape>/vN.md`. Une nouvelle version ne remplace jamais un
fichier existant : on ajoute `vN+1.md` et on met à jour la version déclarée dans `src/extraction.ts`
(ADR 0016, point 8).

## 2026-10-21 : extraction-cv v1 (extraction du monolithe)

- `extraction-cv/v1` : repris sans changement de `prompts/extraction-cv/v1.md` (2026-10-16). Recopie d'un
  CV PDF dans le formulaire, sans reformulation ni complétion ; aucune donnée sensible extraite.
