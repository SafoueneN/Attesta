# Journal des prompts du service cv-generation

Chaque prompt est versionné dans `prompts/<étape>/vN.md`. Une nouvelle version ne remplace jamais un
fichier existant : on ajoute `vN+1.md` et on met à jour la version déclarée dans `src/pipeline.ts`
(ADR 0016, point 8). Toute modification passe le jeu d'évaluation et une relecture humaine.

## 2026-10-21 : redaction v1 (extraction du monolithe)

- `redaction/v1` : repris sans changement de `prompts/redaction/v1.md` (2026-10-16). Rédaction ligne par
  ligne à partir de faits désignés par pointeur JSON ; interdiction explicite d'inventer ou de gonfler ;
  compétences absentes jamais ajoutées. L'analyse de l'offre est désormais faite par `jobs-matching`.

## 2026-10-23 : assistants du CV (ADR 0028, rôles 2, 3, 4, 6 et 8)

- `juge-fidelite/v1` : verdict de sens par ligne (fidèle, nuance, infidèle), en complément du contrôle
  déterministe.
- `coach-questions/v1` et `coach-retour/v1` : questions d'entretien probables et retour selon la méthode STAR,
  appuyés sur les faits du profil (pointeurs vérifiés par le code).
- `plan-progression/v1` : plan d'apprentissage des seules compétences signalées absentes.
- `traduction/v1` : traduction anglais ou allemand ; une ligne dont les nombres changent est écartée.
- `conseils-ats/v1` : conseils sur des statuts de mots-clés calculés par le code.

## 2026-10-23 : évolutions des assistants (ADR 0029)

- `juge-fidelite/v2` : propose une reformulation fidèle (`suggestion`) pour chaque ligne à revoir ; gardée
  seulement si elle passe le contrôle de fidélité de la ligne. Effort `high`.
- `coach-questions/v2` : niveau d'entretien (`rh`, `manager`, `technique`).
- `coach-retour/v2` : extraits STAR recopiés de la réponse (`highlights`, vérifiés par le code) et question de
  relance du recruteur (`followUp`).
- `traduction/v2` : glossaire métier imposé ; noms propres conservés, vérifiés par le code comme les chiffres.
