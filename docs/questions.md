# Questions ouvertes (Phase 0)

Chaque question vient avec une **proposition par défaut**. Sans réponse, la proposition sera appliquée et signalée.

## Bloquantes pour la Phase 1

| # | Question | Proposition par défaut |
|---|---|---|
| Q1 | Valider TypeScript strict (écart par rapport à « Node.js » seul) ? | Oui (ADR 0001) |
| Q2 | Rétention en mode anonyme : 2 h d'inactivité ? Purge des comptes à 12 ou 24 mois ? | 2 h et 12 mois |
| Q3 | Le mode compte est-il nécessaire dès la Phase 1, ou anonyme seulement ? | Anonyme seulement en Phase 1 ; comptes en Phase 2 |
| Q4 | Langues de l'interface au lancement ? | FR seulement (pilote DE en Phase 4) |

## Bloquantes pour la Phase 2

| # | Question | Proposition par défaut |
|---|---|---|
| Q5 | Fournisseur et modèle LLM, avec contrat UE et sans entraînement sur les données ? | À choisir par l'équipe. Critères : sorties structurées natives, traitement UE, DPA, coût |
| Q6 | Budget maximal par CV et quota par utilisateur ? | 0,05 € par CV, 10 générations par jour (**à valider**) |
| Q7 | Température ? | 0,2 pour la rédaction, 0 pour l'extraction et l'analyse |
| Q8 | Mode dégradé « CV assemblé sans reformulation » acceptable ? | Oui (ADR 0003) |
| Q9 | Lignes non supportées : retirées par défaut ou affichées en rouge ? | Retirées par défaut, montrées avec la raison |

## Bloquantes pour la Phase 3

| # | Question | Proposition par défaut |
|---|---|---|
| Q10 | Hébergeur UE et budget mensuel ? | À fournir (exemples : Scaleway, OVHcloud, Clever Cloud, AWS Francfort) |
| Q11 | Seuils de couverture de tests ? | 90 % pour `schema` et le contrôle de fidélité, 75 % ailleurs |
| Q12 | Outil de génération de code autorisé pour l'équipe ? | Claude Code, avec les trois niveaux de vérification du § 15 |
| Q13 | Antivirus (ClamAV) sur l'upload PDF ? | Non au départ (fichier jamais servi à des tiers, analyse isolée) ; à réévaluer |

## Bloquantes pour la Phase 4

| # | Question | Proposition par défaut |
|---|---|---|
| Q14 | Accès effectif à France Travail, Adzuna et Jooble (clés, conditions) ? | Pilote DE avec BA Jobsuche d'abord |
| Q15 | BGE-M3 autohébergé (TEI) ou API ? | TEI autohébergé sur CPU |
| Q16 | Formule de priorité du rapport 2 (fréquence + écart de salaire + effort) : poids ? | 0,5 × fréquence + 0,3 × écart de salaire normalisé − 0,2 × effort (**hypothèse**) |
| Q17 | Jeu annoté pour la précision et le rappel du matching : qui le constitue ? | L'équipe ; 50 offres × 5 profils |
| Q18 | SES ou Brevo ? | Brevo (UE, simplicité) ; SES si le volume l'exige |

## Hors code : à confirmer, non bloquant

- Règlement UE 2026/1744 et classement à haut risque (annexe III) au 2 décembre 2027 : **hypothèse non vérifiée ici**, à faire confirmer par une source juridique.
- Répartition de l'équipe par rôle ; pilote avec une école (proposition non engagée).
