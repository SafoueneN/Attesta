# Runbook

Trois environnements : **dev** (poste local, `docker compose`), **préprod** et **prod** (Google Cloud Run, Paris ; [ADR 0009](adr/0009-hebergement-et-execution.md)).

## Lancer en local

### Avec Docker (recommandé)

```bash
cp .env.example .env                               # facultatif : clés d'IA, adresse de contact
docker compose --profile core up -d --build --wait # ou --profile full, avec la veille (job-watch)
npm run demo:seed                                  # comptes de démonstration
```

Puis ouvrir http://localhost:8080. Si le port est déjà pris : `FRONTEND_PORT=9000 docker compose --profile core up`.

Sans profil, seule l'infrastructure démarre ([ADR 0021](adr/0021-cible-execution-et-outillage.md)). `db-init` crée à chaque démarrage, s'ils manquent, les bases et rôles cloisonnés des services ([ADR 0013](adr/0013-une-base-par-service.md)) ; vérification : `bash infra/postgres/verifier-cloisonnement.sh`. PostgreSQL est joignable depuis le poste sur `127.0.0.1:5433` (variable `DB_PORT`).

La pile comprend PostgreSQL 16 + pgvector, les six services (chacun migre sa base au démarrage), la gateway, le frontend (nginx) et **Mailpit**, qui reçoit tous les e-mails (rapports de veille, rappels) : http://localhost:8025. Aucun e-mail ne sort du poste. Chromium (rendu PDF de letters-export) tourne **avec sa sandbox**, grâce au profil seccomp `infra/seccomp/chromium.json`. Le fournisseur d'IA est `demo` par défaut : aucun appel au modèle.

### Veille emploi en local

1. Démarrer avec `--profile full`, se connecter (ex. `amina.diallo`), enregistrer son profil, puis « Veille emploi » : métiers, pays, ville, adresse de réception ; la veille est active dès l'enregistrement (ADR 0030).
2. Lancer l'exécution quotidienne depuis l'administration (compte `admin`), ou démarrer job-watch avec `DAILY_RUN_ENABLED=true`. Vecteurs BGE-M3 : `docker compose --profile tei up -d tei`, puis `EMBEDDINGS_PROVIDER=tei`.
3. Le rapport arrive dans Mailpit. Relancer le même jour n'envoie rien de plus.

La veille interroge les **vraies** API publiques des sources d'offres (sans clé pour BA Jobsuche et ESCO).

### Envoi réel depuis le poste (Gmail, Mailjet, Brevo…)

Remplir `.env.smtp` (modèle commenté, ignoré par Git et par Docker) avec l'URL SMTP du fournisseur et l'expéditeur, puis `docker compose --env-file .env.smtp --profile core up -d`. Sans ce fichier, les e-mails restent dans Mailpit. Le webhook des plaintes et rebonds exige une adresse publique : il n'est branché qu'en préprod.

- **Gmail** : le mot de passe du compte est refusé (erreur 535). Activer la validation en deux étapes, créer un
  mot de passe d'application (https://myaccount.google.com/apppasswords), puis
  `SMTP_URL=smtps://adresse%40gmail.com:<16 lettres sans espaces>@smtp.gmail.com:465` et
  `MAIL_FROM=Attesta <adresse@gmail.com>`. Au plus 500 e-mails par jour.
- **Brevo** (choix de production, ADR 0010) : compte gratuit, 300 e-mails par jour ; clé SMTP dans
  « SMTP & API », expéditeur vérifié, puis `SMTP_URL=smtp://<identifiant>:<clé SMTP>@smtp-relay.brevo.com:587`.
- Les caractères spéciaux de l'identifiant et du mot de passe s'encodent (`@` → `%40`, `:` → `%3A`).
- Après modification : `docker compose --env-file .env.smtp --profile full up -d --force-recreate auth job-watch`,
  puis `npm run smtp:test -- votre@adresse` vérifie les identifiants et envoie un e-mail de test, sans
  afficher de secret.

### Choisir le fournisseur d'IA (docs/adr/0047)

Par défaut, les services tournent en `demo`, sans modèle. Pour un vrai modèle, mettre les clés dans un fichier
jamais commité (`.env.ia`, par exemple), puis `docker compose --env-file .env.ia --profile core up -d` :

| Fournisseur         | Variables                                                                       |
| ------------------- | ------------------------------------------------------------------------------- |
| Claude, Vertex UE   | `AI_PROVIDER=claude`, `VERTEX_PROJECT_ID` (seul Claude admis en production)     |
| Claude, API directe | `AI_PROVIDER=claude`, `CLAUDE_TRANSPORT=anthropic`, `ANTHROPIC_API_KEY`         |
| Groq                | `AI_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL` (facultatif)                   |
| Cerebras            | `AI_PROVIDER=cerebras`, `CEREBRAS_API_KEY`, `CEREBRAS_MODEL` (facultatif)       |
| Mistral             | `AI_PROVIDER=mistral`, `MISTRAL_API_KEY`, `MISTRAL_MODEL` (facultatif)          |
| OpenRouter          | `AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (facultatif) |
| Gemini              | `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL` (facultatif)             |
| Ollama (local)      | `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://ollama:11434`, `OLLAMA_MODEL`     |

