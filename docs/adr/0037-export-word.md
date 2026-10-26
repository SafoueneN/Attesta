# ADR 0037 : Export du CV au format Word (.docx)

- Statut : **proposé** le 2026-10-24, à valider par le chef de projet ; **complète** l'ADR
  [0018](0018-rendu-pdf-centralise.md)
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

Les cabinets de recrutement et de nombreux recruteurs (Allemagne, Canada) demandent un CV au format Word,
qu'ils retouchent ou anonymisent. Seul le PDF était proposé.

## Décision

`POST /v1/exports/cv/docx` (letters-export), même demande que le PDF (`CvExportRequest`) : même modèle de
vue (`CvView`), donc mêmes rubriques, mêmes lignes sourcées et contrôlées, mêmes usages du pays (ADR 0036,
photo comprise). Fichier Office Open XML écrit à la main (`render/docx.ts`), **sans dépendance** : archive
ZIP (`zlib.deflateRawSync`, `zlib.crc32` de Node 22) de cinq parties XML ; une colonne, styles de titres
Word, puces en texte (mieux lues par les ATS). Relecture obligatoire et verdict du juge exigés comme pour
le PDF.

## Conséquences

- Fichier vérifié : ouvert par Microsoft Word (paragraphes, styles et photo reconnus).
- Pas d'annexe de justificatifs dans le Word (PDF seulement).
