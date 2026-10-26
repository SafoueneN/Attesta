# Journal des prompts du service letters-export

Chaque prompt est versionné dans `prompts/<étape>/vN.md`. Une nouvelle version ne remplace jamais un
fichier existant : on ajoute `vN+1.md` et on met à jour la version déclarée dans `src/letters.ts`
(ADR 0016, point 8). Toute modification passe une relecture humaine.

## 2026-10-21 : lettre v1 (fonction nouvelle)

- `lettre/v1` : lettre de motivation rédigée à partir des seules lignes vérifiées du CV ciblé, chaque
  paragraphe citant ses sources ; exigences non prouvées jamais revendiquées ; trois tons. Chaque
  paragraphe passe ensuite le contrôle de fidélité de `cv-generation` ; un paragraphe non prouvé est
  retiré avant tout affichage.

## 2026-10-23 : reponse-formulaire v1, message-recruteur v1 (ADR 0028, rôle 7)

- Réponses aux formulaires et messages au recruteur, à partir des seules lignes vérifiées du CV ; chaque
  paragraphe est contrôlé par cv-generation, les formules d’ouverture et de politesse sans fait.

## 2026-10-23 : évolutions de la rédactrice (ADR 0029)

- `reponse-formulaire/v2` : ton (`sobre`, `chaleureux`, `dynamique`) et longueur (`court`, `moyen`, `long`).
- `message-recruteur/v2` : ton ; note LinkedIn de 300 caractères au plus, garantie par le code (coupe à la
  phrase).
- `traduction-lettre/v1` : lettre traduite en anglais ou en allemand ; paragraphe écarté si ses chiffres
  changent.
