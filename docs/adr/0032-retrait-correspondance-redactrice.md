# ADR 0032 : Retrait de la correspondance et de la rédactrice de candidature

- Statut : **proposé** le 2026-10-24, à valider par le chef de projet ; **modifie** les ADR
  [0028](0028-roles-de-l-ia.md) (rôles 5 et 7) et [0029](0029-assistants-evolutions.md)
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

Le porteur du projet ne veut plus voir dans la plateforme deux des huit assistants : la **correspondance**
(rôle 5 : score et explication offre ↔ profil, comparateur d'offres) et la **rédactrice de candidature**
(rôle 7 : réponses de formulaire, messages LinkedIn, relance et remerciement, suivi des candidatures).

## Décision

1. **Interface** : les deux assistants disparaissent du Studio IA (six assistants, raccourcis 1 à 6), du
   centre de contrôle (score de préparation sur le profil, le CV et l'entretien), de la page d'un CV et de
   la page Offres (plus de score « pour vous », de tri par correspondance, de panneau d'explication ni de
   comparateur ; la liste est triée par date). Le suivi des candidatures, porté par la rédactrice, part avec
   elle. Les scènes, le calcul de couverture et les appels d'API correspondants sont supprimés du frontend.
2. **Données de démonstration** : plus de messages, de réponses de formulaire ni de suivi.
3. **Services** : les routes restent pour l'instant (`jobs-matching` `/v1/postings/{id}/explain` et
   `/v1/postings/scores` ; `letters-export` `/v1/applications/*`), sans client. Leur retrait (code, tables
   `application_text` et `application_tracking`, prompts, contrats) fera l'objet d'un lot séparé, avec
   migration de suppression des tables.

## Conséquences

- Les candidats ne voient plus de score de correspondance par offre ; la veille garde son propre classement.
- Les rappels de « relance » restent possibles (plan de progression et compte), sans assistant pour rédiger.
- Tests à adapter à la passe finale (Studio, offres, centre de contrôle).
