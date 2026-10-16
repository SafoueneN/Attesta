# Plan de tests

Convention : Arrange, Act, Assert. Les tests générés par IA sont relus avant le merge. Aucun appel réseau au LLM dans les niveaux 1, 2, 4, 5 et 6.

| Niveau           | Outil                                   | Contenu                                                                                                                    | Seuil de CI                                                                                           | Phase |
| ---------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----- |
| 1. Unitaire      | Vitest                                  | schémas, dates, `resolvePointer`, contrôle de fidélité, gabarit, RRF, déduplication                                        | couverture des lignes ≥ 90 % sur `schema` et le contrôle de fidélité, ≥ 75 % ailleurs (**à valider**) | 0 → 4 |
| 2. Contrat       | Vitest + `FakeProvider`                 | réponses LLM enregistrées (valides, invalides, tronquées) validées par Zod ; relance bornée ; erreur propre après N échecs | 100 % des cas enregistrés                                                                             | 2     |
| 3. Évaluation IA | script `evals/`                         | CV de référence × offres : **0 invention**, couverture des mots-clés, taux de rejet ; matching : précision@10 et rappel@20 | 0 invention (bloquant), couverture ≥ valeur de référence − 5 points                                   | 2, 4  |
| 4. Bout en bout  | Playwright                              | 5 étapes → aperçu → relecture → export PDF ; retour arrière sans perte ; mode dégradé                                      | parcours critiques verts                                                                              | 1     |
| 5. ATS           | Vitest + pdfjs-dist                     | texte extractible, ordre identique au DOM, une colonne, dates uniformes, aperçu = PDF                                      | 100 %                                                                                                 | 1     |
| 6. Accessibilité | axe-core (Playwright) + grille manuelle | WCAG 2.2 AA, clavier, `aria-live`, contrastes clair et sombre                                                              | 0 violation critique ou sérieuse                                                                      | 1     |

## Jeu d'évaluation (`evals/`)

Profils **fictifs** uniquement (aucun vrai CV) : 10 profils × 3 offres pour commencer.

- Persona Léa (back-end) plus des profils variés : reconversion, junior, profil DE, profil EN, profil avec trous de carrière.
- Offres pièges : compétence absente du profil (doit apparaître dans `missingKeywords`), chiffres tentants (« 10 ans d'expérience exigés »), **injection de prompt** dans l'offre, offre en allemand pour un profil en français.
- Métriques : lignes inventées (objectif 0), score de fidélité moyen, couverture des mots-clés présents dans le profil, coût et latence moyens.

Le jeu de matching (Phase 4) consiste en 50 offres annotées à la main comme pertinentes ou non pour 5 profils. Il est **à constituer** par l'équipe, ce qui conditionne la mesure de précision et de rappel.

## État actuel

`packages/schema` : 11 tests unitaires verts (`npm test`).
