# ADR 0040 : Suivi des candidatures, sans IA

- Statut : **proposé** le 2026-10-24, à valider par le chef de projet ; **modifie** l'ADR
  [0032](0032-retrait-correspondance-redactrice.md) (le suivi était parti avec la rédactrice)
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

Le suivi des candidatures (Teal, Huntr) est la raison de revenir chaque jour sur un site de CV. Il avait été
retiré avec la rédactrice de candidature (ADR 0032), alors qu'il ne dépend pas de l'IA.

## Décision

Page « Mes candidatures » (comptes) : une colonne par étape (à envoyer, envoyée, relancée, entretien, offre
reçue, refus — masquable), une carte par CV ciblé, étape changée en un clic, date d'envoi posée au premier
envoi, note libre. Relance suggérée 10 jours après l'envoi sans nouvelle (`followUpOn`, déjà calculé par
`letters-export`). Aucun assistant : seules les routes de suivi de `letters-export` (table
`application_tracking`) sont réutilisées.

## Conséquences

- Les routes de suivi restent hors du retrait prévu par l'ADR 0032 ; les autres routes de la rédactrice
  peuvent toujours être retirées.
