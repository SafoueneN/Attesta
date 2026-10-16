# Runbook

Trois environnements : **dev** (poste local, `docker compose`), **préprod** et **prod** (Google Cloud Run, Paris ; [ADR 0009](adr/0009-hebergement-et-execution.md)).

## Lancer en local

### Avec Docker (recommandé)

```bash
docker compose up --build
```

Puis ouvrir http://localhost:3080. Si le port est déjà pris : `ATTESTA_PORT=9000 docker compose up`.

La pile comprend PostgreSQL 16 + pgvector, une migration unique (`migrate`), l'application (`web`) et **Mailpit**, qui reçoit tous les e-mails (connexion, confirmation, rapports) : http://localhost:8025. Aucun e-mail ne sort du poste. L'application démarre seulement si la migration a réussi. Chromium y tourne **avec sa sandbox**, grâce au profil seccomp `infra/seccomp/chromium.json`. Le fournisseur d'IA est `demo` : aucun appel au modèle (le rerank garde l'ordre de la recherche).

### Veille emploi en local

1. Remplir un CV (étapes 1 à 3), puis « Mon compte et ma veille » : saisir une adresse, ouvrir le lien reçu dans Mailpit, enregistrer le profil, activer la veille (pays, ville, rayon), puis la confirmer depuis Mailpit.
2. Lancer l'exécution quotidienne, à la demande :
   ```bash
   docker compose run --rm veille                    # vecteurs de développement (sans sémantique)
   docker compose --profile tei up -d tei            # BGE-M3 : 2 Go téléchargés au premier lancement
   EMBEDDINGS_PROVIDER=tei docker compose run --rm veille
   ```
3. Le rapport arrive dans Mailpit, avec ses deux PDF. Relancer le même jour n'envoie rien de plus ; `--date=AAAA-MM-JJ` rejoue une date (`docker compose run --rm veille node apps/worker/dist/main.js --date=2026-10-17`).

La veille interroge les **vraies** API publiques de BA Jobsuche et d'ESCO (sans clé). Hors ligne : `ESCO_ENABLED=false`.

### Sans Docker

```bash
nvm use                      # Node 22
npm install
cp .env.example .env         # puis renseigner SESSION_SECRET
npm run build
node --env-file=.env apps/web/dist/server.js
```

## Vérifications

| Commande                                                 | Rôle                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run lint`                                           | ESLint (frontières entre paquets) + Prettier                                        |
| `npm run typecheck`                                      | TypeScript strict, sources et tests                                                 |
| `npm test`                                               | unitaires, intégration HTTP, extraction ATS du PDF, évaluation de fidélité en rejeu |
| `TEST_DATABASE_URL=… npm test`                           | ajoute les tests d'intégration sur un vrai PostgreSQL migré                         |
| `npm run test:coverage`                                  | idem, avec les seuils de couverture (75 % global, 90 % pour `schema`)               |
| `npm run test:e2e`                                       | Playwright + axe-core sur un serveur local                                          |
| `E2E_BASE_URL=http://localhost:3080 npx playwright test` | mêmes tests contre le conteneur                                                     |
| `node scripts/smoke.mjs <url>`                           | test de fumée d'un déploiement (sans appel au modèle)                               |
| `bash infra/deploy/test/deploy.test.sh`                  | scénarios des scripts de déploiement et de retour arrière                           |
| `npm run evals:live`                                     | évaluation sur le vrai modèle (**payante**)                                         |

Base PostgreSQL jetable pour les tests d'intégration :

```bash
docker run -d --name attesta-test-db -e POSTGRES_PASSWORD=test -e POSTGRES_DB=attesta_test \
  -p 127.0.0.1:55432:5432 pgvector/pgvector:0.8.0-pg16
export TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/attesta_test
DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate && npm test
```

## Mise en place de Google Cloud (une fois)

1. **Projet** Google Cloud, avec la facturation et l'accès aux modèles Claude accordé dans le Model Garden de Vertex AI.
2. **Bucket d'état Terraform** privé, versionné, à Paris : `gcloud storage buckets create gs://<projet>-tfstate --location=europe-west9 --uniform-bucket-level-access --public-access-prevention`, puis `gcloud storage buckets update gs://<projet>-tfstate --versioning`. L'état contient les mots de passe générés : seuls les administrateurs y ont accès.
3. **Ressources communes** :
   ```bash
   cd infra/terraform/shared
   terraform init -backend-config=bucket=<projet>-tfstate -backend-config=prefix=shared
   terraform apply -var project_id=<projet> -var github_repository=<org>/attesta \
     -var github_repository_id=<id numérique> -var github_owner_id=<id numérique>
   ```
