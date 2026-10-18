# ADR 0017 : Contrats d'API, OpenAPI généré depuis Zod, tests de contrat

- Statut : accepté le 2026-10-18 ; prolonge l'[ADR 0002](0002-schema-contrat-unique.md) (schéma Zod comme
  contrat unique) aux échanges entre services
- Décideurs : chef de projet, équipe

## Contexte

Six équipiers font évoluer six API en parallèle. Un changement non coordonné casse un consommateur sans
que ses propres tests le voient. Le projet utilise déjà Zod 4 comme contrat unique, et Zod 4 sait produire
du JSON Schema (`z.toJSONSchema`), compatible avec OpenAPI 3.1.

## Décision

1. **Source unique** : les schémas d'échange (profil, offre, CV ciblé, rapport de fidélité, lettre,
   erreurs) vivent dans `packages/shared-schemas`. Les types TypeScript en sont inférés (`z.infer`).
2. **OpenAPI 3.1 généré** par service à partir de ses routes et de ces schémas, dans
   `services/<nom>/openapi.json`, commité. Un petit générateur dans `http-kit` assemble le document avec
   `z.toJSONSchema` : **aucune dépendance ajoutée**. La CI régénère et échoue si le fichier diffère
   (`git diff --exit-code`).
3. **Validation à l'exécution** : chaque route valide son entrée (corps, paramètres, requête) avec Zod et
   renvoie une erreur `400` au format commun ; les réponses sont validées en test.
4. **Format d'erreur commun** (proche de RFC 9457) : `{ type, title, status, detail?, errors?, requestId }`,
   avec des messages en français destinés à l'utilisateur et un `type` stable pour les machines.
5. **Tests de contrat légers, sans courtier Pact** :
   - côté fournisseur : supertest vérifie que chaque réponse documentée respecte son schéma ;
   - côté consommateur : chaque service déclare les opérations qu'il utilise dans
     `services/<nom>/contracts/consomme.json` (`fournisseur`, `operationId`, statuts attendus) ;
   - un test de CI vérifie que chaque opération déclarée existe dans l'OpenAPI du fournisseur, avec des
     schémas compatibles. Une rupture de contrat échoue donc **dans la PR du fournisseur**.
6. **Documentation lisible** : `docs/api/` référence les fichiers OpenAPI ; un fichier `.http`
   (REST Client) par service sert aux démonstrations.

## Options considérées

| Option                                              | Dépendances | Infra en plus | Détecte une rupture     |
| --------------------------------------------------- | ----------- | ------------- | ----------------------- |
| A. Zod → OpenAPI + manifeste consommateur (retenue) | aucune      | aucune        | oui, en CI              |
| B. Pact + courtier                                  | pact-js     | un courtier   | oui                     |
| C. `@asteasolutions/zod-to-openapi`                 | 1           | aucune        | non, sans tests en plus |
| D. OpenAPI écrit à la main                          | aucune      | aucune        | non : il dérive du code |

## Conséquences

- Plus facile : le contrat est le code ; une rupture se voit avant la fusion.
- Plus difficile : discipline de versionnement (`/v1`, `/v2`) et de mise à jour des manifestes consommateurs.
