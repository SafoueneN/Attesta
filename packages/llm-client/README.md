# `@attesta/llm-client`

> Statut : **pas encore de code** ; créé en Phase 2. Décision : [0016](../../docs/adr/0016-llm-client.md).

Client LLM technique : fournisseurs (Claude, Groq, Gemini, Ollama, simulé, démo ; repli automatique, [0047](../../docs/adr/0047-fournisseurs-llm-multiples.md)), sorties validées par schéma, délais, reprises, débit, coût, budget mensuel, prompts versionnés. Aucun prompt métier.

Origine : `packages/llm/src/{provider,anthropic-provider,scripted-provider,demo-provider,pricing,prompts}.ts`.

Règle : **aucune logique métier** ici. Ce paquet n'importe jamais un service ; une règle ESLint le vérifie.
