# Conformité : RGPD, AI Act, sécurité

> Information de conception, **pas un avis juridique**. À faire valider par un juriste ou un DPO avant la mise en production.

État au 2026-10-16 (fin de Phase 4). Chaque mesure renvoie au code ou au test qui la met en œuvre.

## Données personnelles (RGPD)

| Principe                                   | Mesure                                                                                                                                 | Où                                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Minimisation (art. 5-1-c)                  | Le modèle ne reçoit que des faits numérotés : ni nom, ni coordonnées, ni adresse, ni liens, ni employeurs, ni établissements           | `packages/llm/src/facts.ts` ; test « n'envoie au modèle ni identité, ni coordonnées, ni employeurs »                   |
| Limitation de la conservation (art. 5-1-e) | Mode anonyme uniquement : session de 2 h glissantes, 24 h au plus ; PDF jamais stocké ; CV importé jamais conservé (mémoire seulement) | ADR 0006 ; `apps/web/src/security.ts` ; `ia-routes.ts`                                                                 |
| Effacement (art. 17)                       | Bouton « Effacer mes données » : destruction immédiate de la session                                                                   | `POST /cv/effacer` ; test « efface la session à la demande »                                                           |
| Comptes : effacement (art. 17)             | « Supprimer mon compte » : compte, profils, veille, envois, résultats et consentements effacés en cascade                              | `POST /compte/supprimer` ; test « export de toutes les données, puis suppression définitive en cascade »               |
| Accès et portabilité (art. 15 et 20)       | Export JSON de toutes les données du compte                                                                                            | `GET /compte/export` ; même test                                                                                       |
| Consentement (art. 7)                      | Journal `consent_log` : finalité, accord ou retrait, version de la politique, empreinte de l'IP ; consentement « veille » distinct     | `apps/web/src/accounts.ts` ; tests d'intégration des comptes                                                           |
| Veille : minimisation                      | Profil anonymisé avant vecteurs et rerank (ni nom, ni coordonnées, ni liens, ni employeurs, ni établissements)                         | `packages/jobwatch/src/anonymize.ts` ; test « anonymisation »                                                          |
| Veille : conservation                      | Rapports jamais stockés ; offres effacées à 60 jours ; comptes inactifs effacés à 18 mois                                              | `JobwatchRepository.purge` ; test de purge                                                                             |
| Hébergement et traitement UE               | Modèle appelé sur Vertex AI, région `eu` ; autres fournisseurs refusés en production                                                   | ADR 0008 ; `packages/shared/src/config.ts`                                                                             |
| Pas de réutilisation pour l'entraînement   | Conditions Google Cloud pour Vertex AI                                                                                                 | **à faire confirmer contractuellement (DPA)**                                                                          |
| Journaux                                   | Aucun contenu de CV, d'offre ni d'identité : méthode, chemin, statut, durée, jetons, coût                                              | `apps/web/src/app.ts` ; test « ne journalise ni le contenu du CV ni l'identité » ; vérification en CI sur le conteneur |
| Décision automatisée (art. 22)             | Aucune : Attesta propose, le candidat relit, corrige et valide chaque export (case obligatoire)                                        | étape 5                                                                                                                |
| Données sensibles                          | Prompts : aucune extraction d'âge, de photo, de nationalité, de situation familiale ni de santé                                        | `prompts/*/v1.md`                                                                                                      |

Hébergement (Phase 3) : Google Cloud, région Paris, pour l'application, la base et les secrets ; Vertex AI en région `eu`. Quotas, compteurs et limiteur ne stockent que des **empreintes** (HMAC) des identifiants de session et des IP, purgées après un jour ; coûts LLM sans contenu, conservés 13 mois. Accès à la base journalisés (`log_connections`).

Fait en Phase 4 : comptes, export (art. 15 et 20), suppression, journal de consentement. Reste avant la production : DPA signés avec Google Cloud et Brevo ; **registre des traitements** (à rédiger avec le DPO) ; préavis par e-mail avant l'effacement pour inactivité ; décision sur la conservation de la preuve de consentement après suppression du compte (aujourd'hui effacée avec le compte, par minimisation : **à valider**).

## E-mails (veille)