Ollama : `docker compose --profile core --profile ollama up -d`, puis `docker compose exec ollama ollama pull qwen3:8b`.

En cas de quota atteint (429) ou de délai dépassé, la requête passe aux fournisseurs configurés suivants, dans
l'ordre claude, groq, cerebras, mistral, openrouter, gemini, ollama. Chaque bascule est journalisée (`llm_repli`). `AI_FALLBACK_PROVIDERS`
fixe une autre liste, et `none` désactive le repli. En production, seuls Claude sur Vertex et Ollama sont admis.

### Sans Docker

Chaque service se lance seul depuis son dossier (`cp .env.example .env`, puis `npm ci && npm run dev`) ; le
frontend aussi (`npm run dev`, Vite relaie `/api` vers la gateway). Voir le README de chaque service.

## Vérifications

| Commande                                                 | Rôle                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run lint`                                           | ESLint (frontières entre paquets et services) + Prettier                 |
| `npm run typecheck`, `npm test`                          | paquets partagés : types stricts, tests                                  |
| `node scripts/ci/tester-unite.mjs services/<service>`    | un service : installation, types, tests avec couverture (comme la CI)    |
| `npm run smoke -- http://localhost:8080`                 | test de fumée de la pile (sans appel au modèle)                          |
| `E2E_BASE_URL=http://localhost:8080 npm run test:parite` | Playwright + axe-core contre la pile compose (après `npm run demo:seed`) |
| `bash infra/deploy/test/deploy.test.sh`                  | scénarios des scripts de déploiement et de retour arrière                |
| `npm run eval:live` (dans `services/cv-generation`)      | évaluation de fidélité sur le vrai modèle (**payante**)                  |

Les tests d'intégration de chaque service créent puis suppriment leur propre base jetable, à partir de
`TEST_ADMIN_DATABASE_URL` (par exemple `postgres://attesta:attesta-dev-uniquement@127.0.0.1:5433/postgres`
avec la base de la pile compose).

## Mise en place de Google Cloud (une fois)

> **Gelé** : cette section et les suivantes décrivent le déploiement du monolithe v0.4. Le déploiement des
> microservices est à réécrire ([ADR 0048](adr/0048-retrait-du-monolithe-et-ouverture-publique.md)).

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
| « La reformulation obtenue ne respectait pas nos contrôles »  | 3 sorties non conformes de suite                                                                 | `pipelineVersion` et `redactionAttempts` dans les journaux ; relancer `npm run eval:live` (cv-generation)                                                                                        |
| « Un traitement par l'IA est déjà en cours »                  | verrou de session posé (10 min au plus si une instance s'est arrêtée)                            | attendre ; le verrou expire seul                                                                                                                                                                 |
| 429 Too Many Requests                                         | limiteur : 300 requêtes ou 20 exports par 15 min, 10 appels à l'IA par heure et par IP           | derrière un proxy, vérifier `TRUST_PROXY` (sinon toutes les requêtes semblent venir du proxy)                                                                                                    |
| « Ce PDF est trop long à analyser » ou « n'a pas pu être lu » | délai de 10 s, plafond mémoire de 768 Mo ou temps CPU de 15 s dépassé par le processus d'analyse | comportement attendu pour un PDF piégé ; l'instance n'est pas affectée ; saisie manuelle                                                                                                         |
| « Trop d'imports sont en cours »                              | une analyse à la fois par instance, 3 en attente au plus                                         | réessayer ; augmenter les instances si c'est fréquent                                                                                                                                            |
| Erreurs « too many clients » de PostgreSQL                    | `max_instances × PG_POOL_MAX` dépasse `max_connections` (le job de veille en ajoute 7)           | réduire `pg_pool_max` ou `max_instances`, ou agrandir la base (tfvars)                                                                                                                           |

### Veille emploi

| Symptôme                                                | Cause probable                                                                                 | Action                                                                                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingestion_erreur`, `source: ba`, `errorType: ZodError` | BA Jobsuche a changé de format (API non officielle)                                            | comparer une réponse réelle aux schémas de `packages/jobwatch/src/sources/ba.ts` ; les autres sources et les abonnés continuent             |
| `ingestion_erreur`, `status: 403` ou `429`              | clé client BA refusée, quota d'une source atteint                                              | vérifier https://github.com/bundesAPI/jobsuche-api ; réduire les plafonds de requêtes de la source (`services/jobs-matching/src/sources`)   |
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
