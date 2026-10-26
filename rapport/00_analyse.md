# Analyse préalable du dépôt Attesta

Document de travail (phase 1). Il rassemble ce que le code permet d'établir avant la rédaction du rapport. Chaque
affirmation renvoie à un fichier du dépôt. Les éléments que le code ne permet pas de déduire figurent à la fin,
dans « Points à confirmer ».

État analysé : branche `chore/phase-2-socle`, le 26 octobre 2026. Le dernier commit est `b517ef9`, du
21 octobre 2026. L'arbre de travail contient en plus **171 fichiers modifiés et 120 non suivis** : ADR 0026 à
0046, comptes par mot de passe, assistants IA, extension, suivi des candidatures, CV en ligne, etc. Le rapport
décrira l'arbre de travail tel qu'il est. L'historique Git, lui, s'arrête au 21 octobre.

## 1. Résumé de la plateforme

**Attesta, « le CV qui dit vrai »** (`package.json`, `README.md`) génère un CV ciblé pour chaque offre d'emploi
sans rien inventer. Chaque ligne générée renvoie à un fait du profil du candidat (pointeur JSON). Un contrôle de
fidélité déterministe, écrit en code et sans IA, retire toute ligne non prouvée avant affichage ou export
(`services/cv-generation/src/faithfulness.ts`). Principe affiché : « l'IA propose, le code contrôle, le candidat
décide ».

Autour de ce cœur, la plateforme couvre toute la candidature :

- profil versionné (compatible JSON Resume), import d'un CV PDF (par IA ou par règles), pièces justificatives et
  photo chiffrées ;
- offres : texte collé, catalogue synchronisé dans quatre pays (DE, FR, CA, TN), extension de navigateur ;
- CV ciblé : génération en direct (SSE), relecture ligne par ligne, cinq modèles ATS, usages propres à chaque
  pays, export en PDF et en Word, traduction, CV en ligne par lien secret ;
- six assistants IA : intervieweuse de profil, juge de fidélité, conseillère ATS, traduction, coach d'entretien,
  plan de progression ;
- lettres de motivation, suivi des candidatures, rappels par e-mail ;
- veille emploi quotidienne avec rapports PDF envoyés par e-mail ;
- administration : santé des services, usage et coût de l'IA, lancement de la veille et du catalogue ;
- RGPD : consentements, export de toutes les données, suppression propagée à tous les services.

**Trajectoire** (git log, `TASKS.md`, `docs/adr/`) :

- 16 octobre 2026 : monolithe modulaire (`apps/web`, `apps/worker`, `packages/*`, `db/`), en quatre phases :
  socle sans IA, pipeline LLM, industrialisation GCP, veille et comptes. Tag `v0.4-monolithe`.
- 18 octobre : décision de migrer vers 6 microservices (ADR 0011 à 0024) et suite de parité E2E.
- 21 octobre : services `auth`, `gateway`, `profiles`, puis `jobs-matching`, `cv-generation`, `letters-export`
  et `job-watch`, puis le frontend React.
- Ensuite (non commité) : ADR 0025 à 0046 et les fonctionnalités correspondantes.

## 2. Stack détectée (versions lues dans les `package.json`)

| Couche | Technologies et versions (plages déclarées) | Fichiers |
| --- | --- | --- |
| Exécution | Node.js ≥ 22 (`.nvmrc` : 22), TypeScript ^5.9.3 strict, modules ES (NodeNext) | `package.json`, `tsconfig.base.json` |
| API | Express ^5.3.0, Zod ^4.6.7 | `services/*/package.json` |
| Gateway | http-proxy-middleware ^3.0.7, helmet ^8.3.0, express-rate-limit ^8.7.1 | `gateway/package.json` |
| Sécurité | jose ^6.2.12 (JWT RS256, JWKS), scrypt natif (N = 2^15), AES-256-GCM natif | `services/auth`, `services/profiles/src/evidence.ts` |
| Données | PostgreSQL 16 + pgvector 0.8.0 (`pgvector/pgvector:0.8.0-pg16`), pg ^8.23.1, node-pg-migrate ^9.0.0 | `compose.yaml`, `services/*/migrations` |
| Documents | Puppeteer ^25.14.0, EJS ^3.1.10, pdf-lib ^1.17.1, pdfjs-dist ^6.4.299, multer ^2.0.2, @fontsource/source-sans-3 | `services/letters-export`, `services/profiles` |
| E-mail | nodemailer ^8.0.2, Mailpit v1.27 en local, Brevo par SMTP (ADR 0010) | `services/auth`, `services/job-watch` |
| IA | Claude par `packages/llm-client` (API Anthropic ou Vertex AI), fournisseur `demo` sans clé ; BGE-M3 par TEI `cpu-1.8` ; ESCO | `packages/llm-client`, `compose.yaml` |
| Frontend | React ^19.3.1, React Router ^7.18.4, TanStack Query ^5.104.5, Vite ^8.3.4, Tailwind CSS ^4.3.3, servi par nginx | `frontend/package.json`, `frontend/nginx.conf` |
| Tests | Vitest ^5.0.5, Supertest ^7.3.1, Playwright ^1.64.1, @axe-core/playwright ^4.14.0, Testing Library, Stryker (mutation), fast-check (propriétés) | `package.json`, `services/*/stryker.config.json` |
| Qualité | ESLint ^10.12.0, typescript-eslint ^8.71.2, Prettier ^3.9.10, commitlint (CI) | `eslint.config.js`, `.github/workflows/ci.yml` |
| DevOps | Docker, Docker Compose (profils `core`, `full`, `veille`, `tei`), GitHub Actions, Trivy, gitleaks, Terraform (gelé), Cloud Run (gelé) | `compose.yaml`, `.github/workflows`, `infra/` |

