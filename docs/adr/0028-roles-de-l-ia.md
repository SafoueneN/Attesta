# ADR 0028 : Rôles de l'IA (assistants)

- Statut : **proposé** le 2026-10-23, à valider par le chef de projet ; **précise** les ADR
  [0003](0003-pipeline-llm.md) (fidélité) et [0016](0016-llm-client.md) (accès au modèle)
- Décideurs : chef de projet (validation), équipe

## Contexte

L'IA ne servait qu'à quatre étapes (analyse d'offre, rédaction du CV, lettre, import de CV). Le candidat
attend davantage d'aide : enrichir son profil, préparer l'entretien, comprendre une offre, traduire, répondre
aux formulaires. Chaque nouveau rôle doit respecter la promesse d'Attesta : rien n'est inventé.

## Décision

1. **Règle commune** : l'IA propose, explique et conseille ; elle n'ajoute jamais un fait au profil ni au CV
   sans validation explicite du candidat. Tout texte destiné à un recruteur est contrôlé contre les faits
   (comme la lettre, ADR 0026 point 5). Chaque réponse indique `providerKind` (modèle ou démonstration).
2. **Huit rôles, chacun dans le service qui possède ses données** :

   | Rôle                             | Service          | Garde-fou déterministe                                                    |
   | -------------------------------- | ---------------- | ------------------------------------------------------------------------- |
   | 1. Intervieweuse de profil       | `profiles`       | proposition écartée si un chiffre n'est pas dans la réponse du candidat   |
   | 2. Juge de fidélité              | `cv-generation`  | s'ajoute au contrôle existant, ne le remplace pas                         |
   | 3. Coach d'entretien             | `cv-generation`  | sources citées = pointeurs existants du profil                            |
   | 4. Plan de progression           | `cv-generation`  | ne porte que sur les mots-clés signalés absents                           |
   | 5. Explication de correspondance | `jobs-matching`  | compétences « présentes » = trouvées dans le profil                       |
   | 6. Traduction fidèle             | `cv-generation`  | ligne écartée si ses chiffres diffèrent de l'original                     |
   | 7. Rédactrice de candidature     | `letters-export` | phrases contrôlées par `cv-generation`, sans source : retirées            |
   | 8. Conseillère ATS               | `cv-generation`  | statut de chaque mot-clé calculé par le code, l'IA ne fait que conseiller |

3. **Plomberie commune** dans `llm-client` : `assist()` (données balisées, sortie validée par schéma,
   relances bornées, panne traduite en « indisponible »). Prompts versionnés dans chaque service.
4. **Profil transmis à `jobs-matching`** pour l'explication de correspondance : c'est la donnée du candidat
   qui demande, déjà affichée ; cela évite une nouvelle dépendance de service à service.
5. **Mode démonstration réaliste** : chaque rôle a un gestionnaire sans modèle, construit à partir des
   données réelles (profil, offre, CV), clairement étiqueté « Démonstration » dans l'interface.
6. **Budget** : mêmes plafonds par service (`LLM_MONTHLY_BUDGET_EUR`, coupure automatique, ADR 0016).
7. **Exclu** : la lecture des pièces justificatives par l'IA (ADR 0027).

## Options considérées

| Sujet          | Option retenue                   | Option écartée                 | Raison                                            |
| -------------- | -------------------------------- | ------------------------------ | ------------------------------------------------- |
| Emplacement    | Service propriétaire des données | Nouveau service « assistants » | pas de copie de données entre services            |
| Ajout de faits | Validation du candidat           | Ajout automatique              | « L'IA reformule, le candidat décide » (ADR 0003) |
| Traduction     | Lignes traduites et contrôlées   | Export PDF traduit             | libellés du PDF en français ; à faire ensuite     |

## Conséquences

- Plus facile : l'IA devient utile de l'enrichissement du profil jusqu'à l'entretien.
- Plus difficile : davantage d'appels au modèle (surveillés par le budget) et de prompts à évaluer.
- À revoir : export PDF traduit ; évaluations dédiées (`evals/`) pour chaque nouveau prompt.
