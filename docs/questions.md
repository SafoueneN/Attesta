# Questions ouvertes (Phase 0)

Chaque question vient avec une **proposition par défaut**. Sans réponse, la proposition sera appliquée et signalée.

## Phase 1 : décisions prises le 2026-10-16

| #   | Question                          | Décision                                                                                                                                | Justification                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | TypeScript strict ?               | **Oui.** TypeScript strict, compilé par `tsc` vers JavaScript qui s'exécute sur Node 22.                                                | Le contrat Zod est typé de bout en bout (`z.infer`) : une sortie LLM ou un formulaire mal câblé casse la compilation, pas la production. TypeScript reste du Node.js à l'exécution ; le seul coût est une étape de build.                                                                         |
| Q2  | Rétention                         | **Anonyme : 2 h d'inactivité glissante, plafond absolu de 24 h.** **Comptes : purge après 12 mois d'inactivité**, prévenance à 11 mois. | Une session de rédaction dure moins de 2 h ; le plafond de 24 h empêche qu'un onglet ouvert prolonge indéfiniment la conservation. On retient 12 mois (borne basse de la fourchette 12–24) par minimisation (RGPD, art. 5-1-e) : un compte inactif depuis un an a peu de valeur pour le candidat. |
| Q3  | Phase 1 anonyme seulement ?       | **Oui.** Les comptes arrivent en Phase 2, les tables associées avec eux.                                                                | Les comptes apportent authentification, vérification d'e-mail, consentement et droits RGPD : un chantier entier sans valeur tant que rien n'est à sauvegarder. Livrer d'abord le parcours CV complet réduit le risque.                                                                            |
| Q4  | Interface en français seulement ? | **Oui pour le contenu**, mais tous les libellés passent dès maintenant par un dictionnaire (`fr`).                                      | Ajouter l'allemand pour le pilote de la Phase 4 consistera à ajouter un fichier, sans réécrire les vues. Les titres de section du CV suivent la même règle.                                                                                                                                       |

## Phase 2 : décisions prises le 2026-10-16

| #   | Question                  | Décision                                                                                                                      | Justification                                                                                                                                                                                      |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q5  | Fournisseur et modèle LLM | **Claude (`claude-opus-5-5`) sur Google Cloud Vertex AI, région `eu`** ; production limitée à `vertex` ou `none`              | Seule option étudiée qui réunit sorties structurées et traitement documenté dans l'UE ; l'API Anthropic directe n'offre pas d'ancrage UE. Détail : [ADR 0008](adr/0008-fournisseur-llm.md).        |
| Q6  | Budget par CV, quota      | **Révisé** : plafond de 0,30 $ par CV (mode dégradé au-delà) ; 10 générations par session et par jour, 10 par heure et par IP | L'hypothèse de 0,05 € est irréaliste avec Opus 5.5 (estimation de 0,12 à 0,18 $, non mesurée). **À trancher par l'équipe** : passer à Sonnet 5.5 pour réduire le coût, après mesure de la qualité. |
| Q7  | Température               | **Sans objet** : les modèles actuels refusent ce paramètre. Effort `low` (analyse, extraction) et `medium` (rédaction).       | Stabilité obtenue par schéma strict, relances bornées et contrôle déterministe.                                                                                                                    |
| Q8  | Mode dégradé              | **Oui** : CV assemblé depuis le profil, sans réécriture, avec un message explicite                                            | Couvre indisponibilité, refus, budget dépassé et sortie non conforme.                                                                                                                              |
| Q9  | Lignes non prouvées       | **Retirées par défaut**, listées avec leur raison ; le candidat peut corriger son profil puis régénérer                       | « Signalé, jamais ajouté ». Une ligne modifiée par le candidat n'est jamais retirée d'office : l'écart reste affiché.                                                                              |

Révision de Q3 : les **comptes** passent en **Phase 3**, avec les droits RGPD (export, suppression). La Phase 2 n'en a pas eu besoin : la génération vit dans la session anonyme, avec les mêmes durées que le brouillon.

## Bloquantes pour la Phase 3

| #   | Question                                             | Proposition par défaut                                                         |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Q10 | Hébergeur UE et budget mensuel ?                     | À fournir (exemples : Scaleway, OVHcloud, Clever Cloud, AWS Francfort)         |
| Q11 | Seuils de couverture de tests ?                      | 90 % pour `schema` et le contrôle de fidélité, 75 % ailleurs                   |
| Q12 | Outil de génération de code autorisé pour l'équipe ? | Claude Code, avec les trois niveaux de vérification du § 15                    |
| Q13 | Antivirus (ClamAV) sur l'upload PDF ?                | Non au départ (fichier jamais servi à des tiers, analyse isolée) ; à réévaluer |

## Bloquantes pour la Phase 4

| #   | Question                                                                           | Proposition par défaut                                                            |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Q14 | Accès effectif à France Travail, Adzuna et Jooble (clés, conditions) ?             | Pilote DE avec BA Jobsuche d'abord                                                |
| Q15 | BGE-M3 autohébergé (TEI) ou API ?                                                  | TEI autohébergé sur CPU                                                           |
| Q16 | Formule de priorité du rapport 2 (fréquence + écart de salaire + effort) : poids ? | 0,5 × fréquence + 0,3 × écart de salaire normalisé − 0,2 × effort (**hypothèse**) |
| Q17 | Jeu annoté pour la précision et le rappel du matching : qui le constitue ?         | L'équipe ; 50 offres × 5 profils                                                  |
| Q18 | SES ou Brevo ?                                                                     | Brevo (UE, simplicité) ; SES si le volume l'exige                                 |

## Hors code : à confirmer, non bloquant

- Règlement UE 2026/1744 et classement à haut risque (annexe III) au 2 décembre 2027 : **hypothèse non vérifiée ici**, à faire confirmer par une source juridique.
- Répartition de l'équipe par rôle ; pilote avec une école (proposition non engagée).