## 3. Modules

### Unités déployables

| Unité | Port | Base | Responsabilité | Code |
| --- | --- | --- | --- | --- |
| `frontend` | 8080 | – | Application React servie par nginx (CSP, en-têtes de sécurité) | `frontend/` |
| `gateway` | 4000 | – | Point d'entrée unique : JWT par JWKS, liste blanche des routes publiques, rôle admin, quotas, taille des corps, corrélation `X-Request-Id`, santé agrégée | `gateway/src/app.ts`, `routing.ts` |
| `auth` | 4001 | `attesta_auth` | Comptes (identifiant et mot de passe, lien magique historique), invité, JWT RS256, refresh tournant, codes de récupération, consentements, export et suppression RGPD par outbox | `services/auth/src` |
| `profiles` | 4002 | `attesta_profiles` | Profil versionné, import PDF (processus isolé, IA ou règles), justificatifs, photo, intervieweuse | `services/profiles/src` |
| `cv-generation` | 4003 | `attesta_cvgen` | Pipeline de CV ciblé, contrôle de fidélité, corrections, juge, ATS, coach, plan, traduction, quotas IA | `services/cv-generation/src` |
| `jobs-matching` | 4004 | `attesta_jobs` | Offres saisies et analysées, catalogue synchronisé (7 sources), recherche hybride (plein texte, vecteurs, RRF), reclassement, ESCO, villes | `services/jobs-matching/src` |
| `job-watch` | 4005 | `attesta_watch` | Abonnements à la veille (double opt-in), exécution quotidienne, e-mails et rapports, rappels, webhook Brevo | `services/job-watch/src` |
| `letters-export` | 4006 | `attesta_letters` | Lettres, rendu PDF (Chromium) et Word, annexes, CV en ligne, textes et suivi de candidature, rapports de veille | `services/letters-export/src` |
| `extension` | – | – | Extension Chrome MV3 « Cibler cette offre » | `extension/` |

### Paquets partagés (sans logique métier)

`shared-schemas` (contrats Zod), `llm-client` (fournisseurs, budget, prompts, mode démo), `http-kit` (erreurs RFC
7807, `X-Request-Id`, `/health` et `/ready`, vérification JWT, rôles, scopes, client HTTP, OpenAPI), `logger`,
`config`. Ils sont livrés compilés (`dist/` versionné, ADR 0025).

### Héritage

`apps/web`, `apps/worker`, `db/` et les paquets `packages/llm`, `render`, `schema`, `shared`, `jobwatch`
appartiennent au monolithe gelé (`v0.4-monolithe`), en cours de retrait. Le conteneur `web` tourne encore dans
la pile compose.

## 4. Acteurs et rôles

Les rôles sont portés par la revendication `role` du JWT (`packages/http-kit/src/auth.ts`, ADR 0024) :
`candidate | admin | guest | service`.

