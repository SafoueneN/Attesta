# ADR 0033 : Pays de la veille et des offres : Allemagne, France, Canada, Tunisie

- Statut : **proposé** le 2026-10-24, à valider par le chef de projet ; **complète** les ADR
  [0007](0007-veille-emploi.md), [0010](0010-veille-comptes-envoi.md) et [0031](0031-sources-offres-allemagne.md)
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

La veille et les offres collectées ne couvraient que l'Allemagne et la France. Le porteur du projet veut
quatre régions principales : Tunisie, Canada, Allemagne et France.

## Décision

1. **Pays** : `Country` vaut `DE | FR | CA | TN` dans les contrats ; contrainte de `watch_subscription`
   élargie (migration `1762000000000_pays.sql` de `job-watch`).
2. **Villes** : référentiel GeoNames (CC BY 4.0) des villes de plus de 15 000 habitants régénéré pour les
   quatre pays (`scripts/build-villes.mjs`) : 1 141 en Allemagne, 692 en France, 512 au Canada, 130 en
   Tunisie ; exonymes des grandes villes (Montreal/Montréal, Quebec City/Québec).
3. **Langues** : intitulés ESCO cherchés en allemand (DE), en français (FR), en anglais puis français (CA),
   en français puis anglais (TN). Offres anglaises indexées en configuration « english » (migration
   `1762000000000_anglais.sql` de `jobs-matching`) et recherche lexicale française, allemande et anglaise.
4. **Sources** :
   - sites carrière des employeurs (ADR 0031) étendus aux quatre pays : le lieu de chaque offre est résolu
     dans le pays recherché ; 52 employeurs, dont des employeurs présents en France (Doctolib, Datadog,
     Mirakl, Talan…) et au Canada (Stripe, GitLab, Okta, Lyft…), sans clé ;
   - Adzuna : Canada en plus (salaires en dollars non repris : seuls les salaires en euros le sont) ;
   - Jooble : Canada et Tunisie en plus ;
   - Bundesagentur et Arbeitnow restent propres à l'Allemagne.

## Conséquences

- **Tunisie** : aucune API publique sans clé n'apporte de volume (employeurs tunisiens absents de
  Greenhouse, Lever, SmartRecruiters et Workable ; quelques offres Bosch et Delivery Hero). La clé gratuite
  Jooble est nécessaire pour une veille utile en Tunisie.
- **Canada et France** : plusieurs centaines d'offres sans clé, surtout dans la tech ; Adzuna et Jooble
  élargissent aux autres métiers.
- Les salaires restent exprimés en euros ; aucun montant en dollars ou en dinars n'est converti.
- Tests à adapter à la passe finale (pays, villes, langues, connecteurs).
