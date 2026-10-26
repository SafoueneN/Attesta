# ADR 0034 : Catalogue d'offres synchronisé, toutes régions

- Statut : **proposé** le 2026-10-24, à valider par le chef de projet ; **complète** les ADR
  [0007](0007-veille-emploi.md), [0031](0031-sources-offres-allemagne.md) et [0033](0033-pays-veille.md)
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

La collecte n'était lancée que pour les critères des veilles actives (métier, ville, rayon) : la page
« Offres collectées » ne montrait que ce que quelques veilles avaient demandé. Le porteur du projet veut une
base synchronisée où l'on trouve les offres de toutes les régions.

## Décision

1. **Synchronisation régulière du catalogue** dans `jobs-matching`, indépendante des veilles : toutes les
   `CATALOGUE_SYNC_HOURS` heures (6 par défaut, 0 la désactive), la première une minute après le démarrage ;
   jamais deux à la fois. Un administrateur peut la lancer à la demande (`POST /v1/admin/catalogue`).
2. **Requêtes sans métier**, pour les quatre pays :
   - sources qui cherchent côté serveur (Bundesagentur, Adzuna, Jooble) : une requête par grande ville
     (8 par pays, 4 en Tunisie), 50 km, offres des 3 derniers jours ;
   - sources filtrées par le code (Arbeitnow, sites d'employeurs) : une requête couvrant tout le pays.
3. **Partage des quotas** : une synchronisation ne consomme que la moitié du quota restant du jour de chaque
   source ; l'autre moitié reste aux veilles des candidats.
4. **Page « Offres collectées »** : volume par pays (filtre en un clic), date de la dernière synchronisation,
   pagination (« Voir plus », 30 offres par page ; `offset` dans `PostingSearch`). Vue
   `GET /v1/postings/overview`.
5. **Qualité d'affichage** : texte des offres débarrassé du HTML échappé (`plainText`), noms lisibles des
   sources (« Site de l'employeur », « Arbeitnow »…).

## Conséquences

- Le catalogue grandit sans veille ; la rétention reste de 60 jours (purge existante).
- Sans clé Jooble ni Adzuna, la Tunisie et les métiers hors tech restent peu couverts (ADR 0033).
- Les offres sont vectorisées à chaque synchronisation (`embedPending`) : coût de calcul proportionnel au
  volume ; en production, à surveiller avec TEI.
