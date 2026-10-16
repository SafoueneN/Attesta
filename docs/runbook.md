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

## Activer Claude sur Vertex AI (UE)

1. Projet Google Cloud avec l'API Vertex AI activée et l'accès aux modèles Claude accordé dans le Model Garden.
2. Identifiants applicatifs (ADC) : compte de service avec le rôle `roles/aiplatform.user`. En local, `gcloud auth application-default login` ; en conteneur, monter la clé et définir `GOOGLE_APPLICATION_CREDENTIALS` (jamais dans le dépôt).
3. Variables : `LLM_PROVIDER=vertex`, `VERTEX_PROJECT_ID=<projet>`, `VERTEX_REGION=eu` (par défaut), `LLM_MODEL=claude-opus-5-5` (par défaut).
4. Mesurer avant d'ouvrir : `npm run evals:live` (appels payants) ; les résultats sont écrits dans `evals/results/`.

## Vérifications

| Commande                                                 | Rôle                                                      |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `npm run lint`                                           | ESLint (frontières entre paquets) + Prettier              |
| `npm run typecheck`                                      | TypeScript strict, sources et tests                       |
| `npm test`                                               | unitaires, intégration HTTP, extraction ATS du PDF        |
| `npm run test:coverage`                                  | idem, avec les seuils de couverture                       |
| `npm run test:e2e`                                       | Playwright + axe-core sur un serveur local                |
| `npm run evals`                                          | évaluation de fidélité en rejeu (incluse dans `npm test`) |
| `npm run evals:live`                                     | évaluation sur le vrai modèle (payante)                   |
| `E2E_BASE_URL=http://localhost:3080 npx playwright test` | mêmes tests contre le conteneur                           |

## Incidents

| Symptôme                                                     | Cause probable                                                          | Action                                                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/health` renvoie 503                                        | PostgreSQL injoignable                                                  | `docker compose ps`, puis `docker compose logs db`                                                                                         |
| Le formulaire « perd » la saisie à chaque page               | cookie de session refusé : `HTTPS_ONLY` actif sur une connexion en HTTP | servir en HTTPS, ou `HTTPS_ONLY=false` **en local uniquement**                                                                             |
| 403 « Votre session a expiré »                               | jeton CSRF absent ou session expirée (2 h d'inactivité, 24 h au plus)   | comportement attendu ; recharger la page                                                                                                   |
| Export PDF en erreur 500, « Rendu PDF interrompu »           | Chromium lent ou bloqué                                                 | vérifier la mémoire du conteneur ; `PDF_TIMEOUT_MS` ; le navigateur est relancé automatiquement à la requête suivante                      |
| Chromium ne démarre pas (« No usable sandbox »)              | espaces de noms utilisateur bloqués                                     | en conteneur : `PDF_CHROMIUM_NO_SANDBOX=true` (voir ADR 0005) ; sur Ubuntu 24.04 : `sysctl kernel.apparmor_restrict_unprivileged_userns=0` |
| Bandeau « La reformulation par IA est indisponible »         | fournisseur injoignable, quota fournisseur, délai dépassé               | journaux `event: generation` avec `reason` ; vérifier les identifiants ADC et le quota Vertex ; le parcours reste utilisable sans IA       |
| « La reformulation obtenue ne respectait pas nos contrôles » | 3 sorties non conformes de suite                                        | comparer la version du prompt (`pipelineVersion` dans les journaux) ; relancer `npm run evals:live`                                        |
| 429 Too Many Requests                                        | rate limiting : 300 requêtes ou 20 exports par 15 min et par IP         | derrière un proxy, vérifier `TRUST_PROXY` (sinon toutes les requêtes semblent venir du proxy)                                              |

## Données

- Aucune donnée personnelle n'est écrite dans les journaux : uniquement méthode, chemin, statut et durée. La CI le vérifie sur le conteneur.
- Sessions anonymes : table `session`, expiration à 2 h glissantes, purge automatique toutes les 15 min ; plafond de 24 h appliqué par l'application.
- Effacement immédiat : bouton « Effacer mes données » en pied de page du parcours.
