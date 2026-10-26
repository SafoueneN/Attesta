# ADR 0043 : Exemples de CV par métier

- Statut : **proposé** le 2026-10-25, à valider par le chef de projet
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

Les candidats bloqués devant une page blanche cherchent des exemples par métier ; c'est aussi la première
source de trafic naturel des sites de CV (« exemple CV comptable », « Lebenslauf Entwickler »).

## Décision

Pages publiques `/exemples-cv` et `/exemples-cv/{métier}` (frontend, sans compte, sans appel serveur) : cinq
métiers au départ (développeur back-end, data analyst, comptable, développeur front-end junior, chef de
projet), chacun avec un CV fictif aux réalisations chiffrées, des conseils et les usages par pays. Données
dans `pages/Examples.tsx`. Chaque page rappelle que rien n'est recopié : le CV d'un candidat vient de son
propre parcours.

## Conséquences

- Ajouter un métier : une entrée dans `EXAMPLES`.
- Pour le référencement, un rendu côté serveur ou un pré-rendu sera nécessaire (application monopage).
