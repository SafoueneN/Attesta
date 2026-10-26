# ADR 0035 : Flux RSS publics de sites d'emploi tunisiens

- Statut : **proposé** le 2026-10-24, à valider par le chef de projet ; **complète** les ADR
  [0033](0033-pays-veille.md) et [0034](0034-catalogue-offres-synchronise.md)
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

Aucune source sans clé ne couvrait la Tunisie (2 offres au catalogue). Les grands sites tunisiens n'ont pas
d'API publique et le scraping est exclu (ADR 0007). Deux d'entre eux publient un flux RSS public, fait pour
être repris : Tanitjobs (`/rss/`, les 10 dernières offres) et Tunisie Travail (`/feed/`, environ 250
annonces).

## Décision

1. **Connecteur RSS** (`sources/rss.ts`), une source par site, sans dépendance (lecture du XML par
   expressions régulières : titre, lien, date, description, catégories). Seul le flux est lu, jamais les
   pages des annonces ; chaque offre renvoie à son annonce d'origine avec la mention « Offres via … ».
2. **Lecture propre à chaque site** : Tanitjobs donne la ville et l'employeur en tête de description ;
   Tunisie Travail met la ville dans les catégories et l'employeur dans le titre (« X recrute … »). Tunisie
   Travail publie aussi des concours et articles : seules les annonces « … recrute … » sont reprises. Les
   annonces de postes à l'étranger sont écartées ; une ville non reconnue est rattachée à Tunis.
3. **Synchronisation** : le flux est lu une fois par exécution (cache de 30 min), 20 lectures par jour au
   plus (`RSS_DAILY_REQUESTS`), dans la synchronisation du catalogue et les veilles en Tunisie ; offres des
   14 derniers jours. Désactivable (`RSS_ENABLED=false`).

## Conséquences

- La Tunisie passe de 2 à une centaine d'offres consultables, dans 17 villes.
- Tanitjobs n'expose que ses 10 dernières offres : le catalogue les accumule au fil des synchronisations.
- Descriptions courtes (extrait du flux) : matching et analyse portent sur moins de texte.
- Conditions d'utilisation des deux sites à confirmer avant une mise en production (le robots.txt
  n'interdit pas les flux) ; un site qui retire ou change son flux fait seulement échouer sa source.