| Acteur | Moyen technique | Droits |
| --- | --- | --- |
| Visiteur anonyme | Aucun jeton | Pages publiques (accueil, guide, exemples, tarifs, confidentialité), création de compte, connexion |
| Invité (`guest`) | `POST /v1/session/guest`, jeton de 2 h, données effacées sous 24 h | Parcours CV : profil, offre, génération, export. Pas de justificatifs, veille, rappels ni compte |
| Candidat (`candidate`) | Identifiant et mot de passe (scrypt), access token de 15 min, refresh en cookie HttpOnly | Toutes les fonctionnalités, plus les droits RGPD |
| Administrateur (`admin`) | Comptes listés dans `ADMIN_USERNAMES` ou `ADMIN_EMAILS` | Fonctions candidat, plus les routes `/v1/admin/*` : statistiques, santé, lancement de la veille et du catalogue |
| Destinataire d'un CV en ligne (recruteur) | Lien secret `GET /v1/public/cv/:token` | Lecture seule d'un instantané HTML |
| Service interne (`service`) | Jeton de service court à portée limitée (`users:contact`, `users:export`, `users:delete`, `matching:run`, `reports:render`, `profiles:read`) | Routes `/internal/*`, jamais exposées par la gateway |
| Systèmes externes | – | Claude (Anthropic ou Vertex AI), sources d'offres (BA, Arbeitnow, Greenhouse, Lever, SmartRecruiters, RSS, Jooble, Adzuna), ESCO, TEI BGE-M3, SMTP (Mailpit ou Brevo), webhook Brevo |

## 5. Endpoints

Les chemins sont vus par le service ; la gateway les expose sous `/api/<préfixe>` : `auth`, `profiles`, `cv`,
`jobs`, `watch`, `letters` (`gateway/src/routing.ts`). Les routes `/internal/*` ne sont jamais routées.
Légende des droits : **P** = publique (liste blanche de la gateway), **U** = candidat, admin ou invité, **C** =
compte requis (candidat ou admin), **A** = admin, **S** = jeton de service.

| Service | Routes publiques (hors `/internal`) | Nombre |
| --- | --- | --- |
| auth (`services/auth/src/routes.ts`) | P : `POST /v1/accounts`, `POST /v1/session/password`, `POST /v1/password/reset`, `POST /v1/login-links`, `GET /v1/login-links/:token`, `POST /v1/session`, `POST /v1/session/refresh`, `POST /v1/session/guest`, `DELETE /v1/session`, `GET /.well-known/jwks.json` · C : `GET /v1/me`, `PUT /v1/me/password`, `POST /v1/me/recovery-codes`, `PUT /v1/me/consents`, `GET /v1/me/export`, `DELETE /v1/me` · A : `GET /v1/admin/stats` | 17 (+2 internes) |
| profiles | U : `GET\|PUT\|DELETE /v1/profiles/me`, `GET /v1/profiles/me/versions[/:version]`, `POST /v1/profiles/import`, `POST /v1/profiles/me/interview[/answer]`, `POST /v1/assistants/feedback` · C : justificatifs `GET\|POST /v1/profiles/me/evidence`, `GET …/:id/file`, `DELETE …/:id` ; photo `PUT\|GET\|DELETE /v1/profiles/me/photo` · A : `GET /v1/admin/stats` | 18 (+7 internes) |
| cv-generation | U : `POST\|GET /v1/generations` (POST en SSE), `GET\|DELETE /v1/generations/:id`, `PATCH …/:id/lines`, `GET …/:id/assistants`, `POST …/:id/judge`, `…/interview`, `…/interview/feedback`, `…/learning-plan`, `…/translate`, `PUT …/:id/translation/:lang`, `POST …/:id/ats`, `…/ats/apply`, `POST /v1/learning-plan`, `GET /v1/ats/overview`, `POST /v1/assistants/feedback` · A : `GET /v1/admin/stats` | 19 (+5 internes) |
| jobs-matching | U : `POST\|GET /v1/offers`, `POST /v1/offers/from-posting/:id`, `GET\|DELETE /v1/offers/:id`, `GET /v1/postings`, `GET /v1/postings/overview`, `POST /v1/postings/:id/explain`, `POST /v1/postings/scores`, `GET /v1/cities`, `POST /v1/assistants/feedback` · A : `POST /v1/admin/catalogue`, `GET /v1/admin/stats` | 13 (+6 internes) |
| job-watch | C : `GET\|POST /v1/reminders`, `DELETE /v1/reminders/:id`, `GET\|PUT\|DELETE /v1/subscriptions/me`, `GET /v1/subscriptions/me/matches` · P : `POST /v1/subscriptions/confirm/:token`, `POST /v1/subscriptions/unsubscribe/:token`, `POST /v1/webhooks/brevo` (secret propre) · A : `GET /v1/admin/stats`, `GET\|POST /v1/admin/runs` | 14 (+2 internes) |
| letters-export | U : `POST\|GET /v1/letters`, `GET\|PUT\|DELETE /v1/letters/:id`, `POST …/:id/translate`, `POST …/:id/pdf`, `POST /v1/exports/cv`, `…/cv/docx`, `…/cv/preview`, `POST\|GET /v1/shares`, `DELETE /v1/shares/:id`, `POST /v1/applications/answer`, `…/message`, `…/check`, `GET\|DELETE /v1/applications/history/:id`, `GET /v1/applications/tracking`, `PUT …/tracking/:id`, `POST /v1/assistants/feedback` · P : `GET /v1/public/cv/:token` · A : `GET /v1/admin/stats` | 25 (+4 internes) |
| gateway | A : `GET /api/admin/v1/health` (santé agrégée) ; `/health`, `/ready` | 1 (+2) |