| Règle                                   | Mesure                                                                                            | Où                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Double opt-in                           | Veille « en attente » jusqu'au clic sur le lien de confirmation (48 h)                            | `AccountStore.confirmSubscription` ; test « veille en double opt-in » |
| Désabonnement en un clic                | En-têtes `List-Unsubscribe` et `List-Unsubscribe-Post` (RFC 8058), POST accepté sans cookie       | `mail.ts` ; test « désabonnement en un clic »                         |
| Pas d'e-mail vide                       | Aucune offre nouvelle : aucun envoi                                                               | `processSubscription` ; test « le lendemain sans offre nouvelle »     |
| Pas de pixel de suivi                   | Aucune image, aucun lien réécrit                                                                  | test « aucun suivi »                                                  |
| Promotionnel                            | Aucun e-mail promotionnel : aucun consentement « promo » collecté                                 | —                                                                     |
| Plaintes (< 0,1 %, plafond Gmail 0,3 %) | Webhook Brevo : plainte = arrêt immédiat ; taux sur 30 jours calculé à chaque exécution ; alertes | `/webhooks/brevo` ; `veille.tf`                                       |
| Authentification du domaine             | SPF, DKIM, DMARC (`p=quarantine`, puis `reject`)                                                  | **à configurer** sur le domaine d'envoi (runbook)                     |

## Rapports de veille : biais et vocabulaire

- Le rapport 2 dit « associé à », jamais « cause » (test d'extraction du PDF) ; la formule de priorité est affichée comme hypothèse.
- Aucune variable protégée (âge, sexe, origine) n'entre dans le calcul : le profil n'en contient pas, et le prompt de rerank l'interdit.
- Salaires : seulement ceux publiés par les employeurs, jamais estimés (Adzuna : salaires prédits exclus).
- Une compétence « manquante » n'est affichée que si elle figure dans l'offre et pas dans le profil (vérifié par le code).

## Règlement européen sur l'IA (AI Act)

- **Classification visée** : outil d'aide à la rédaction utilisé par le candidat lui-même. Attesta ne trie, ne classe et n'évalue aucun candidat pour un recruteur. **Hypothèse à valider juridiquement**, de même que l'impact éventuel du règlement 2026/1744 (non vérifié).
- **Transparence** : la mention « Contenu généré par une IA, à relire » est affichée au-dessus de tout CV généré ; le mode démonstration est signalé comme « sans IA ».
- **Contrôle humain** : relecture ligne par ligne avec la source de chaque ligne, correction ou retrait possibles, case de relecture obligatoire avant l'export.
- **Exactitude** : contrôle de fidélité déterministe et retrait des lignes non prouvées ; limites documentées (voir ADR 0003).

## Sécurité spécifique aux LLM

| Risque                            | Parade                                                                                                                                                     | Preuve                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection de prompt (offre ou CV) | Données en blocs JSON balisés, avec `<` échappé ; consignes « données, jamais instructions » ; sortie contrainte par schéma ; contrôle de fidélité en aval | test « empêche un texte d'offre de fermer sa balise » ; cas d'évaluation `injection-offre`                                                               |
| Hallucination                     | Le modèle cite des faits, n'écrit aucun champ factuel ; contrôle déterministe ; retrait ; relecture                                                        | `evals/fidelity.eval.test.ts` (rappel de 100 % sur les inventions étiquetées)                                                                            |
| Fuite de données                  | Minimisation ; aucune clé côté client ; secrets par variables d'environnement                                                                              | ADR 0006, 0008                                                                                                                                           |
| Coût et abus                      | Plafond par CV, quota par session, 10 générations par heure et par IP                                                                                      | `pipeline.ts` ; `app.ts`                                                                                                                                 |
| Dépendance au fournisseur         | Interface `LlmProvider`, mode dégradé                                                                                                                      | `packages/llm/src/provider.ts`                                                                                                                           |
| Upload malveillant                | 5 Mo au plus, signature `%PDF-` vérifiée, 10 pages au plus, polices non chargées, fichier jamais servi ni stocké                                           | `packages/llm/src/extraction.ts` ; tests d'import. analyse dans un processus enfant sans aucun secret, plafonné par le noyau (768 Mo, 15 s de CPU, 10 s) |
