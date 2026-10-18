# ADR 0025 : Paquets partagés livrés compilés et copiés dans chaque service

- Statut : accepté le 2026-10-18 ; **précise le point 2 de l'[ADR 0023](0023-autonomie-des-services.md)**
  (mécanique des paquets `file:`), qui renvoyait ce choix à une vérification
- Décideurs : chef de projet

## Contexte

L'ADR 0023 veut qu'un service s'installe seul (`npm ci` dans son dossier) en consommant
`packages/logger`, `packages/config` et `packages/http-kit` par `file:`. Trois essais ont été faits le
2026-10-18 avec npm 10.8, dans un clone sans aucune installation à la racine :

| Essai                                                | Résultat                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Lien symbolique (`file:`, défaut) + script `prepare` | échec : npm lance `prepare` mais n'installe pas `typescript` (devDependency du paquet) |
| Lien symbolique sans `prepare`, `dist/` présent      | échec : les dépendances du paquet (`pino`) ne sont pas installées                      |
| `install-links=true`, `dist/` présent                | **réussite** : le paquet est copié avec ses dépendances dans le service                |

## Décision

1. **Chaque service déclare `install-links=true`** dans son `.npmrc` : npm copie le paquet partagé dans
   `node_modules/@attesta/<paquet>` et installe ses dépendances, comme pour un paquet publié.
2. **Les paquets du socle sont livrés compilés** : `packages/{logger,config,http-kit}/dist/` est versionné
   (exception dans `.gitignore`), sans source map. Les paquets du monolithe gardent leur `dist/` ignoré.
3. **Dépendances communes en `peerDependencies`** (`express`, `zod`, `@attesta/logger`) : le service les
   installe lui-même, une seule copie est chargée.
4. **Synchronisation** : après une modification d'un paquet, `node scripts/sync-packages.mjs` le recompile
   et le recopie dans chaque service (npm ne recopie pas un paquet `file:` dont la version n'a pas changé).
   L'auteur committe les sources et le `dist/` ensemble.
5. **Contrôle en CI** : le job « qualité » recompile les trois paquets et échoue si `dist/` diffère ; un
   paquet modifié relance les tests de tous les services (matrice par chemins).

## Options considérées

| Option                                             | Service installable seul | Coût                                                        |
| -------------------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| A. `install-links` + `dist/` versionné (retenue)   | oui (vérifié)            | fichiers générés dans Git, contrôlés en CI                  |
| B. Registre npm privé (Verdaccio, GitHub Packages) | oui                      | un serveur ou des jetons, publication à chaque modification |
| C. Bundler par service (tsup, esbuild)             | oui                      | une dépendance et une configuration par service             |
| D. Paquets écrits en JavaScript avec JSDoc         | oui                      | abandon de TypeScript strict dans les paquets               |

## Conséquences

- Plus facile : `npm ci && npm test` dans `services/<nom>` suffit, sur un poste comme dans une image Docker
  qui ne copie que `packages/*/dist` et le dossier du service.
- Plus difficile : une modification d'un paquet passe par `sync-packages.mjs` et un `dist/` à committer ;
  la CI le rappelle.
- À revoir : si les paquets se multiplient ou changent souvent, passer à l'option B.