4. **Première image**, publiée à la main dans le registre (sortie `registry`) pour amorcer les services.
5. **Environnements**, pour `preprod` puis `prod` :
   ```bash
   cd infra/terraform/environment
   terraform init -backend-config=bucket=<projet>-tfstate -backend-config=prefix=preprod
   terraform apply -var-file=preprod.tfvars -var project_id=<projet> \
     -var workload_identity_pool=<sortie shared> -var github_repository=<org>/attesta \
     -var bootstrap_image=<image@digest> -var alert_email=<astreinte>
   ```
6. **GitHub** :
   - variables du dépôt : `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `REGISTRY` (sorties de `shared`) ;
   - environnement `preprod` : variable `GCP_DEPLOYER_SA` (sortie `deployer_service_account` de l'environnement), déploiement limité à la branche `main` ;
   - environnement `prod` : sa propre variable `GCP_DEPLOYER_SA`, **approbation obligatoire**, déploiement limité aux tags `v*` ;
   - branche `main` protégée : PR, revue et CI verte obligatoires ; approbation requise pour les workflows des contributeurs externes.

   Chaque environnement GitHub n'obtient que **son** compte de déploiement : la condition de fédération porte sur « dépôt:environnement ». Un job sans environnement n'obtient aucune identité, et le compte préprod n'a aucun droit sur la prod.

7. **Extension pgvector** : créée par la migration `1760900000000_veille-emploi.sql` (`CREATE EXTENSION IF NOT EXISTS vector`), disponible sur Cloud SQL PostgreSQL 16.
8. **Envoi d'e-mails (Brevo)**, avant le premier déploiement qui sert des comptes :
   - domaine d'envoi (ex. `mail.attesta.example`) authentifié dans Brevo : enregistrements **SPF** et **DKIM** fournis par Brevo, et **DMARC** `v=DMARC1; p=quarantine; rua=mailto:<adresse>`, puis `p=reject` après un mois sans rejet légitime ;
   - clé SMTP Brevo, saisie dans Secret Manager sans passer par le dépôt ni par Terraform :
     ```bash
     printf 'smtp://<login>:<clé SMTP>@smtp-relay.brevo.com:587' | \
       gcloud secrets versions add attesta-<env>-smtp-url --data-file=-
     ```
   - webhook transactionnel Brevo : URL = sortie `brevo_webhook_url`, événements `spam`, `hard_bounce`, `unsubscribed`, authentification `bearer` avec le jeton `gcloud secrets versions access latest --secret attesta-<env>-brevo-webhook-token` ;
   - DPA de Brevo signée.
9. **TEI** : Cloud Run ne tire pas d'image depuis ghcr.io ; la recopier dans le registre, puis la passer en variable `tei_image` :
   ```bash
   docker pull ghcr.io/huggingface/text-embeddings-inference:cpu-1.8
   docker tag ghcr.io/huggingface/text-embeddings-inference:cpu-1.8 <registre>/tei:cpu-1.8
   docker push <registre>/tei:cpu-1.8
   ```
   Le premier démarrage télécharge le modèle (environ 2 Go) dans le bucket `<projet>-attesta-<env>-tei` ; les suivants le relisent.
10. **Veille** : variables `app_base_url` (adresse publique en https), `mail_from` (adresse du domaine authentifié). Le job `attesta-<env>-veille` est lancé chaque jour à 7 h (Europe/Paris) par Cloud Scheduler ; `deploy.sh` lui donne l'image de chaque déploiement réussi, `rollback.sh` celle de la révision restaurée. Lancement manuel : `gcloud run jobs execute attesta-<env>-veille --region europe-west9`.

## Déployer

Tout est automatique ([cd.yml](../.github/workflows/cd.yml)), avec une **seule image par commit**, identifiée par son digest :

| Événement                 | Effet                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Push sur `main`, CI verte | image construite et publiée, déployée en **préprod** (100 % après le test de fumée)          |
| Release `vX.Y.Z` publiée  | la **même** image est promue en **prod** après approbation, par paliers de 10, 50 puis 100 % |

Seule une image portant l'étiquette `preprod-valide-sha-<commit>`, posée après un déploiement préprod réussi, peut être promue. Les étiquettes du registre sont immuables.

Chaque déploiement ([deploy.sh](../infra/deploy/deploy.sh)) suit ces étapes :

1. migrations (Cloud Run Job) ;
2. révision sans trafic, étiquetée `candidat` ;
3. test de fumée sur son URL ;
4. paliers, chacun suivi d'un test de fumée **du candidat** et d'une recherche d'erreurs 5xx sur sa révision.

Au premier échec, à une erreur de gcloud ou à une annulation du job, le trafic retourne à 100 % sur la révision précédente. Un déploiement est refusé si le trafic est déjà partagé entre deux révisions (déploiement précédent interrompu) : faire d'abord un retour arrière. Les déploiements et retours arrière d'un même environnement ne peuvent pas se chevaucher (groupe de concurrence commun).

**Règle des migrations** : uniquement des ajouts compatibles avec la révision précédente (nouvelle table, colonne facultative). Une suppression se fait en deux temps : d'abord le code qui n'utilise plus la colonne, puis la migration qui la retire, dans une release ultérieure. C'est ce qui permet le retour arrière sans toucher à la base.

## Retour arrière

- **Automatique** : pendant un déploiement, dès qu'un test de fumée échoue.
- **Manuel**, en quelques secondes et sans reconstruction : GitHub → Actions → `rollback` → choisir l'environnement, et éventuellement la révision. Par défaut : la révision prête la plus récente créée avant celle qui sert (un candidat refusé n'est jamais choisi). En ligne de commande : `bash infra/deploy/rollback.sh attesta-prod [révision]`.
- Le registre conserve les 30 dernières images ; Cloud Run conserve les révisions.

## Sauvegardes et restauration

- **Cloud SQL** : sauvegarde quotidienne à 02:00 (7 jours en préprod, 30 en prod) et restauration à un instant donné sur 7 jours (PITR).
- **Restaurer à un instant donné** : cloner vers une nouvelle instance, vérifier, puis faire pointer le secret `database-url` vers le clone.
  ```bash
  gcloud sql instances clone attesta-prod attesta-prod-restau --point-in-time "2026-10-16T09:00:00Z"
  ```
- **Données concernées** : depuis la Phase 4, **comptes, profils enregistrés, veilles et consentements** (données durables des candidats), en plus des sessions, quotas, compteurs, coûts et offres. Une perte de base fait perdre des comptes : la restauration doit être testée avant l'ouverture des comptes au public.
- **Restauration testée** : à faire en préprod avant l'ouverture, puis chaque trimestre. **Non faite à ce jour** (pas de projet Google Cloud).

## Surveillance et alertes

Définies dans [monitoring.tf](../infra/terraform/environment/monitoring.tf), notifiées par e-mail à l'astreinte :

| Alerte              | Déclenchement                              | Première action                                                                                                      |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Service injoignable | `/health` en échec pendant 5 min           | Cloud Run → révisions : la dernière est-elle saine ? Retour arrière si elle vient d'être déployée                    |
| Erreurs serveur     | plus de 5 réponses 5xx en 5 min            | journaux `severity>=ERROR` ; retour arrière si c'est lié au déploiement                                              |
| IA en mode dégradé  | plus de 5 générations dégradées en 15 min  | journaux `jsonPayload.event="generation"`, champ `reason` (ci-dessous)                                               |
| Veille en échec     | journal `severity>=ERROR` du job de veille | `jsonPayload.event` : `ingestion_erreur` (source, statut), `veille_terminee` (`failedJobs`) ; voir « Veille emploi » |
| Plainte e-mail      | chaque plainte reçue par le webhook        | la veille de l'abonné est déjà arrêtée ; taux sur 30 jours : `jsonPayload.event="taux_plaintes"`                     |

Métriques issues des journaux, dans Cloud Monitoring : nombre de générations par statut et par raison, **score de fidélité** (distribution), **coût par CV** (USD), **durée de génération**. La latence et le volume des requêtes viennent de Cloud Run lui-même. Le coût cumulé se lit en base :

```sql
SELECT date_trunc('day', at) AS jour, step, sum(cost_usd) AS cout_usd, count(*) AS appels
FROM llm_usage GROUP BY 1, 2 ORDER BY 1 DESC;
```

## Incidents

| Symptôme                                                      | Cause probable                                                                                   | Action                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/health` renvoie 503                                         | PostgreSQL injoignable                                                                           | Cloud SQL : état de l'instance, connexions ; en local `docker compose logs db`                                                                                                                   |
| Le formulaire « perd » la saisie à chaque page                | cookie de session refusé : `HTTPS_ONLY` actif sur une connexion en HTTP                          | servir en HTTPS, ou `HTTPS_ONLY=false` **en local uniquement**                                                                                                                                   |
| 403 « Votre session a expiré »                                | jeton CSRF absent ou session expirée (2 h d'inactivité, 24 h au plus)                            | comportement attendu ; recharger la page                                                                                                                                                         |
| Export PDF en erreur 500, « Rendu PDF interrompu »            | Chromium lent ou bloqué                                                                          | mémoire de l'instance ; `PDF_TIMEOUT_MS` ; le navigateur est relancé automatiquement                                                                                                             |
| Chromium ne démarre pas (« No usable sandbox »)               | espaces de noms utilisateur bloqués                                                              | Docker : profil `infra/seccomp/chromium.json` ; Ubuntu 24.04 : `sysctl kernel.apparmor_restrict_unprivileged_userns=0` ; Cloud Run : `chromium_no_sandbox = true` (ADR 0009), en dernier recours |
| Bandeau « La reformulation par IA est indisponible »          | fournisseur injoignable, quota Vertex, délai dépassé                                             | `reason` = `indisponible` : identité du service, quota Vertex ; `refus` : contenu décliné ; `budget` : `LLM_MAX_COST_USD_PER_CV` ; le parcours reste utilisable sans IA                          |
| « La reformulation obtenue ne respectait pas nos contrôles »  | 3 sorties non conformes de suite                                                                 | `pipelineVersion` et `redactionAttempts` dans les journaux ; relancer `npm run evals:live`                                                                                                       |
| « Un traitement par l'IA est déjà en cours »                  | verrou de session posé (10 min au plus si une instance s'est arrêtée)                            | attendre ; le verrou expire seul                                                                                                                                                                 |
| 429 Too Many Requests                                         | limiteur : 300 requêtes ou 20 exports par 15 min, 10 appels à l'IA par heure et par IP           | derrière un proxy, vérifier `TRUST_PROXY` (sinon toutes les requêtes semblent venir du proxy)                                                                                                    |
| « Ce PDF est trop long à analyser » ou « n'a pas pu être lu » | délai de 10 s, plafond mémoire de 768 Mo ou temps CPU de 15 s dépassé par le processus d'analyse | comportement attendu pour un PDF piégé ; l'instance n'est pas affectée ; saisie manuelle                                                                                                         |
| « Trop d'imports sont en cours »                              | une analyse à la fois par instance, 3 en attente au plus                                         | réessayer ; augmenter les instances si c'est fréquent                                                                                                                                            |
| Erreurs « too many clients » de PostgreSQL                    | `max_instances × PG_POOL_MAX` dépasse `max_connections` (le job de veille en ajoute 7)           | réduire `pg_pool_max` ou `max_instances`, ou agrandir la base (tfvars)                                                                                                                           |

