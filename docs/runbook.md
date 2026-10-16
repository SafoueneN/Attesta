# Runbook

## Lancer en local

### Avec Docker (recommandé)

```bash
docker compose up --build
```

Puis ouvrir http://localhost:3080. Si le port est déjà pris : `ATTESTA_PORT=9000 docker compose up`.

La pile comprend PostgreSQL 16 + pgvector, une migration unique (`migrate`) et l'application (`web`). L'application démarre seulement si la migration a réussi.

### Sans Docker

```bash
nvm use                      # Node 22
npm install
cp .env.example .env         # puis renseigner SESSION_SECRET
npm run build
node --env-file=.env apps/web/dist/server.js
```

## Vérifications

| Commande                                                 | Rôle                                               |
| -------------------------------------------------------- | -------------------------------------------------- |
| `npm run lint`                                           | ESLint (frontières entre paquets) + Prettier       |
| `npm run typecheck`                                      | TypeScript strict, sources et tests                |
| `npm test`                                               | unitaires, intégration HTTP, extraction ATS du PDF |
| `npm run test:coverage`                                  | idem, avec les seuils de couverture                |
| `npm run test:e2e`                                       | Playwright + axe-core sur un serveur local         |
| `E2E_BASE_URL=http://localhost:3080 npx playwright test` | mêmes tests contre le conteneur                    |

## Incidents

| Symptôme                                           | Cause probable                                                          | Action                                                                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/health` renvoie 503                              | PostgreSQL injoignable                                                  | `docker compose ps`, puis `docker compose logs db`                                                                                         |
| Le formulaire « perd » la saisie à chaque page     | cookie de session refusé : `HTTPS_ONLY` actif sur une connexion en HTTP | servir en HTTPS, ou `HTTPS_ONLY=false` **en local uniquement**                                                                             |
| 403 « Votre session a expiré »                     | jeton CSRF absent ou session expirée (2 h d'inactivité, 24 h au plus)   | comportement attendu ; recharger la page                                                                                                   |
| Export PDF en erreur 500, « Rendu PDF interrompu » | Chromium lent ou bloqué                                                 | vérifier la mémoire du conteneur ; `PDF_TIMEOUT_MS` ; le navigateur est relancé automatiquement à la requête suivante                      |
| Chromium ne démarre pas (« No usable sandbox »)    | espaces de noms utilisateur bloqués                                     | en conteneur : `PDF_CHROMIUM_NO_SANDBOX=true` (voir ADR 0005) ; sur Ubuntu 24.04 : `sysctl kernel.apparmor_restrict_unprivileged_userns=0` |
| 429 Too Many Requests                              | rate limiting : 300 requêtes ou 20 exports par 15 min et par IP         | derrière un proxy, vérifier `TRUST_PROXY` (sinon toutes les requêtes semblent venir du proxy)                                              |

## Données

- Aucune donnée personnelle n'est écrite dans les journaux : uniquement méthode, chemin, statut et durée. La CI le vérifie sur le conteneur.
- Sessions anonymes : table `session`, expiration à 2 h glissantes, purge automatique toutes les 15 min ; plafond de 24 h appliqué par l'application.
- Effacement immédiat : bouton « Effacer mes données » en pied de page du parcours.
