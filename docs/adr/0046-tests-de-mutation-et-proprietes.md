# ADR 0046 : Tests de mutation (Stryker) et tests de propriétés (fast-check)

- Statut : **proposé** le 2026-10-25, à valider par le chef de projet
- Décideurs : équipe (qualité), chef de projet (validation)

## Contexte

La couverture de lignes dit quelles lignes ont tourné, pas si un test aurait remarqué une erreur. Les règles
critiques d'Attesta (contrôle de fidélité, normes CV par pays, mots de passe, import de CV, classement des
offres, écarts de compétences) demandent une mesure plus exigeante, et des entrées que personne n'écrirait à
la main (texte de PDF, données de sources externes, empreintes corrompues).

## Décision

1. **Stryker** (`@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, en dépendances de développement
   des six services) : il modifie le code (mutants) et vérifie que les tests échouent. Justification : seul
   outil de mutation maintenu pour TypeScript et Vitest. Configuration `stryker.config.json` par service,
   limitée aux modules à règles métier ; `npm run test:mutation`. Rapports dans `reports/` (non versionné).
2. **fast-check** (dépendance de développement des six services) : tests de propriétés, équivalent
   TypeScript d'Hypothesis (génération d'entrées, réduction du contre-exemple). Justification : pas d'autre
   bibliothèque de propriétés maintenue et typée pour Vitest. Les propriétés vivent dans les tests ordinaires
   et tournent donc à chaque `npm test` et en CI.
3. Suite de recette par user story dans `e2e/frontend/recette.spec.ts` (Playwright, pile compose), avec une
   capture d'écran par étape clé (`CAPTURES_DIR`).

## Options considérées

- Couverture seule : ne détecte pas un test qui exécute une ligne sans rien vérifier.
- Générateurs aléatoires écrits à la main : pas de réduction du contre-exemple, pas de rejeu par graine.

## Conséquences

- Les tests de mutation sont longs (plusieurs minutes par service) : à lancer avant une fusion touchant ces
  modules, ou dans une tâche CI planifiée, pas à chaque PR.
- Rapport de campagne (avant/après, score par fonction) : publié à part, hors dépôt.
