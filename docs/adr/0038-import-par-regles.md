# ADR 0038 : Import de CV sans IA, par règles

- Statut : **proposé** le 2026-10-24, à valider par le chef de projet ; **complète** l'ADR
  [0006](0006-donnees-personnelles-securite.md) (import PDF)
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

L'import d'un CV PDF n'était possible qu'avec un modèle configuré : sans clé, il renvoyait 503. C'est
pourtant le premier point d'entrée attendu sur un site de CV.

## Décision

1. **Extraction par règles** (`profiles/src/import-rules.ts`) quand aucun modèle n'est configuré, ou en
   repli si le modèle échoue : rubriques reconnues en français, anglais et allemand ; plages de dates
   (« 03/2021 – aujourd'hui », « mars 2021 », « 2019-2021 ») ; année seule pour les formations ; poste,
   employeur et lieu ; puces ; « Catégorie : a, b » pour les compétences ; « Langue – niveau » ; e-mail,
   téléphone, lien et ville de l'en-tête.
2. **Même contrôle** qu'avec l'IA : tout élément doit figurer dans le texte du PDF (`groundExtraction`),
   puis relecture du candidat. Rien n'est deviné : chaque valeur est recopiée du texte.
3. `ImportResult.method` (`ia` ou `regles`) ; le formulaire signale une lecture « sans IA ».

## Conséquences

- L'import fonctionne sur toute installation, clé ou non.
- Moins fin que Claude sur les mises en page atypiques (colonnes, tableaux) : le candidat complète.
