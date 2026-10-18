# ADR 0008 : Fournisseur LLM, Claude sur Vertex AI en région UE (décision Q5)

- Statut : accepté le 2026-10-16 ; **amendé par l'[ADR 0016](0016-llm-client.md)** (client partagé, budget de 20 € par mois)
- Date : 2026-10-16
- Note d'impartialité : cette décision a été proposée par un assistant fondé sur Claude. Les critères ci-dessous sont vérifiables, et l'abstraction `LlmProvider` rend le choix réversible.

## Contexte

Il faut un modèle qui respecte quatre exigences :

1. sorties structurées validées par schéma ;
2. traitement des données **dans l'Union européenne** ;
3. aucune réutilisation des données pour l'entraînement ;
4. une très bonne obéissance aux consignes de fidélité (« ne rien inventer »).

## Options étudiées

| Option                                             | Sorties structurées | Traitement UE                                            | Remarques                                                                                                                                           |
| -------------------------------------------------- | ------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| API Anthropic directe                              | oui                 | **non** : `inference_geo` n'accepte que `us` ou `global` | la plus simple ; écartée pour les données réelles                                                                                                   |
| Claude sur Amazon Bedrock                          | oui                 | possible par région                                      | disponibilité des modèles récents dans les régions UE **non vérifiée** ici                                                                          |
| **Claude sur Google Cloud Vertex AI, région `eu`** | oui                 | **oui** (multi-région UE documentée)                     | contrat et DPA Google Cloud ; données client non utilisées pour l'entraînement selon les conditions Google Cloud (**à faire confirmer par le DPO**) |
| Mistral (La Plateforme)                            | oui                 | oui (entreprise et hébergement UE)                       | alternative souveraine crédible ; second adaptateur possible derrière `LlmProvider`                                                                 |

## Décision

- **Fournisseur** : Claude sur **Vertex AI, région `eu`**, via le SDK officiel `@anthropic-ai/vertex-sdk` (`AnthropicVertex`). En production, la configuration **refuse** tout autre fournisseur que `vertex` ou `none`.
- **Modèle** : `claude-opus-5-5`, modèle Claude recommandé par défaut, réglable par `LLM_MODEL` sans changement de code.
- **Sorties structurées** : `messages.parse` avec `zodOutputFormat` (schémas simples côté modèle), puis validation par le contrat strict de `@attesta/schema`.
- **Pas de température** : les modèles Claude actuels refusent les paramètres d'échantillonnage. La stabilité vient du schéma, de l'**effort** (`low` pour l'analyse et l'extraction, `medium` pour la rédaction) et du contrôle de fidélité. La question Q7 est donc révisée.
- **Développement** : `LLM_PROVIDER=anthropic` (API directe, hors UE) est autorisé **uniquement hors production et avec des données fictives** ; `LLM_PROVIDER=demo` sert aux tests et aux démonstrations sans modèle.

## Coût (estimation, non mesurée)

Ordres de grandeur aux tarifs publics Anthropic pour Opus 5.5 (4 $ en entrée et 20 $ en sortie par million de jetons) ; la tarification Vertex AI peut différer :

| Étape                             | Entrée | Sortie (réflexion comprise) | Coût               |
| --------------------------------- | ------ | --------------------------- | ------------------ |
| Analyse de l'offre (effort `low`) | ~1 500 | ~1 500                      | ~0,04 $            |
| Rédaction (effort `medium`)       | ~4 500 | 3 000 à 6 000               | ~0,08 à 0,14 $     |
| **Total par CV**                  |        |                             | **~0,12 à 0,18 $** |

C'est **au-dessus** de l'hypothèse initiale de 0,05 € par CV (Q6). Plafond retenu : `LLM_MAX_COST_USD_PER_CV=0,30`, au-delà duquel le pipeline passe en mode dégradé. Le coût réel est journalisé à chaque appel (`event: llm_usage`) et mesuré par `npm run evals:live`.

**Levier de coût à décider par l'équipe** : `claude-sonnet-5-5` (2 $ / 10 $) diviserait environ le coût par deux, et `claude-haiku-5-5` par bien plus. Ce choix change la qualité de rédaction : il doit être tranché sur mesure, avec le jeu d'évaluation lancé sur le vrai modèle, pas par défaut.

## Refus du modèle

Un refus (`stop_reason: "refusal"`) déclenche le **mode dégradé** (CV non reformulé, message clair). Le mécanisme de repli vers un autre modèle proposé par le SDK n'est pas activé : sur Vertex, il passe par l'API bêta, et le mode dégradé couvre déjà ce cas. On le réévaluera si les refus mesurés ne sont pas négligeables.

## Conséquences

- Il faut un projet Google Cloud et des identifiants (ADC) pour la préprod et la prod. Aucune clé n'est côté client ni dans le dépôt.
- Le jeu d'évaluation sur le vrai modèle n'a **pas encore été lancé** : aucun identifiant n'était disponible au moment de la Phase 2.
