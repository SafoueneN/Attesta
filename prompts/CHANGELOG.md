# Journal des prompts

Chaque prompt est versionné dans `prompts/<étape>/vN.md`. Une nouvelle version ne remplace jamais un fichier existant : on ajoute `vN+1.md` et on met à jour `PROMPT_VERSIONS` (`packages/llm/src/prompts.ts`). Toute modification doit passer le jeu d'évaluation (`evals/`) et être relue par un humain avant le merge.

## 2026-10-16 : v1 (Phase 2)

- `analyse-offre/v1` : exigences (`must` / `nice`) et mots-clés pondérés, recopiés tels qu'écrits dans l'offre ; consignes injectées dans l'offre ignorées ; aucune variable protégée.
- `redaction/v1` : rédaction ligne par ligne à partir de faits désignés par pointeur JSON ; interdiction explicite d'inventer ou de gonfler ; compétences absentes jamais ajoutées ; exemple positif et négatif.
- `extraction-cv/v1` : recopie d'un CV PDF dans le formulaire, sans reformulation ni complétion ; aucune donnée sensible extraite.
