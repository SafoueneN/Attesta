# ADR 0045 : Emplacements pour les avis et les tarifs, sans contenu inventé

- Statut : **proposé** le 2026-10-25, à valider par le chef de projet
- Décideurs : porteur du projet (contenus), chef de projet (validation)

## Contexte

Les sites de CV affichent avis d'utilisateurs et formules. Attesta n'a ni avis réels ni décision sur son
modèle économique : inventer l'un ou l'autre serait trompeur.

## Décision

1. **Avis** (`frontend/src/lib/offer.ts`, `REVIEWS`) : seulement de vrais utilisateurs, avec la date de leur
   accord écrit ; la section de l'accueil n'apparaît que s'il y en a.
2. **Tarifs** (`/tarifs`) : tant que `PLANS` est vide, la page annonce la gratuité du lancement et liste ce
   qui est inclus ; les formules s'affichent dès qu'elles sont renseignées. Aucun paiement n'est implémenté.

## Conséquences

- Décision commerciale à prendre par le porteur du projet (formules, prix, ce qui reste gratuit), puis
  intégration d'un prestataire de paiement (nouvel ADR).
