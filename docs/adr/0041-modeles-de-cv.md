# ADR 0041 : Cinq modèles de CV, tous lisibles par les ATS

- Statut : **proposé** le 2026-10-24, à valider par le chef de projet ; **complète** l'ADR
  [0005](0005-rendu-pdf.md)
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

Deux variantes (sobre, soignée) contre 20 à 40 modèles chez les concurrents : le choix du modèle est souvent
le premier déclic d'un candidat.

## Décision

Trois modèles de plus, en CSS seulement sur le même gabarit (`cv.ejs`) : **classique** (empattements,
en-tête centré), **moderne** (bandeau de couleur), **compacte** (marges et interlignes réduits, une page).
Règle commune : une seule colonne, ordre de lecture identique à l'ordre du DOM, texte réel, aucune
information dans une image — chaque modèle reste lisible par les ATS. `CvVariant` passe à cinq valeurs ;
le Word (ADR 0037) garde sa mise en page propre.

## Conséquences

- Ajouter un modèle : une feuille CSS et une ligne dans `CV_VARIANTS`.
- Pas de modèle à deux colonnes : choix assumé, au nom de la lisibilité par les ATS.
