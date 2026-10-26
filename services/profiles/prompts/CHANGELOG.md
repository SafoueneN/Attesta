# Journal des prompts du service profiles

Chaque prompt est versionné dans `prompts/<étape>/vN.md`. Une nouvelle version ne remplace jamais un
fichier existant : on ajoute `vN+1.md` et on met à jour la version déclarée dans `src/extraction.ts`
(ADR 0016, point 8).

## 2026-10-21 : extraction-cv v1 (extraction du monolithe)

- `extraction-cv/v1` : repris sans changement de `prompts/extraction-cv/v1.md` (2026-10-16). Recopie d'un
  CV PDF dans le formulaire, sans reformulation ni complétion ; aucune donnée sensible extraite.

## 2026-10-23 : entretien-profil v1, faits-reponse v1 (ADR 0028, rôle 1)

- `entretien-profil/v1` : questions pour préciser les expériences et projets (chiffrer, impact, outils), sans
  jamais suggérer de fait.
- `faits-reponse/v1` : réalisations tirées de la seule réponse du candidat ; tout chiffre absent de la
  réponse fait écarter la proposition par le code. Rien n'entre au profil sans validation du candidat.

## 2026-10-23 : évolutions de l'intervieweuse (ADR 0029)

- `entretien-profil/v2` : parcours trié du moins riche au plus riche (questions d'abord sur les expériences
  sans chiffres) ; sujet facultatif venu du plan de progression.
- `faits-reponse/v2` : question de relance (`followUp`) quand la réponse est vague ; une relance qui contient
  un chiffre est écartée par le code.
