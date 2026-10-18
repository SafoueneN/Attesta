# ADR 0023 : Chaque service s'installe, se lance et se teste seul

- Statut : accepté le 2026-10-18 ; **amende l'[ADR 0011](0011-microservices-extraction.md)** (workspaces
  npm) et l'[ADR 0017](0017-contrats-openapi-zod.md) (OpenAPI versionné)
- Décideurs : chef de projet

## Contexte

Un équipier doit pouvoir ouvrir `services/<nom>/`, l'installer, le lancer et le tester sans installer le
reste du dépôt ni lancer les autres services. Avec les workspaces npm actuels, l'installation se fait
depuis la racine, avec un seul `package-lock.json` partagé par toutes les unités.

## Décision

1. **Un `package.json` et un `package-lock.json` par unité déployable** : chaque service, la gateway et
   le frontend. Le `package.json` racine ne déclare plus que `packages/*` (et `apps/*` jusqu'au retrait du
   monolithe) comme workspaces. `npm ci` dans `services/profiles` suffit.
2. **Paquets partagés en `file:`** : `"@attesta/logger": "file:../../packages/logger"`. Chaque paquet est
   publié compilé (`dist/`, champ `exports`) et ne contient aucune logique métier (règle 2 de
   `CLAUDE.md`). La mécanique exacte (lien symbolique ou copie avec `install-links`) est validée sur
   `profiles` en M3 avec un test : `npm ci && npm test` dans un clone vierge, depuis le seul dossier du
   service.
3. **Démarrage seul** : `npm run dev` avec une base locale (`compose up db db-init`) ; les services
   appelés sont remplacés par des **bouchons** quand `<SERVICE>_URL` vaut `mock` (réponses construites
   depuis `packages/shared-schemas`, donc conformes au contrat). Le LLM utilise le fournisseur `demo`.
4. **Fichiers obligatoires** d'un service : `src/`, `tests/`, `migrations/`, `Dockerfile`, `package.json`,
   `package-lock.json`, `.env.example`, `README.md`, `openapi.yaml`. Gabarit : `services/_template`
   (copié depuis `profiles` en M3).
5. **`openapi.yaml` versionné** (amende ADR 0017) : toujours généré depuis Zod, mais commité pour être lu
   sans compiler ; la CI échoue si le fichier diffère de la génération.
6. **Dockerfile par service**, contexte de construction : le dossier du service plus `packages/`
   (`docker build -f services/profiles/Dockerfile .` avec un `.dockerignore` qui exclut le reste).

## Options considérées

| Option                                      | Installation seule | Mise à jour d'un paquet partagé   | Outillage         |
| ------------------------------------------- | ------------------ | --------------------------------- | ----------------- |
| A. Lockfile par service + `file:` (retenue) | oui                | `npm install` dans chaque service | npm seul          |
| B. Workspaces npm actuels                   | non (racine)       | automatique                       | npm seul          |
| C. Paquets publiés sur un registre privé    | oui                | publication + montée de version   | registre à tenir  |
| D. pnpm ou Nx                               | oui                | automatique                       | outil à apprendre |

## Conséquences

- Plus facile : un équipier ne touche que son dossier ; les images Docker sont plus petites ; la CI ne
  teste que l'unité modifiée.
- Plus difficile : une modification d'un paquet partagé doit être réinstallée dans chaque service ; un
  script `scripts/sync-packages.mjs` le fait, et la CI teste tous les consommateurs d'un paquet modifié.
- Six lockfiles à garder cohérents : mêmes versions des dépendances communes, vérifiées en CI.