Chaque service expose aussi `/health` et `/ready` (`packages/http-kit/src/health.ts`) et décrit son contrat dans
`services/*/openapi.yaml`, généré depuis Zod.

## 6. Modèle de données (migrations SQL réelles)

Une base par service, avec un rôle PostgreSQL cloisonné (`infra/postgres/init.sql`, ADR 0013). Il n'y a aucune
clé étrangère entre bases : `user_id` vient d'`auth`, sous forme d'UUID ou de `guest_<uuid>`.

| Base | Tables |
| --- | --- |
| `attesta_auth` | `app_user`, `login_token`, `refresh_token`, `recovery_code`, `consent_log`, `audit_event`, `outbox` |
| `attesta_profiles` | `profile_version` (JSONB versionné), `profile_evidence` (chiffré), `profile_photo` (chiffré), `assistant_vote`, `llm_usage` |
| `attesta_cvgen` | `generation` (instantanés du profil et de l'offre, CV, rapport, lignes retirées ou éditées), `assistant_result`, `assistant_vote`, `ia_quota`, `llm_usage` |
| `attesta_jobs` | `user_offer`, `job_posting` (tsvector généré fr/de/en), `job_embedding` (vector(1024), HNSW), `job_source_run`, `esco_cache`, `assistant_vote`, `llm_usage` |
| `attesta_watch` | `watch_subscription`, `watch_consent`, `match_result`, `email_delivery`, `email_event`, `watch_run`, `reminder` |
| `attesta_letters` | `cover_letter`, `application_text`, `application_tracking`, `cv_share`, `assistant_vote`, `llm_usage` |

Les objets métier internes aux colonnes JSONB (Profile, TailoredCv, CvLine, FaithfulnessReport, OfferAnalysis)
sont définis dans `packages/shared-schemas/src`.

## 7. Tâches de fond (vérifiées dans le code)

- `auth/src/rgpd.ts` : traitement de l'outbox de suppression et purge horaire.
- `jobs-matching/src/catalogue.ts` : synchronisation du catalogue toutes les `CATALOGUE_SYNC_HOURS` heures, plus
  une purge.
- `job-watch/src/daily.ts` : veille quotidienne à `DAILY_RUN_HOUR` (7 h par défaut) ; `reminders.ts` vérifie les
  rappels toutes les 15 minutes.
- `profiles/src/server.ts` : purge des données d'invité.

## 8. Tests et qualité (constat)

- Tests unitaires et d'intégration par service (Vitest, Supertest, PostgreSQL jetable), tests de contrat OpenAPI,
  tests de propriétés, tests de mutation (Stryker, `.github/workflows/mutation.yml`), jeu d'évaluation du juge
  (`services/cv-generation/evals`).
- E2E Playwright : `e2e/parite` (17 cas), `e2e/frontend` (23 cas), accessibilité axe-core.
- `docs/rapport-campagne-tests.md` (26 octobre 2026) : campagne **partielle**. Frontend 25/25 ; propriétés
  332/332 ; `auth` 86/86 avec 92,30 % des lignes couvertes ; mutation sur `passwords.ts` à 93,2 %. En revanche,
  `npm test` à la racine donne 4 échecs dus aux délais de Puppeteer sur l'ancien monolithe, et les E2E n'ont pas
  été exécutés.
- Le README reconnaît un retard des tests sur les dernières fonctionnalités et une CI encore en partie tournée
  vers le monolithe.

## 9. Déploiement (constat)

- **Effectif** : pile Docker Compose locale. La pile tourne actuellement sur ce poste : 6 services, gateway,
  frontend, base et Mailpit en état `healthy`.
- **Écrit mais gelé** : Terraform pour GCP `europe-west9` (Cloud Run, Cloud SQL, Secret Manager), plus
  `cd.yml` et `rollback.yml` (déploiement par paliers 10, 50 puis 100 %). Gelé par l'ADR 0021, « hors périmètre
  de la soutenance ».
- **CI** : `ci.yml` exécute lint, types, migrations montée-descente-montée, tests en matrice par unité,
  gitleaks, commitlint, E2E, Trivy, contrôle du cloisonnement des bases, absence de données personnelles dans
  les journaux et `terraform validate`.

## 10. Constats utiles pour la rédaction

- Commandes du `CLAUDE.md` : la session Bash utilise Node v20.20.2 alors que le projet exige 22.18.0. Je ferai
  `nvm use 22.18.0` avant toute commande Node (Mermaid CLI, captures).
- Pandoc est absent ; Python 3.12 est disponible ; le skill `docx` est disponible pour la phase 4.
- La pile est démarrée : les captures Playwright sont possibles avec les comptes de démonstration du README
  (`npm run demo:seed`). **Ce script écrit dans les bases locales** : il faut votre accord avant de le lancer.
- Fichiers à ne jamais lire ni citer : `services/profiles/.env`, `.env.smtp` (secrets). Seuls les noms de
  variables des `.env.example` seront repris.

## 11. Points à confirmer

1. **Destinataires** : jury de PFE, client ou équipe technique ? Cela fixe le ton et la place de l'état de l'art.
2. **Format final** : Word, PDF ou les deux ?
3. **Volume** : 40 à 60 pages ?
4. **Auteur(s)** : nom, ou noms de l'équipe. `TASKS.md` et l'ADR 0021 mentionnent « six équipiers » et un « chef
   de projet » ; `CODEOWNERS` contient encore `@membre1` à `@membre6`. Est-ce un projet individuel ou un projet
   d'équipe ? Quel est votre rôle ?
5. **Cadre académique** : établissement, formation, année universitaire, encadrant(s) académique(s) et
   professionnel(s), entreprise d'accueil éventuelle, logo pour la page de garde.
6. **Date** du rapport et date de soutenance.
7. **Contexte et problématique métier** : pourquoi ce projet ? Constat de départ, public cible (jeunes diplômés,
   candidats à la mobilité internationale ?), commanditaire réel ou projet fictif ?
8. **Étude de l'existant** : le dépôt ne contient aucune étude des concurrents (Canva, Europass, Kickresume,
   Teal, outils ATS…). Faut-il en rédiger une à partir de connaissances générales, clairement signalée comme
   telle, ou en avez-vous une ?
