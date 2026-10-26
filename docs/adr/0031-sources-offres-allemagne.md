# ADR 0031 : Sources d'offres supplémentaires pour l'Allemagne (Arbeitnow, sites d'employeurs, Jooble)

- Statut : **proposé** le 2026-10-24, à valider par le chef de projet ; **complète** l'ADR
  [0007](0007-veille-emploi.md) (sources de la veille)
- Décideurs : chef de projet (validation), équipe

## Contexte

La veille ne collecte qu'auprès de la Bundesagentur für Arbeit (BA), Adzuna restant inactif faute de clé.
Le porteur du projet veut plusieurs sites d'offres pour l'Allemagne. L'ADR 0007 interdit le scraping :
seules des API publiques ou sous contrat sont admises.

## Décision

1. **Arbeitnow** (DE), API publique gratuite et **sans clé** (« free public API, please do not abuse »,
   lien vers le site apprécié) : active par défaut. L'API ne cherche pas ; elle liste les offres récentes
   (300 par page). Les pages sont lues une fois par exécution (cache de 30 min, 5 pages et 20 requêtes par
   jour au plus), puis filtrées dans le connecteur par métier (mots de l'intitulé), date, ville et rayon ;
   coordonnées tirées du référentiel des villes. Mention « Offres via Arbeitnow » dans les rapports.
2. **Sites carrière des employeurs** (DE), **sans clé** : API publiques de leur logiciel de recrutement,
   faites pour être lues par des tiers (Greenhouse `boards-api`, Lever `postings`, SmartRecruiters
   `postings`). Liste versionnée dans `services/jobs-matching/data/employeurs.json` (23 employeurs au
   départ : HelloFresh, N26, Celonis, Helsing, Doctolib, Bosch, Continental, Sixt…), modifiable sans code.
   Un tableau Greenhouse ou Lever est lu une fois par exécution ; SmartRecruiters cherche côté serveur.
   Période de 14 jours (fraîcheur du matching) : une offre d'employeur reste ouverte des semaines.
3. **Filtrage par intitulé** pour les sources qui ne cherchent pas côté serveur : mots du métier, avec
   quelques équivalents allemand ↔ anglais (Entwickler ↔ Developer, Projektmanager ↔ Project Manager), dans
   l'intitulé et le service seulement (la description, trop générale, ferait remonter tout le monde).
4. **Jooble** (DE, FR), agrégateur, **clé gratuite** (`JOOBLE_API_KEY`), appelé en POST sur le site du pays,
   200 requêtes par jour par défaut. Mention « Jobs by Jooble ». Inactif sans clé.
5. **Adzuna** (DE, FR) inchangé (ADR 0007) ; ses clés sont désormais transmises par `compose.yaml` depuis un
   `--env-file` local (jamais versionné), comme celle de Jooble.
6. `getJson` accepte un corps (POST) ; aucune dépendance ajoutée.

## Options considérées

- **Scraping** (StepStone, Indeed, LinkedIn) : écarté, interdit par l'ADR 0007 et par leurs conditions.
- **EURES** : pas d'API publique de recherche ouverte.

## Conséquences

- Trois sources pour l'Allemagne sans aucune clé (BA, Arbeitnow, sites d'employeurs), cinq avec les clés
  gratuites. Ajouter un employeur : une ligne dans `employeurs.json`.
- Arbeitnow publie beaucoup d'offres en anglais : texte indexé en configuration « simple ».
- Les doublons entre sources ne sont pas fusionnés (même offre publiée sur deux sites) : à traiter si gênant.
- Tests des connecteurs (fausse `fetch`) à écrire à la passe finale.
