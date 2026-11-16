# ADR 0047 : Fournisseurs LLM multiples (Claude, Groq, Cerebras, Mistral, OpenRouter, Gemini, Ollama) et repli automatique

- Statut : **proposé** le 2026-10-26, à valider par le chef de projet
- Décideurs : équipe (IA), chef de projet (validation)
- Complète : [0016](0016-llm-client.md) (client LLM), [0029](0029-assistants-evolutions.md) (modèles par étape)

## Contexte

`@attesta/llm-client` ne connaît que Claude (API directe ou Vertex AI UE). Un quota atteint ou un délai
dépassé fait passer le service en mode dégradé, alors qu'un autre fournisseur pourrait répondre. On veut aussi
pouvoir développer et faire une démonstration avec un modèle gratuit ou local, sans changer le reste de
l'application.

## Décision

1. **Interface inchangée** : `LlmProvider.generate(request) → { data, usage }`. `assist()`, `BudgetedProvider`
   et les services ne changent pas.
2. **Nouveaux fournisseurs** :
   - Groq, Cerebras, Mistral, OpenRouter et Ollama par `OpenAiCompatibleProvider`, avec le SDK `openai` et une `baseURL` propre à chacun.
     Justification : Groq et Ollama exposent l'API Chat Completions d'OpenAI, ce qui évite d'écrire deux
     clients.
   - Gemini par `GeminiProvider`, avec `@google/genai`. Justification : c'est le SDK officiel de Google pour
     l'API Gemini.
   - Leur sortie structurée est demandée par schéma JSON (`z.toJSONSchema`), puis **toujours revalidée par
     le schéma Zod**. Les erreurs ne citent jamais la sortie du modèle (point 4 de CLAUDE.md). Le contrôle de
     fidélité reste fait par les services, quel que soit le fournisseur.
3. **Choix** : `AI_PROVIDER=claude|groq|gemini|ollama|demo|none`. L'ancien `LLM_PROVIDER` reste lu quand
   `AI_PROVIDER` est vide (`anthropic` et `vertex` valent `claude`). L'accès à Claude est réglé par
   `CLAUDE_TRANSPORT=vertex|anthropic` (vertex par défaut).
4. **Repli** (`FallbackProvider`) : sur quota atteint (429) ou délai dépassé, et seulement dans ces cas, la
   même requête passe au fournisseur suivant. Un refus, une sortie non conforme ou une annulation ne
   déclenchent pas de bascule.
   - Ordre par défaut, circulaire à partir du fournisseur choisi : claude, groq, cerebras, mistral, openrouter, gemini, ollama, en ne gardant
     que les fournisseurs configurés.
   - `AI_FALLBACK_PROVIDERS` fixe une liste explicite ; `none` désactive le repli.
   - Les fournisseurs suivis d'un repli n'ont pas de relance SDK, pour basculer sans attendre.
   - Chaque bascule est journalisée (`llm_repli` : modèles et motif, jamais de contenu).
5. **Données dans l'UE (décision Q5)** : en production, seuls Claude sur Vertex AI (UE) et Ollama sont
   admis, comme fournisseur choisi comme en repli. Groq, Cerebras, Mistral, OpenRouter, Gemini (API directe) et l'API Anthropic directe sont
   refusés au démarrage s'ils sont demandés, et retirés de l'ordre par défaut. Hors production, l'ordre par
   défaut peut envoyer les données (fictives) chez Groq, Cerebras, Mistral, OpenRouter ou Gemini : c'est accepté. Mistral héberge dans l'UE : son admission en production demande une décision à part (amendement de cet ADR), avec un contrat de sous-traitance.
6. **Coût** : tarifs Groq et Gemini ajoutés à `pricing.ts`. Ce sont des estimations relevées auprès
   d'agrégateurs, à vérifier sur les pages officielles. Ollama et les modèles OpenRouter « :free » comptent un coût nul. Un modèle inconnu est
   compté au tarif Opus, par prudence. `usage.model` dit quel modèle a répondu, et le CV enregistre ce modèle.

## Options considérées

- Étendre `LLM_PROVIDER` : moins de changements, mais un seul nom mêlerait le fournisseur et l'accès à Claude.
- Une bibliothèque d'abstraction multi-fournisseurs (Vercel AI SDK, LangChain) : dépendance large pour quatre
  appels, et un contrôle plus faible sur les erreurs et sur ce qui est journalisé.
- Repli opt-in uniquement : plus prudent, mais écarté au profit d'un ordre par défaut, borné en production par
  le point 5.

## Conséquences

- Les sorties de Groq, Gemini et Ollama sont moins stables que celles de Claude : il y aura plus de relances
  pour sortie non conforme. Le contrôle de fidélité reste le garde-fou.
- `LLM_STEP_MODELS` ne s'applique qu'à Claude. L'effort (`effort`) n'est transmis qu'à Claude.
- Le cache des analyses d'offres de jobs-matching porte le modèle du premier fournisseur de la chaîne.
- Deux dépendances de production de plus dans `llm-client` et dans les lockfiles des quatre services à IA.
