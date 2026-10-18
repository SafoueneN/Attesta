# ADR 0016 : Paquet `llm-client` partagé, budget par service et prompts versionnés

- Statut : accepté le 2026-10-18 ; **amende les ADR [0003](0003-pipeline-llm.md) et
  [0008](0008-fournisseur-llm.md)** (le pipeline métier quitte `packages/llm` pour les services ; le
  fournisseur reste Claude)
- Décideurs : chef de projet (décision Q3)

## Contexte

Quatre services appellent un LLM : `profiles` (extraction d'un CV importé), `cv-generation` (analyse et
rédaction), `jobs-matching` (analyse d'offre, rerank) et `letters-export` (lettres). Les exigences
transverses existent déjà dans `packages/llm` : abstraction du fournisseur, sorties validées, relances,
coûts. Aucun identifiant réel n'est encore disponible ; le plafond de dépense est de **20 € par mois**,
avec coupure automatique.

## Décision

1. **`packages/llm-client` ne contient aucune logique métier** : interface `LlmProvider` et adaptateurs
   (Claude par l'API directe ou par Vertex AI UE, `ScriptedProvider` pour les tests, `DemoProvider` pour
   la démonstration), appel structuré `generate({ prompt, input, schema })`, délais d'attente, reprises
   avec recul exponentiel sur 429 et 5xx, relances bornées sur sortie invalide, limitation de débit locale
   (seau à jetons), calcul du coût, budget, chargement des prompts versionnés.
2. **Le pipeline métier va dans les services** : `faithfulness`, `facts` et `pipeline` dans
   `cv-generation` ; `extraction` dans `profiles` ; `rerank` et l'analyse d'offre dans `jobs-matching`.
3. **Sorties structurées** : chaque appel fournit un schéma Zod ; une sortie qui ne le respecte pas est
   rejetée et relancée (2 fois au plus), puis l'appel échoue avec une erreur typée.
4. **Fidélité** : seuls les faits du profil, numérotés, sont envoyés ; chaque ligne produite cite ses
   faits sources ; le contrôle déterministe de `cv-generation` s'exécute **avant tout affichage ou
   export** (règle inchangée, ADR 0003).
5. **Injection de prompt** : le contenu fourni par l'utilisateur (offre, CV importé) est placé dans des
   blocs délimités et décrit comme une donnée, jamais comme une consigne ; la sortie est validée par
   schéma et par le contrôle de fidélité, qui ignore toute « consigne » venue de l'offre.
6. **Budget mensuel avec coupure** : 20 € par mois au total, répartis par service et configurables
   (`LLM_MONTHLY_BUDGET_EUR`) : cv-generation 9 €, letters-export 5 €, jobs-matching 4 €, profiles 2 €.
   Chaque service tient son budget dans **sa** table `llm_usage` (pas de compteur partagé entre bases).
   Au-delà, `llm-client` refuse l'appel (`LlmBudgetExceeded`) et le service passe en mode dégradé
   (génération sans IA, comme aujourd'hui). Le plafond par CV et le quota quotidien existants sont conservés.
7. **Journaux sans contenu** : identifiant et version du prompt, modèle, jetons, coût, latence, issue.
   Jamais de texte de prompt ni de réponse.
8. **Prompts versionnés dans le dépôt** : `services/<nom>/prompts/<id>/vN.md` et un `CHANGELOG.md` par
   service. Une nouvelle version est un nouveau fichier ; l'ancienne reste rejouable.
9. **`evals:live` prêt à lancer** : un script par service rejoue le jeu de référence avec le vrai
   fournisseur dès que les identifiants existent, plafonné à 1 € par exécution et soumis au budget du mois.
   En CI et en test, seul `ScriptedProvider` est utilisé (tests déterministes, sans réseau).
10. **Modèle, tarifs et SDK** figés au moment de construire le paquet (Phase 2 ou 3), après vérification
    de la documentation officielle de Claude ; la table de prix reste dans le code, datée et testée.

## Options considérées

| Option                                                          | Duplication | Contrôle des coûts                        |
| --------------------------------------------------------------- | ----------- | ----------------------------------------- |
| A. Client technique partagé, métier dans les services (retenue) | faible      | par service                               |
| B. Un service LLM central (« proxy IA »)                        | nulle       | global, mais 7e service et passage obligé |
| C. Chaque service appelle le SDK directement                    | forte       | aucun contrôle commun                     |

## Conséquences

- Plus facile : changer de fournisseur ou de modèle touche un seul paquet ; les tests restent déterministes.
- Plus difficile : le budget global n'est que la somme des budgets locaux ; une redistribution demande un
  changement de configuration.
- Le tableau de bord des coûts (Phase 5) agrège les `llm_usage` des services par leurs API.
