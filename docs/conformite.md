# Conformité : RGPD, AI Act, sécurité

> Information de conception, **pas un avis juridique**. À faire valider par un juriste ou un DPO avant la mise en production.

État au 2026-10-16 (fin de Phase 2). Chaque mesure renvoie au code ou au test qui la met en œuvre.

## Données personnelles (RGPD)

| Principe                                   | Mesure                                                                                                                                 | Où                                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Minimisation (art. 5-1-c)                  | Le modèle ne reçoit que des faits numérotés : ni nom, ni coordonnées, ni adresse, ni liens, ni employeurs, ni établissements           | `packages/llm/src/facts.ts` ; test « n'envoie au modèle ni identité, ni coordonnées, ni employeurs »                   |
| Limitation de la conservation (art. 5-1-e) | Mode anonyme uniquement : session de 2 h glissantes, 24 h au plus ; PDF jamais stocké ; CV importé jamais conservé (mémoire seulement) | ADR 0006 ; `apps/web/src/security.ts` ; `ia-routes.ts`                                                                 |
| Effacement (art. 17)                       | Bouton « Effacer mes données » : destruction immédiate de la session                                                                   | `POST /cv/effacer` ; test « efface la session à la demande »                                                           |
| Hébergement et traitement UE               | Modèle appelé sur Vertex AI, région `eu` ; autres fournisseurs refusés en production                                                   | ADR 0008 ; `packages/shared/src/config.ts`                                                                             |
| Pas de réutilisation pour l'entraînement   | Conditions Google Cloud pour Vertex AI                                                                                                 | **à faire confirmer contractuellement (DPA)**                                                                          |
| Journaux                                   | Aucun contenu de CV, d'offre ni d'identité : méthode, chemin, statut, durée, jetons, coût                                              | `apps/web/src/app.ts` ; test « ne journalise ni le contenu du CV ni l'identité » ; vérification en CI sur le conteneur |
| Décision automatisée (art. 22)             | Aucune : Attesta propose, le candidat relit, corrige et valide chaque export (case obligatoire)                                        | étape 5                                                                                                                |
| Données sensibles                          | Prompts : aucune extraction d'âge, de photo, de nationalité, de situation familiale ni de santé                                        | `prompts/*/v1.md`                                                                                                      |

Reste à faire (Phase 3) : comptes, export des données (art. 15 et 20), journal de consentement, registre des traitements, DPA signé avec Google Cloud.

## Règlement européen sur l'IA (AI Act)

- **Classification visée** : outil d'aide à la rédaction utilisé par le candidat lui-même. Attesta ne trie, ne classe et n'évalue aucun candidat pour un recruteur. **Hypothèse à valider juridiquement**, de même que l'impact éventuel du règlement 2026/1744 (non vérifié).
- **Transparence** : la mention « Contenu généré par une IA, à relire » est affichée au-dessus de tout CV généré ; le mode démonstration est signalé comme « sans IA ».
- **Contrôle humain** : relecture ligne par ligne avec la source de chaque ligne, correction ou retrait possibles, case de relecture obligatoire avant l'export.
- **Exactitude** : contrôle de fidélité déterministe et retrait des lignes non prouvées ; limites documentées (voir ADR 0003).

## Sécurité spécifique aux LLM

| Risque                            | Parade                                                                                                                                                     | Preuve                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Injection de prompt (offre ou CV) | Données en blocs JSON balisés, avec `<` échappé ; consignes « données, jamais instructions » ; sortie contrainte par schéma ; contrôle de fidélité en aval | test « empêche un texte d'offre de fermer sa balise » ; cas d'évaluation `injection-offre` |
| Hallucination                     | Le modèle cite des faits, n'écrit aucun champ factuel ; contrôle déterministe ; retrait ; relecture                                                        | `evals/fidelity.eval.test.ts` (rappel de 100 % sur les inventions étiquetées)              |
| Fuite de données                  | Minimisation ; aucune clé côté client ; secrets par variables d'environnement                                                                              | ADR 0006, 0008                                                                             |
| Coût et abus                      | Plafond par CV, quota par session, 10 générations par heure et par IP                                                                                      | `pipeline.ts` ; `app.ts`                                                                   |
| Dépendance au fournisseur         | Interface `LlmProvider`, mode dégradé                                                                                                                      | `packages/llm/src/provider.ts`                                                             |
| Upload malveillant                | 5 Mo au plus, signature `%PDF-` vérifiée, 10 pages au plus, polices non chargées, fichier jamais servi ni stocké                                           | `packages/llm/src/extraction.ts` ; tests d'import                                          |
