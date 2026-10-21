# Journal des prompts du service cv-generation

Chaque prompt est versionné dans `prompts/<étape>/vN.md`. Une nouvelle version ne remplace jamais un
fichier existant : on ajoute `vN+1.md` et on met à jour la version déclarée dans `src/pipeline.ts`
(ADR 0016, point 8). Toute modification passe le jeu d'évaluation et une relecture humaine.

## 2026-10-21 : redaction v1 (extraction du monolithe)

- `redaction/v1` : repris sans changement de `prompts/redaction/v1.md` (2026-10-16). Rédaction ligne par
  ligne à partir de faits désignés par pointeur JSON ; interdiction explicite d'inventer ou de gonfler ;
  compétences absentes jamais ajoutées. L'analyse de l'offre est désormais faite par `jobs-matching`.