### Veille emploi

| Symptôme                                                | Cause probable                                                                                 | Action                                                                                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingestion_erreur`, `source: ba`, `errorType: ZodError` | BA Jobsuche a changé de format (API non officielle)                                            | comparer une réponse réelle aux schémas de `packages/jobwatch/src/sources/ba.ts` ; les autres sources et les abonnés continuent             |
| `ingestion_erreur`, `status: 403` ou `429`              | clé client BA refusée, quota d'une source atteint                                              | vérifier https://github.com/bundesAPI/jobsuche-api ; réduire `DAILY_REQUEST_LIMITS` (`apps/worker/src/main.ts`)                             |
| Aucun e-mail reçu par un abonné                         | aucune offre nouvelle (comportement voulu), veille non confirmée, désabonnée ou suspendue      | `summary.subscribers` dans `veille_terminee` ; état de la veille dans « Mon compte »                                                        |
| `rerank_degrade`                                        | Vertex indisponible ou budget `JOBWATCH_LLM_MAX_COST_USD` atteint                              | les rapports partent quand même, classés par la recherche, avec une mention dans le rapport                                                 |
| Erreur « TEI injoignable » ou « jeton d'identité »      | service TEI arrêté, droit `run.invoker` manquant, premier démarrage (téléchargement du modèle) | relancer le job ; vérifier `google_cloud_run_v2_service_iam_member.tei_invoker`                                                             |
| Job relancé après un incident                           | —                                                                                              | sans risque : une offre n'est stockée qu'une fois, un abonné ne reçoit qu'un e-mail par jour (même un envoi interrompu n'est jamais refait) |
| Taux de plaintes au-delà de 0,1 %                       | envois non désirés                                                                             | suspendre le Cloud Scheduler (`gcloud scheduler jobs pause`), examiner les critères et le contenu ; Gmail bloque au-delà de 0,3 %           |

## Données

- Aucune donnée personnelle dans les journaux : méthode, chemin, statut, durée, jetons, coût. La CI le vérifie sur le conteneur.
- Sessions anonymes : table `session`, expiration à 2 h glissantes, plafond de 24 h, purge toutes les 15 min.
- Quotas et compteurs : identifiants de session et IP stockés sous forme d'empreinte (HMAC), jamais en clair ; purgés après 1 jour.
- Coûts LLM (`llm_usage`) : ni contenu ni session ; conservés 13 mois.
- Effacement immédiat : bouton « Effacer mes données ». Un effacement pendant une génération reste effectif (test d'intégration).
- Comptes : liens de connexion et de confirmation stockés sous forme d'empreinte ; jetons masqués dans les journaux (`/compte/connexion/:jeton`). Export et suppression depuis « Mon compte ».
- Veille : purge quotidienne par le job (offres de plus de 60 jours, comptes sans connexion depuis 18 mois, veilles non confirmées après 7 jours). Retours du fournisseur d'e-mail : un compteur, sans adresse.
