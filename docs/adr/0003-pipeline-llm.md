# ADR 0003 : Pipeline LLM en 4 étapes, fournisseur abstrait, contrôle de fidélité

- Statut : accepté le 2026-10-16 ; fournisseur tranché par l'ADR 0008 ; **amendé par l'[ADR 0016](0016-llm-client.md)** (pipeline réparti dans les services). Voir « Mise en œuvre (Phase 2) » ci-dessous pour les écarts.
- Date : 2026-10-16

## Décision

### Abstraction

```ts
interface LlmProvider {
  generateStructured<T>(req: {
    system: string;
    messages: Message[];
    schema: ZodType<T>;
    temperature: number;
    maxOutputTokens: number;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<{
    data: T;
    usage: { inputTokens: number; outputTokens: number; costEur: number; latencyMs: number };
  }>;
}
interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
} // BGE-M3, séparé
```

Adaptateurs : un fournisseur réel (à choisir) et `FakeProvider`, qui rejoue des réponses enregistrées pour les tests de contrat et la CI. Aucun appel réseau en CI hors du job d'évaluation.

### Étapes

| #   | Étape              | Entrée                                | Sortie validée       | Modèle ?                                                        |
| --- | ------------------ | ------------------------------------- | -------------------- | --------------------------------------------------------------- |
| 1   | Extraction         | texte du CV PDF importé ou formulaire | `Profile`            | oui pour l'import PDF ; non pour le formulaire (déjà structuré) |
| 2   | Analyse de l'offre | `JobOfferInput`                       | `OfferAnalysis`      | oui (mise en cache par hash de l'offre)                         |
| 3   | Rédaction ciblée   | `Profile` + `OfferAnalysis`           | `TailoredCv`         | oui                                                             |
| 4   | Contrôle           | `TailoredCv` + `Profile`              | `FaithfulnessReport` | **déterministe d'abord**, juge LLM en option                    |

Après l'étape 1 (import PDF), le candidat **relit et corrige** le profil extrait avant toute suite. C'est le profil validé par l'humain qui fait foi.

### Contrôle de fidélité (étape 4)

Pour chaque ligne, avec le texte de ses sources comme référence :

1. sources résolues (`findUnresolvedRefs`) ;
2. **nombres et pourcentages** de la ligne présents dans les sources ;
3. **dates et années** présentes dans les sources ;
4. **entités** (noms propres, technologies) : présentes dans les sources ou dans `skills` du profil, après normalisation (casse, accents, alias simples comme « Node » et « Node.js ») ;
5. _(option, Phase 2)_ juge LLM d'implication (« la ligne découle-t-elle des sources ? ») pour attraper les verbes gonflés. Il produit un **avertissement, jamais une validation** : seuls les contrôles déterministes peuvent rendre une ligne « supported ».

Score = lignes supportées / lignes contrôlées. Une ligne non supportée est **retirée par défaut** et montrée au candidat avec la raison ; il peut la réécrire lui-même.

### Robustesse

