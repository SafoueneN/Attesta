## Objet

<!-- Une ou deux phrases : ce que la PR change, et pourquoi. Lien vers l'issue : « Ferme #123 ». -->

## Vérifications réellement exécutées

<!-- Copier les commandes lancées et leur résultat (nombre de tests, couverture). -->

- [ ] `npm run lint` et `npm run typecheck`
- [ ] Tests du ou des composants touchés (`node scripts/ci/tester-unite.mjs <dossier>`)
- [ ] Suite de parité : `npm run test:parite` (et sur la pile compose si un service change)
- [ ] Couverture ≥ 80 % sur la logique métier du service

## Règles du projet

- [ ] Aucun accès à la base d'un autre service ; aucune logique métier dans `packages/`
- [ ] Contrat : OpenAPI régénéré, manifeste `contracts/consomme.json` à jour (si l'API change)
- [ ] LLM : appels par `packages/llm-client` uniquement, contrôle de fidélité avant affichage
- [ ] Aucun secret, aucune donnée personnelle dans le code, les tests ou les journaux
- [ ] Dépendance ajoutée : justifiée en une ligne ci-dessous (ou aucune)
- [ ] Décision structurante : ADR ajouté ou amendé (ou aucune)
- [ ] `README.md` du service, `TASKS.md` et documentation à jour

## Dépendances ajoutées

<!-- nom@version : justification en une ligne. Sinon : « aucune ». -->