9. **Hébergement réel** : rien n'est déployé (Terraform gelé). Le rapport doit-il présenter GCP comme une
   **cible** ou comme une perspective ? Y a-t-il eu un déploiement ailleurs ?
10. **IA réelle** : Claude a-t-il été utilisé réellement (clé ou Vertex) ? `TASKS.md` indique que les
    identifiants sont « en attente », et `compose.yaml` ne transmet pas `ANTHROPIC_API_KEY`. Sinon, le rapport
    présentera les captures en **mode démonstration**.
11. **Organisation et méthode** : méthode de travail (phases, revue, Scrum ?), planning (diagramme de Gantt ?),
    répartition des rôles. Le code ne donne que les dates des commits, du 16 au 21 octobre 2026.
12. **Usage de Claude Code** : la décision Q12 (`docs/questions.md`) indique que Claude Code a servi d'outil de
    génération de code. Faut-il le mentionner dans le rapport, et sous quelle forme ?
13. **Captures d'écran** : m'autorisez-vous à lancer `npm run demo:seed` (écriture de comptes de démonstration
    dans la base locale), puis Playwright, pour capturer les écrans ? Sinon, je laisserai des emplacements
    `[CAPTURE : …]`.
14. **Monolithe historique** : faut-il présenter la migration du monolithe vers les microservices comme un
    chapitre du rapport (difficultés, choix), ou s'en tenir à l'état final ?
15. **Chiffres de tests** : faut-il reprendre ceux de `docs/rapport-campagne-tests.md` (campagne partielle avec
    4 échecs), ou souhaitez-vous que je relance les tests avant la rédaction ? Votre consigne mémorisée prévoit
    une passe de tests finale en fin de projet.
16. **Statut des ADR 0026 à 0046** : ils sont « proposés » et non commités. Faut-il les présenter comme des
    décisions prises ?