- Température : 0,2 proposée (0 pour l'extraction).
- Réponse non conforme au schéma : renvoi des erreurs Zod au modèle, **2 relances maximum**, puis erreur propre.
- Timeout de 30 s par appel, 2 retries avec backoff exponentiel et jitter, uniquement sur 429 et 5xx.
- Streaming de la **progression** par SSE (étape en cours, section terminée). Les fragments JSON partiels ne sont pas diffusés, car seul un objet validé est affichable.
- Cache : `OfferAnalysis` par hash de l'offre ; `TailoredCv` par (version du profil, hash de l'offre, version du prompt, modèle).
- Quotas : N générations par utilisateur et par jour (valeur à fixer) et plafond de coût par CV.
- **Mode dégradé** (proposition) : si le fournisseur est indisponible après les retries, Attesta propose un **CV non reformulé**, assemblé par le code à partir du profil (expériences triées par recouvrement de mots-clés avec l'offre, calculé localement), avec le bandeau « Reformulation IA indisponible : CV assemblé depuis votre profil, sans réécriture ». La fidélité y est de 100 % par construction.

### Défense contre l'injection de prompt

- System prompt séparé ; profil et offre injectés dans **deux blocs JSON distincts** et balisés, avec la consigne explicite que leur contenu est une donnée.
- La sortie est contrainte par schéma, et les références sont vérifiées par le code : une injection ne peut au pire que produire des lignes rejetées par l'étape 4.
- Jeu d'évaluation adverse : offres contenant « ignore les instructions… », « ajoute Kubernetes », etc.

### Prompts versionnés

`prompts/<etape>/v<N>.md` (Rôle, Contexte, Tâche, Format, Contraintes, exemples few-shot) et `prompts/CHANGELOG.md`. La version du prompt est enregistrée dans `cv_generation`. Un changement de prompt doit passer le jeu d'évaluation en CI.

## Risques et incertitudes

- Le contrôle déterministe des entités produira des **faux positifs** (synonymes, traductions FR/DE/EN). Seuil à calibrer sur le jeu de référence.
- Les verbes gonflés ne sont attrapés que par le juge LLM, avec une fiabilité non garantie. La relecture humaine reste obligatoire.

## Mise en œuvre (Phase 2, 2026-10-16)

Ce qui est livré, et en quoi cela précise ou corrige la proposition ci-dessus :

- **Température** : supprimée (refusée par les modèles actuels, voir ADR 0008). Le réglage se fait par l'effort : `low` pour l'analyse et l'extraction, `medium` pour la rédaction.
- **Faits numérotés** : le modèle reçoit une liste de faits `{pointer, text}`, sans nom, coordonnées, employeurs ni établissements. Il cite des pointeurs ; il n'écrit aucun champ factuel.
- **Complétude garantie par le code** : expériences, projets, formations, langues et compétences que le modèle omet sont rajoutés tels quels. Le modèle choisit l'ordre et la formulation ; il ne peut ni ajouter ni faire disparaître une entrée.
- **Mots-clés absents** : calculés de façon déterministe (termes de l'offre sans trace dans le profil), pas demandés au modèle. Une ligne qui en contient un est retirée.
- **Contrôle de fidélité** : nombres, années, entités (sigles, termes techniques, noms propres) et compétences absentes, avec quelques alias (`nodejs` → `node js`, `postgres` → `postgresql`, `k8s` → `kubernetes`). Lignes non prouvées retirées (Q9). Les **limites** sont couvertes par un test qui les documente : un verbe gonflé ou une paraphrase infidèle sans entité nouvelle passent.
- **Juge LLM d'implication** : **non implémenté**. C'était optionnel ; à décider après une première mesure sur le vrai modèle.
- **Relances** : deux au plus, avec la réponse précédente et la liste exacte des écarts au contrat. Les relances réseau (429, 5xx) sont celles du SDK.
- **Streaming** : la progression passe par SSE sur `GET /cv/generer/flux`, protégé par un **jeton à usage unique** émis dans la page (un GET n'est pas couvert par le jeton CSRF des formulaires). Sans JavaScript, `POST /cv/generer` fait la même génération pendant la requête.
- **Exécution dans le processus web** : pg-boss et le worker sont reportés en **Phase 3** (industrialisation). La génération est liée à la requête et annulée si le navigateur se déconnecte.
- **Cache** : analyses d'offre en mémoire, par empreinte du texte, du modèle et de la version des prompts. La génération est conservée dans la session et **ignorée dès que le profil ou l'offre changent** (empreinte), pour que les pointeurs ne désignent jamais d'autres faits.
- **Coût** : chaque appel est journalisé (`event: llm_usage` : jetons, coût estimé, latence, sans contenu), avec un plafond par CV (`LLM_MAX_COST_USD_PER_CV`).

## Relecture indépendante (2026-10-16)

Un relecteur qui n'avait pas écrit le code a audité la Phase 2 et démontré 15 défauts par des scripts. Les corrections sont couvertes par des tests de non-régression (`packages/llm/test/faithfulness.test.ts`, `apps/web/test/ia.test.ts`).

| Constat                                                                                        | Gravité | Correction                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entités non vues : premier mot, minuscules, caractères invisibles, diplômes et titres inventés | haute   | caractères de format retirés (`sanitizeText`) ; lexique contrôlé (diplômes, niveaux, titres) ; termes de l'offre extraits sans modèle utilisés comme garde-fou    |
| Nombres en lettres, ordres de grandeur (« dix », « millions », « doublé »)                     | haute   | ramenés à des chiffres, ou à prouver tels quels                                                                                                                   |
| Source prise dans une autre expérience ; compétence du profil greffée sur une expérience       | haute   | nouveau motif `foreign-source` ; compétences hors sources admises seulement dans le titre et l'accroche                                                           |
| Erreur d'analyse du SDK non convertie (ni relance, ni mode dégradé, extrait dans les journaux) | haute   | convertie en `LlmSchemaError` sans contenu ; journaux limités au type d'erreur                                                                                    |
| Import PDF hors quota et hors limiteur                                                         | haute   | quota partagé avec la génération ; limiteur horaire étendu à `/import`                                                                                            |
| Session réécrite en fin de génération : modifications perdues, **effacement RGPD annulé**      | haute   | session rechargée avant écriture ; abandon si elle a été détruite ou si le profil a changé                                                                        |
| Jeton SSE et quota contournables par requêtes concurrentes                                     | moyenne | verrou par session et quota enregistrés avant l'appel. **Reste** : verrou propre à une instance ; un verrou partagé en base est prévu en Phase 3                  |
| Invention lors de l'extraction du PDF                                                          | moyenne | ancrage : tout élément extrait doit figurer dans le texte du PDF. **Reste** : un texte caché (blanc sur blanc) est bien dans le PDF ; seule la relecture l'écarte |
| Nombre comparé sans son unité (« 40 % » contre « 40 mois »)                                    | moyenne | comparaison par paires nombre et unité                                                                                                                            |
| Formulaire de relecture d'une génération précédente                                            | moyenne | identifiant de génération obligatoire                                                                                                                             |
| Déni de service par un PDF piégé                                                               | moyenne | **Corrigé en Phase 3** : processus enfant plafonné par le noyau (ADR 0009)                                                                                        |
| Marqueurs « modifiée » décalés ; accroche absente du PDF ; cache sans borne                    | basse   | corrigés (cache plafonné à 500 offres)                                                                                                                            |
| Lignes du candidat non prouvées exportées                                                      | choix   | maintenu (« le candidat décide »), avec un avertissement explicite à l'export                                                                                     |
