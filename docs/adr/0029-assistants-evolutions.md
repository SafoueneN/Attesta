# ADR 0029 : Évolutions des assistants (persistance, modèle par étape, rappels, export traduit)

- Statut : **proposé** le 2026-10-23, à valider par le chef de projet ; **complète** l'ADR
  [0028](0028-roles-de-l-ia.md) (rôles de l'IA)
- Décideurs : chef de projet (validation), équipe

## Contexte

Les huit assistants de l'ADR 0028 fonctionnent, mais leurs résultats se perdent d'un onglet à l'autre, tous
utilisent le même modèle (Opus 5.5), aucun retour du candidat n'est mesuré, et plusieurs usages demandés
manquent : appliquer un conseil en un clic, exporter le CV traduit, rappeler une relance ou une étape du plan.

## Décision

1. **Résultats conservés côté serveur, par CV** : table `assistant_result` de `cv-generation`
   (`generation_id`, `role`, `variant`, `payload`), effacée avec la génération et à l'effacement du compte.
   Le CV traduit modifié par le candidat y est conservé (variante = langue). La rédactrice garde l'historique
   de ses textes (`application_text`) et le suivi des candidatures (`application_tracking`) dans
   `letters-export`. La conversation de l'intervieweuse reste dans le navigateur (préférence locale).
2. **Avis 👍 / 👎 anonymes** : table `assistant_vote` (`role`, `vote`, `provider_kind`, `at`) dans chaque
   service qui porte un assistant, sans identifiant ni contenu ; agrégés dans les statistiques
   d'administration avec le coût par étape.
3. **Modèle par étape** : `LLM_STEP_MODELS="juge-fidelite=claude-opus-5-5,traduction=claude-haiku-5-5"`
   surcharge `LLM_MODEL` étape par étape (`llm-client`). Recommandation : Opus pour le juge, l'intervieweuse
   et la rédactrice ; Sonnet pour le coach, le plan et la correspondance ; Haiku pour l'ATS et la traduction.
   Le juge passe en effort `high`.
4. **Nouveaux garde-fous déterministes** :
   - reformulation proposée par le juge : gardée seulement si elle passe le contrôle de fidélité de la ligne ;
   - extraits STAR du coach : gardés seulement s'ils figurent dans la réponse du candidat ;
   - ressources du plan : catalogue de liens officiels tenu dans le code, jamais d'URL écrite par le modèle ;
   - traduction : chiffres **et** noms propres (employeurs, compétences, projets) conservés ;
   - conseil ATS appliqué : ajout du fait du profil **recopié tel quel**, avec sa source, dans l'entrée du CV
     qui le porte (nouvelles « additions » des corrections, sources vérifiées par le service) ;
   - message LinkedIn : 300 caractères au plus, coupé à la phrase par le code.
5. **Rappels par courriel** : table `reminder` de `job-watch`, qui possède déjà l'envoi d'e-mails ; rappels
   d'étape du plan et de relance de candidature, à l'adresse du compte, au plus 20 en attente par compte.
6. **Export du CV traduit** : `letters-export` lit la traduction conservée par `cv-generation` (route interne,
   jeton relayé) ; une ligne sans traduction valide garde son texte d'origine.
7. **Pas de réponse en flux** : les sorties sont validées (schéma, garde-fous, contrôle de fidélité) avant tout
   affichage (règle 5) ; afficher un texte partiel montrerait un contenu non contrôlé. L'attente est rendue
   lisible par l'interface (indicateur propre à chaque assistant).
8. **Envoi au recruteur** : aucun envoi par le serveur au nom du candidat ; l'application ouvre sa messagerie
   (`mailto:`) avec le texte contrôlé.

## Options considérées

- Conserver les résultats dans le navigateur seulement : perdus d'un appareil à l'autre, et l'export traduit
  ne pourrait pas relire une traduction modifiée.
- Un service « assistants » dédié : il devrait lire les données de quatre services ; refusé (règle 1).
- Laisser le modèle proposer des liens d'apprentissage : risque de liens inventés ; refusé.

## Conséquences

- Trois migrations (`cv-generation`, `letters-export`, `job-watch`) et une table de votes par service.
- Contrats étendus dans `shared-schemas` (champs ajoutés, rétrocompatibles côté lecture) ; OpenAPI régénérés.
- Le coût dépend désormais de `LLM_STEP_MODELS` : à revoir avec le tableau de bord par étape.
