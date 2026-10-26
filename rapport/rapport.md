---
title: "Attesta : le CV qui dit vrai"
subtitle: "Rapport de projet : conception et réalisation d'une plateforme de CV ciblés et vérifiables, en microservices"
author: "[À COMPLÉTER : nom de l'auteur ou des membres de l'équipe]"
date: "[À COMPLÉTER : date du rapport]"
---

# Page de garde {.unnumbered}

**[À COMPLÉTER : logo et nom de l'établissement]**

**[À COMPLÉTER : formation, année universitaire]**

**Rapport de projet de fin d'études**

**ATTESTA : LE CV QUI DIT VRAI**

Conception et réalisation d'une plateforme de génération de CV ciblés, fidèles et vérifiables ligne par ligne,
fondée sur une architecture de six microservices.

| | |
|---|---|
| Réalisé par | [À COMPLÉTER : nom(s)] |
| Encadrant académique | [À COMPLÉTER] |
| Encadrant professionnel | [À COMPLÉTER, le cas échéant] |
| Organisme d'accueil | [À COMPLÉTER, le cas échéant] |
| Date de soutenance | [À COMPLÉTER] |
| Version du code décrite | branche `chore/phase-2-socle`, arbre de travail du 26 octobre 2026 |

# Résumé exécutif {.unnumbered}

Attesta est une plateforme web qui produit, pour chaque offre d'emploi, un CV ciblé **sans rien inventer**.
Le candidat décrit une fois son parcours dans un profil structuré. Pour chaque offre, l'intelligence artificielle
(Claude, d'Anthropic) choisit, ordonne et reformule les faits pertinents. Chaque ligne produite cite ensuite
ses sources dans le profil, sous forme de pointeurs JSON. Un contrôle de fidélité **écrit en code, sans IA**,
vérifie chaque ligne : nombres, dates, entités, compétences et sources. Toute ligne non prouvée est retirée
avant affichage ou export. Le principe directeur, inscrit dans le code et la documentation : *l'IA propose,
le code contrôle, le candidat décide*.

Autour de ce cœur, la plateforme accompagne toute la candidature :

- import d'un CV PDF existant ;
- catalogue d'offres synchronisé dans quatre pays (Allemagne, France, Canada, Tunisie) ;
- cinq modèles de CV lisibles par les logiciels de tri (ATS), adaptés aux usages de chaque pays ;
- exports PDF et Word, CV en ligne partageable ;
- lettres de motivation et suivi des candidatures ;
- six assistants IA, dont chacun a son propre garde-fou ;
- veille emploi quotidienne par e-mail ;
- tableau de bord d'administration.

Sur le plan technique, le projet a d'abord été livré sous forme de monolithe modulaire (tag `v0.4-monolithe`,
16 octobre 2026). Il a ensuite été **migré vers six microservices** en TypeScript (Node.js 22, Express 5), à partir
du 18 octobre 2026 :

- chacun possède sa propre base PostgreSQL 16 et son contrat d'API (Zod, OpenAPI) ;
- une gateway unique vérifie les jetons JWT RS256 par JWKS ;
- un frontend React 19 sert d'interface.

Les données personnelles sont protégées par conception :

- mots de passe hachés (scrypt), justificatifs et photo chiffrés (AES-256-GCM) ;
- aucune donnée personnelle dans les journaux ;
- export et suppression des données propagés à tous les services par une *outbox*.

La plateforme fonctionne intégralement en local avec Docker Compose. Le déploiement sur Google Cloud est écrit
(Terraform, CI/CD) mais **gelé** (ADR 0021). La dernière campagne de tests (26 octobre 2026) est partielle :

- réussites : frontend 25/25, tests de propriétés 332/332, service `auth` couvert à 92,3 % des lignes,
  score de mutation de 93,2 % sur le module des mots de passe ;
- limites : quatre échecs de délai Chromium sur l'ancien monolithe, et des tests de bout en bout non
  exécutés lors de cette campagne.

**Mots-clés** : CV ciblé, fidélité, IA générative, microservices, RGPD, TypeScript, PostgreSQL, React.

# Introduction

## Contexte

Un candidat qui répond à plusieurs offres doit adapter son CV à chacune : mettre en avant les expériences
pertinentes, reprendre le vocabulaire de l'annonce, respecter les usages du pays. Les logiciels de tri des
candidatures (ATS, *Applicant Tracking Systems*) renforcent cette exigence : un CV dont la mise en page ou le
vocabulaire échappe à leur lecture risque d'être écarté avant toute lecture humaine.

Les modèles de langage savent rédiger vite et bien, mais ils ont un défaut connu : ils peuvent produire des
affirmations plausibles et fausses. Dans un CV, une compétence ajoutée ou un chiffre gonflé n'est pas une
erreur de style : c'est une fausse déclaration, qui expose le candidat.

[À COMPLÉTER : contexte propre au projet, par exemple origine de l'idée, commanditaire, public visé. Le code
ne permet pas de le déduire.]

## Problématique

Comment tirer parti de l'IA générative pour adapter un CV à chaque offre **tout en garantissant que chaque
affirmation est prouvée** par les informations fournies par le candidat ? Et comment construire autour de ce
principe une plateforme complète, sûre pour les données personnelles et maintenable par une équipe ?

## Objectifs

Les objectifs ci-dessous sont lus dans le README, les ADR et le code :

1. **Fidélité vérifiable** : chaque ligne d'un CV généré renvoie à au moins une source du profil ; une ligne
   sans source valide est retirée avant affichage ou export (`packages/shared-schemas/src/cv.ts`,
   `services/cv-generation/src/faithfulness.ts`).
2. **Ciblage** : analyse de l'offre (exigences indispensables et souhaitées, mots-clés), sélection et
   reformulation des faits pertinents ; mots-clés absents du profil **signalés, jamais ajoutés**.
3. **Accompagnement de la candidature** : lettres, assistants IA, suivi, veille emploi, rappels.
4. **Protection des données** : minimisation, chiffrement, droits RGPD (export, suppression), aucune donnée
   personnelle dans les journaux.
5. **Architecture maintenable** : six microservices autonomes, contrats explicites, tests par service, pile
   lançable en une commande (ADR 0011, 0021, 0023).

## Périmètre

| Dans le périmètre | Hors périmètre ou gelé |
|---|---|
| Six microservices, gateway, frontend React, extension Chrome | Déploiement Google Cloud (Terraform et CD écrits, gelés : ADR 0021) |
| Pile locale complète (Docker Compose) | Publication de l'extension sur les boutiques |
| Quatre pays : DE, FR, CA, TN | Interface en anglais et en allemand (prévue) |
| Mode démonstration de l'IA, sans clé | Formules tarifaires (gratuité de lancement) |
| Monolithe historique `apps/`, `db/` (gelé, en cours de retrait) | |

## Organisation du rapport

Le chapitre 2 situe Attesta parmi les solutions existantes. Le chapitre 3 analyse les besoins. Le chapitre 4
présente la conception (architecture, données, séquences, API) et le chapitre 5 justifie les choix
technologiques. Le chapitre 6 décrit la réalisation, module par module. Les chapitres 7 à 9 traitent de la
sécurité, des tests et du déploiement. Le chapitre 10 est un guide d'utilisation, le chapitre 11 dresse le
bilan, le chapitre 12 ouvre les perspectives. Des annexes complètent le tout.

**Méthode de rédaction.** Chaque affirmation technique renvoie à un fichier du dépôt. Les informations que le
code ne permet pas d'établir sont signalées par la mention **[À COMPLÉTER]** ou **[À CONFIRMER]**.

# Étude de l'existant et valeur ajoutée

> **Avertissement.** Le dépôt ne contient aucune étude de marché. Cette section s'appuie sur une connaissance
> générale des catégories d'outils existants, et non sur un banc d'essai documenté. Elle est **à valider et
> compléter** par l'auteur ([À CONFIRMER]).

## Catégories de solutions existantes

| Catégorie | Exemples génériques | Apports | Limites au regard de la problématique |
|---|---|---|---|
| Éditeurs de CV en ligne à modèles | Générateurs de CV grand public, Europass | Mise en page rapide, modèles variés | Un seul CV, adapté à la main à chaque offre ; aucune vérification du contenu |
| Assistants IA généralistes | Agents conversationnels | Reformulation fluide, rapide | Aucune garantie de fidélité : un chiffre ou une compétence peuvent être inventés |
| Outils « optimiseurs ATS » | Analyseurs de mots-clés | Mesure l'adéquation CV-offre | Incitent parfois à ajouter des mots-clés sans preuve |
| Plateformes d'offres d'emploi | Agrégateurs, sites d'employeurs | Volume d'offres, alertes | Pas de lien entre l'offre et la preuve des compétences du candidat |

## Valeur ajoutée d'Attesta (vérifiable dans le code)

1. **Fidélité prouvée, pas promise.** Le modèle n'écrit que des lignes de texte libre, chacune rattachée à au
   moins un fait du profil. Les champs factuels (employeur, poste, dates, diplômes, compétences) ne passent
   jamais par le modèle : le code les recopie (`packages/shared-schemas/src/cv.ts`). Le contrôle final est
   déterministe (`faithfulness.ts`).
2. **Transparence.** Rapport de fidélité par ligne, lignes retirées listées avec leur raison, mots-clés
   manquants affichés (figure « Relecture d'un CV ciblé », chapitre 10).
3. **Usages par pays.** Photo, date de naissance, nationalité, autorisation de travail et signature datée
   selon l'Allemagne, la France, le Canada ou la Tunisie (ADR 0036, `services/letters-export/src/render/norms.ts`).
4. **Assistants à garde-fous.** Chaque assistant IA a une règle vérifiée par le code : une reformulation n'est
   gardée que si elle passe le contrôle de fidélité, les ressources du plan de progression viennent d'un
   catalogue tenu dans le code, etc. (README, ADR 0028 et 0029).
5. **Protection des données dès la conception.** La photo et les informations personnelles ne sont jamais
   envoyées à l'IA. Les justificatifs sont chiffrés. L'export et la suppression couvrent tous les services.
6. **Fonctionnement sans clé IA.** Un mode démonstration calcule des réponses par le code et les signale
   comme telles. L'import d'un CV par règles fonctionne sans IA (ADR 0038).

# Analyse des besoins

## Acteurs

Les rôles sont portés par la revendication `role` du jeton JWT : `candidate`, `admin`, `guest` et `service`
(`packages/http-kit/src/auth.ts`, ADR 0024).

| Acteur | Identification | Description |
|---|---|---|
| Visiteur | Aucune | Consulte les pages publiques, crée un compte ou démarre une session invitée |
| Invité | Jeton `guest`, 2 h, identité limitée à 24 h | Réalise un CV ciblé sans compte ; données effacées sous 24 h |
| Candidat | Identifiant et mot de passe | Utilise toutes les fonctionnalités, exerce ses droits RGPD |
| Administrateur | Compte listé dans `ADMIN_USERNAMES` ou `ADMIN_EMAILS` | Supervise la santé des services, l'usage et le coût de l'IA, lance la veille et le catalogue |
| Recruteur | Lien secret | Consulte un CV en ligne partagé par un candidat |
| Service interne | Jeton de service à portée limitée | Appels `/internal/*` entre services, jamais exposés |
| Planificateur | Minuteurs des services | Veille quotidienne, synchronisation du catalogue, purges, rappels |

## Besoins fonctionnels

Les priorités sont déduites de la place de chaque fonction dans le code et la documentation : **P1**
correspond au cœur, **P2** à l'accompagnement, **P3** au confort. [À CONFIRMER : priorités métier réelles.]

| ID | Besoin | Acteur | Priorité | Réalisation (fichier) |
|---|---|---|---|---|
| BF01 | Créer un compte par identifiant et mot de passe, sans e-mail | Visiteur | P1 | `auth/src/routes.ts` (`POST /v1/accounts`), ADR 0030 |
| BF02 | Se connecter, rester connecté, se déconnecter | Candidat | P1 | `POST /v1/session/password`, `/session/refresh`, `DELETE /v1/session` |
| BF03 | Récupérer son compte par code à usage unique | Candidat | P2 | `POST /v1/password/reset`, ADR 0039 |
| BF04 | Utiliser la plateforme sans compte | Invité | P2 | `POST /v1/session/guest` |
| BF05 | Saisir un profil structuré et versionné | Candidat, invité | P1 | `profiles` : `PUT /v1/profiles/me`, table `profile_version` |
| BF06 | Importer un CV PDF (IA ou règles) | Candidat, invité | P2 | `POST /v1/profiles/import`, `import-rules.ts` |
| BF07 | Ajouter une offre (texte collé ou catalogue) et l'analyser | Candidat, invité | P1 | `jobs-matching` : `POST /v1/offers`, `/from-posting/:id` |
| BF08 | Générer un CV ciblé avec progression en direct | Candidat, invité | P1 | `cv-generation` : `POST /v1/generations` (SSE) |
| BF09 | Contrôler la fidélité de chaque ligne | Système | P1 | `faithfulness.ts` |
| BF10 | Relire et corriger les lignes, avec nouveau contrôle | Candidat, invité | P1 | `PATCH /v1/generations/:id/lines` |
| BF11 | Exporter le CV en PDF ou en Word, selon le modèle et le pays | Candidat, invité | P1 | `letters-export` : `/v1/exports/cv`, `/cv/docx` |
| BF12 | Joindre des justificatifs chiffrés en annexe | Candidat | P2 | `profiles/src/evidence.ts`, ADR 0027 |
| BF13 | Gérer une photo d'identité chiffrée | Candidat | P3 | `PUT /v1/profiles/me/photo`, ADR 0036 |
| BF14 | Utiliser les six assistants IA | Candidat, invité | P2 | `cv-generation/src/assistants.ts`, `profiles/src/assistant.ts` |
| BF15 | Rédiger une lettre de motivation selon un ton | Candidat, invité | P2 | `POST /v1/letters` |
| BF16 | Traduire CV et lettre (anglais, allemand) | Candidat, invité | P2 | `/translate` |
| BF17 | Suivre ses candidatures par statut | Candidat | P2 | `/v1/applications/tracking`, ADR 0040 |
| BF18 | Partager un CV en ligne par lien révocable | Candidat | P3 | `/v1/shares`, ADR 0042 |
| BF19 | Consulter le catalogue d'offres de quatre pays | Candidat, invité | P2 | `GET /v1/postings`, ADR 0034 |
| BF20 | S'abonner à la veille emploi (double opt-in) | Candidat | P2 | `PUT /v1/subscriptions/me` |
| BF21 | Recevoir chaque jour les offres et deux rapports PDF | Candidat | P2 | `job-watch/src/daily.ts` |
| BF22 | Programmer des rappels par e-mail | Candidat | P3 | `/v1/reminders` |
| BF23 | Exporter toutes ses données, supprimer son compte | Candidat | P1 | `GET /v1/me/export`, `DELETE /v1/me` |
| BF24 | Gérer ses consentements | Candidat | P2 | `PUT /v1/me/consents` |
| BF25 | Superviser santé, usage et coûts | Administrateur | P2 | `/api/admin/v1/health`, `/v1/admin/stats` |
| BF26 | Lancer la veille et la synchronisation du catalogue | Administrateur | P3 | `POST /v1/admin/runs`, `/v1/admin/catalogue` |
| BF27 | Cibler une offre depuis le navigateur | Candidat | P3 | `extension/`, ADR 0044 |
| BF28 | Consulter les pages publiques (guide, exemples, tarifs) | Visiteur | P3 | `frontend/src/pages` |

## Besoins non fonctionnels

| ID | Catégorie | Exigence | Mise en œuvre vérifiable |
|---|---|---|---|
| BNF01 | Fidélité | Aucune ligne non prouvée affichée ou exportée | Contrôle déterministe, relecture avant export |
| BNF02 | Sécurité | Authentification forte, jetons courts | JWT RS256 de 15 min, refresh tournant, scrypt |
| BNF03 | Confidentialité | Aucune donnée personnelle dans les journaux | Journaux structurés sans corps ni identité ; contrôle en CI |
| BNF04 | RGPD | Minimisation, durées de conservation, droits | Invités 24 h, offres 60 jours, comptes inactifs 18 mois, journaux 13 mois, outbox |
| BNF05 | Robustesse | Panne de l'IA sans sortie non validée | Mode dégradé (indisponible, refus, budget, non conforme) |
| BNF06 | Maîtrise des coûts | Plafond de dépense IA | Budget mensuel par service, coût maximal par CV, quotas |
| BNF07 | Performance | Réponses bornées | Délais par service à la gateway, concurrence PDF bornée |
| BNF08 | Disponibilité | Sondes de santé | `/health` et `/ready` sur chaque service |
| BNF09 | Maintenabilité | Services autonomes, contrats | Base, tests et lockfile par service ; Zod et OpenAPI |
| BNF10 | Accessibilité | Interface utilisable par tous | Tests axe-core avec Playwright |
| BNF11 | Compatibilité ATS | CV lisible par les logiciels de tri | Modèles en une colonne, PDF balisé (`tagged: true`) |
| BNF12 | Portabilité | Démarrage en une commande | Docker Compose, profils `core` et `full` |
| BNF13 | Langue | Interface, erreurs et documentation en français | Conventions de `CLAUDE.md` |

## Cas d'utilisation

![Diagramme des cas d'utilisation](diagrammes/02-cas-utilisation.png)

Le diagramme ci-dessus résume les interactions. Les trois cas centraux sont détaillés ci-dessous.

**CU « Générer un CV ciblé »**

- *Acteur* : candidat ou invité.
- *Préconditions* : un profil est enregistré et une offre a été ajoutée et analysée.
- *Scénario nominal* :
  1. Le candidat choisit l'offre et lance la génération.
  2. La progression s'affiche en direct : analyse, rédaction, contrôle.
  3. Le CV apparaît avec son score de fidélité et la liste des mots-clés absents du profil.
  4. Le candidat relit chaque ligne et l'exporte.
- *Scénarios alternatifs* :
  - IA indisponible, refus, budget dépassé ou sortie non conforme : CV en mode dégradé, assemblé depuis le
    profil, avec un message explicite.
  - Profil absent : erreur 409 « Enregistrez d'abord votre profil ».
  - Quota atteint : erreur 429.

**CU « Exporter le CV »**

- *Acteur* : candidat ou invité.
- *Scénario* : choix du modèle (Sobre, Soignée, Classique, Moderne, Compacte), du pays et de la langue ; ajout
  facultatif de justificatifs en annexe ; téléchargement du PDF ou du fichier Word. Aucun PDF n'est stocké.

**CU « Supprimer son compte »**

- *Acteur* : candidat.
- *Scénario* : confirmation, compte passé à l'état `deleting`, une ligne d'*outbox* par service détenteur,
  suppression propagée et confirmée par chaque service, puis effacement du compte.

# Conception

## Architecture générale

### Du monolithe aux microservices

La première version (16 octobre 2026) était un **monolithe modulaire** : application Express unique
(`apps/web`), processus de fond (`apps/worker`), bibliothèques internes (`packages/llm`, `render`, `schema`,
`jobwatch`) et une seule base (`db/migrations`). Elle est figée par le tag `v0.4-monolithe`. L'ADR 0011
(18 octobre 2026) a décidé son extraction en six microservices. La règle était de garder le comportement
identique : une suite de **parité** Playwright (`e2e/parite`) a été écrite sur le monolithe *avant*
l'extraction, puis rejouée après chaque service extrait.

Six règles d'architecture, rappelées dans `CLAUDE.md`, encadrent la cible :

1. Un service possède son code, sa base, son API et ses tests ; il n'accède jamais à la base d'un autre.
2. Les paquets partagés (`packages/*`) ne contiennent aucune logique métier.
3. Les contrats sont des schémas Zod (`packages/shared-schemas`), dont on génère l'OpenAPI.
4. Les appels à l'IA passent uniquement par `packages/llm-client`.
5. Fidélité : aucune compétence ajoutée, chaque ligne renvoie à sa source, contrôle avant tout affichage.
6. Toute décision structurante fait l'objet d'un ADR (46 ADR dans `docs/adr/`).

### Vue d'ensemble

![Architecture globale de la plateforme](diagrammes/01-architecture.png)

Le navigateur ne parle qu'au **frontend** (nginx). Celui-ci relaie `/api/*` vers la **gateway**, seul point
d'entrée de l'API. La gateway, sans état ni logique métier (`gateway/src/app.ts`), applique dans l'ordre :

1. en-têtes de sécurité (helmet) ;
2. identifiant de corrélation `X-Request-Id` ;
3. journal d'accès sans donnée personnelle ;
4. refus des requêtes `OPTIONS` intersites (aucune CORS) ;
5. quotas par IP ;
6. limite de taille des corps (1 Mo, 10 Mo pour l'import PDF) ;
7. vérification du jeton, sauf pour une liste blanche de routes publiques ;
8. réservation de `/v1/admin/*` aux administrateurs ;
9. relais vers le service.

| Service | Port | Base | Responsabilité |
|---|---|---|---|
| `auth` | 4001 | `attesta_auth` | Comptes, sessions, JWT RS256 et JWKS, codes de récupération, consentements, RGPD distribué |
| `profiles` | 4002 | `attesta_profiles` | Profil versionné, import PDF, justificatifs, photo, intervieweuse |
| `cv-generation` | 4003 | `attesta_cvgen` | CV ciblé, contrôle de fidélité, juge, ATS, coach, plan, traduction |
| `jobs-matching` | 4004 | `attesta_jobs` | Offres, analyse, catalogue, sources, classement, villes |
| `job-watch` | 4005 | `attesta_watch` | Veille quotidienne, e-mails, rappels |
| `letters-export` | 4006 | `attesta_letters` | Lettres, rendu PDF et Word, CV en ligne, suivi des candidatures |

### Communication entre services

![Flux internes entre services et portées des jetons de service](diagrammes/11-flux-internes.png)

La communication est synchrone, en HTTP et JSON (ADR 0012). Deux modes d'authentification coexistent :

- **jeton relayé** : quand un service agit pour l'utilisateur (par exemple `cv-generation` qui lit le profil),
  il transmet le JWT reçu (`Principal.token`) ;
- **jeton de service** : pour les traitements de fond (veille, RGPD), un service obtient d'`auth` un jeton
  court portant une audience et une portée précises (`users:contact`, `profiles:read`, `matching:run`,
  `reports:render`, `users:export`, `users:delete`). `auth` n'accorde que les couples listés dans
  `SERVICE_GRANTS` et vérifie le secret du demandeur en temps constant (`timingSafeEqual`).

Les routes `/internal/*` ne sont **jamais routées** par la gateway (`isInternalPath`, réponse 404).

### Paquets partagés

| Paquet | Contenu |
|---|---|
| `shared-schemas` | Schémas Zod du profil, de l'offre, du CV et des API (`src/api/*.ts`) |
| `llm-client` | Fournisseurs (Anthropic, Vertex AI, démonstration, scripté pour les tests), budget mensuel, tarifs, chargeur de prompts versionnés |
| `http-kit` | Application Express de base, erreurs RFC 7807, `X-Request-Id`, `/health` et `/ready`, JWT par JWKS, `requireRole`, `requireScope`, client HTTP inter-services, OpenAPI |
| `logger` | Journal structuré, contexte de requête |
| `config` | Validation des variables d'environnement au démarrage |

Ces paquets sont **livrés compilés** (`dist/` versionné, ADR 0025) : chaque service les consomme par
`file:../../packages/...` et s'installe seul, avec son propre lockfile (ADR 0023).

## Modèle de données

Chaque service a sa base et son rôle PostgreSQL. Personne d'autre que le propriétaire ne peut s'y connecter
(`infra/postgres/init.sql`, `REVOKE ALL ON DATABASE … FROM PUBLIC`). Il n'existe **aucune clé étrangère entre
bases** : l'identifiant `user_id`, attribué par `auth` (UUID, ou `guest_<uuid>` pour un invité), est une
référence logique. La cohérence est assurée par la suppression distribuée (ADR 0019). Le diagramme suivant
réunit les tables principales ; les liens en pointillé sont ces références logiques.

![Modèle physique des données : vue d'ensemble des six bases](diagrammes/03-modele-donnees.png)

Les trois diagrammes détaillés qui suivent reprennent ces tables base par base, avec leurs colonnes principales.

### Base `attesta_auth`

| Table | Rôle | Points notables |
|---|---|---|
| `app_user` | Compte | `username` unique (`^[a-z0-9][a-z0-9._-]{2,29}$`), `password_hash` scrypt, `email` facultatif depuis l'ADR 0030, `role` (`candidate` ou `admin`), `status` (`active` ou `deleting`) |
| `refresh_token` | Jeton de rafraîchissement | Seule l'empreinte est stockée ; `family_id` : la réutilisation d'un jeton déjà tourné révoque toute la famille ; 7 jours d'inactivité, 30 jours au plus |
| `recovery_code` | Codes de récupération | 8 codes à usage unique, empreinte seule, `used_at` |
| `login_token` | Lien magique (anciens comptes) | Empreinte, 15 minutes |
| `consent_log` | Journal des consentements | Finalité (`service`, `veille`, `promo`), version du texte, empreinte de l'IP |
| `audit_event` | Audit | Type et date, jamais l'adresse ; 13 mois |
| `outbox` | Suppression distribuée | Une ligne par service détenteur, `attempts`, `next_attempt_at`, `done_at`, `failed_at` |

### Base `attesta_profiles`

| Table | Rôle | Points notables |
|---|---|---|
| `profile_version` | Profil candidat | JSONB conforme au schéma `Profile` ; une nouvelle version à chaque enregistrement (`UNIQUE (user_id, version)`) ; purge des invités après 24 h |
| `profile_evidence` | Justificatifs | Rattaché à un élément (`target` du type `/work/0`), type (`diplome`, `attestation_employeur`…), PDF, PNG ou JPEG de 5 Mo au plus ; contenu chiffré (`iv`, `tag`, `content`) |
| `profile_photo` | Photo du CV | Une par compte, 2 Mo au plus, chiffrée, à part du profil |
| `assistant_vote` | Avis sur les assistants | Ni utilisateur ni contenu : rôle, sens (−1 ou 1), origine |
| `llm_usage` | Consommation de l'IA | Étape, modèle, jetons, coût, latence ; aucun contenu |

![Modèle détaillé des bases attesta_auth et attesta_profiles](diagrammes/03a-donnees-auth-profiles.png)

### Base `attesta_cvgen`

| Table | Rôle | Points notables |
|---|---|---|
| `generation` | CV ciblé | **Instantanés** du profil et de l'offre utilisés (les pointeurs restent valides même si le profil change), `cv`, `report`, lignes `removed` et `edited`, `revision`, `status` (`ok` ou `degraded`), `provider_kind` (`ia` ou `demo`), coût |
| `assistant_result` | Résultat de chaque assistant | Clé `rôle` ou `rôle:variante` ; supprimé avec la génération |
| `ia_quota` | Quota quotidien et verrou | Sujet = empreinte HMAC, jamais l'identifiant |
| `assistant_vote`, `llm_usage` | Comme ci-dessus | |

### Base `attesta_jobs`

| Table | Rôle | Points notables |
|---|---|---|
| `user_offer` | Offre ajoutée par un candidat | Texte de 50 à 20 000 caractères, `analysis` JSONB, `posting_id` si elle vient du catalogue |
| `job_posting` | Offre collectée | `UNIQUE (source, external_id)`, empreinte de dédoublonnage, `tsv` **généré** selon la langue (allemand, français, anglais), salaire seulement s'il est publié ; purge à 60 jours |
| `job_embedding` | Vecteur de l'offre | `vector(1024)` (BGE-M3), index HNSW cosinus |
| `job_source_run` | Journal d'ingestion | Requêtes, offres lues, insérées, doublons, erreurs |
| `esco_cache` | Cache du référentiel ESCO | Rafraîchi après 30 jours |

![Modèle détaillé des bases attesta_cvgen et attesta_jobs](diagrammes/03b-donnees-cvgen-jobs.png)

### Base `attesta_watch`

| Table | Rôle | Points notables |
|---|---|---|
| `watch_subscription` | Abonnement à la veille | 1 à 5 métiers, pays (DE, FR, CA, TN), ville et rayon (5 à 200 km), statut (`en_attente`, `active`, `desabonnee`, `suspendue`), jeton de confirmation haché, jeton de désabonnement, adresse de réception facultative |
| `watch_consent` | Consentement à la veille | Double opt-in et retrait |
| `match_result` | Offres proposées | Une fois par abonnement (`UNIQUE`), scores RRF, similarité, couverture, localisation, compétences manquantes |
| `email_delivery` | Envoi quotidien | Au plus un par abonnement et par jour (idempotence) |
| `email_event` | Retours du fournisseur | Plainte, rebond, désabonnement, sans adresse |
| `watch_run` | Exécutions | Planifiée ou manuelle, bilan chiffré |
| `reminder` | Rappels | Progression ou relance ; lien relatif seulement |

### Base `attesta_letters`

| Table | Rôle | Points notables |
|---|---|---|
| `cover_letter` | Lettre | Ton (`sobre`, `chaleureux`, `dynamique`) ; paragraphes JSONB avec leurs sources et leur contrôle |
| `application_text` | Textes de candidature | Types `formulaire`, `linkedin`, `relance` et `remerciement` |
| `application_tracking` | Suivi | Une ligne par CV ciblé ; statut `a_envoyer`, `envoyee`, `relancee`, `entretien`, `refus` ou `offre` |
| `cv_share` | CV en ligne | Instantané HTML, empreinte du jeton, compteur de vues, expiration à 90 jours |

**Aucun PDF n'est stocké** : il est produit à la demande (ADR 0018).

![Modèle détaillé des bases attesta_watch et attesta_letters (les generation_id renvoient à cv-generation)](diagrammes/03c-donnees-watch-letters.png)

### Modèle métier (contrats Zod)

Les colonnes JSONB contiennent des objets métier définis dans `packages/shared-schemas`. Le profil reprend la
structure de JSON Resume ; le CV ciblé est construit pour que le modèle de langage ne puisse pas créer de faits.

![Diagramme de classes des objets métier](diagrammes/04-classes-metier.png)

```ts
// packages/shared-schemas/src/cv.ts : le modèle choisit et ordonne, il ne crée pas.
export const CvLine = z.object({
  text: z.string().trim().min(1).max(500),
  // Chaque ligne cite entre 1 et 5 faits du profil (pointeurs JSON, par exemple "/work/0/highlights/1").
  sources: z.array(FactPointer).min(1, "Chaque ligne doit citer au moins une source").max(5),
});

export const TailoredCv = z.object({
  headline: CvLine.optional(),
  summary: z.array(CvLine).max(4),
  work: z.array(EntryWithLines("work")).max(15),   // ref vers l'expérience + lignes reformulées
  education: z.array(z.object({ ref: entryRef("education") })).max(10), // recopiée par le code
  skills: z.array(entryRef("skills")).max(30),     // références seulement : aucune compétence nouvelle
  /** Mots-clés de l'offre sans preuve dans le profil : signalés, jamais ajoutés. */
  missingKeywords: z.array(z.string().trim().min(1).max(100)).max(60),
  // … projects, languages, certificates
});
```

## Scénarios clés (diagrammes de séquence)

### Connexion et renouvellement de session

![Séquence : connexion par mot de passe et rotation du refresh token](diagrammes/05-seq-connexion.png)

Le jeton d'accès (JWT RS256, 15 minutes) vit **en mémoire** dans le navigateur ; le jeton de
rafraîchissement est un cookie HttpOnly, opaque et haché en base. Chaque renouvellement le remplace. Si un
jeton déjà utilisé est présenté de nouveau, on présume un vol : toute la famille est révoquée. Un identifiant
inconnu est vérifié contre une empreinte leurre, pour ne pas révéler quels comptes existent.

### Génération d'un CV ciblé

![Séquence : génération d'un CV ciblé en flux SSE](diagrammes/06-seq-generation-cv.png)

La génération est diffusée en *Server-Sent Events* : la gateway la relaie sans tampon. La rédaction est
relancée au plus deux fois si la sortie ne respecte pas le contrat ; le modèle reçoit alors la liste exacte
des écarts. Le contrôle de fidélité intervient toujours après.

### Export du CV en PDF

![Séquence : export PDF avec usages du pays et annexes](diagrammes/07-seq-export-pdf.png)

### Suppression du compte (RGPD distribué)

![Séquence : suppression propagée par outbox](diagrammes/08-seq-suppression-rgpd.png)

La demande est inscrite, **dans la même transaction**, avec une ligne d'*outbox* par service. Une boucle de
fond (toutes les 5 secondes) appelle chaque service ; une réponse 200, 204 ou 404 vaut confirmation, ce qui
rend l'opération idempotente. Le compte n'est effacé qu'une fois toutes les cibles confirmées
(`finishDeletions`). Après 24 heures d'échecs, la ligne est abandonnée et une alerte est journalisée.

### Veille emploi quotidienne

![Séquence : exécution quotidienne de la veille](diagrammes/09-seq-veille.png)

## Conception de l'API

### Conventions

- Préfixes publics : `/api/auth`, `/api/profiles`, `/api/cv`, `/api/jobs`, `/api/watch` et `/api/letters`.
  Le préfixe est retiré avant le relais au service.
- Erreurs au format *Problem Details* (RFC 7807), type `urn:attesta:erreur:<code>`, message en français,
  champs en cause (`packages/http-kit/src/problem.ts`).
- Validation de chaque entrée par Zod (`parseInput`).
- Contrat de chaque service publié dans `services/*/openapi.yaml`, généré par `npm run openapi` et contrôlé
  par un test.
- Délais de relais par service (`gateway/src/routing.ts`) : 15 s pour `auth`, 180 s pour `cv-generation`,
  120 s pour `profiles`, `jobs-matching` et `letters-export`, 30 s pour `job-watch`.

### Rôles requis

Légende utilisée dans les tableaux suivants :

- **Public** : route en liste blanche de la gateway ;
- **Session** : candidat, administrateur ou invité (`requireRole("candidate","admin","guest")`) ;
- **Compte** : candidat ou administrateur (`requireAccount()` ou `requireRole("candidate","admin")`) ;
- **Admin** : administrateur ;
- **Service** : jeton de service et portée (`requireScope`).

### auth (`services/auth/src/routes.ts`)

| Méthode | Route | Description | Rôle |
|---|---|---|---|
| POST | `/v1/accounts` | Créer un compte (identifiant, mot de passe) ; codes de récupération remis | Public |
| POST | `/v1/session/password` | Connexion par mot de passe | Public |
| POST | `/v1/password/reset` | Nouveau mot de passe par code de récupération | Public |
| POST | `/v1/login-links` | Demander un lien de connexion (anciens comptes) | Public |
| GET | `/v1/login-links/:token` | Vérifier un lien | Public |
| POST | `/v1/session` | Ouvrir la session à partir d'un lien | Public |
| POST | `/v1/session/refresh` | Renouveler le jeton (cookie et en-tête anti-CSRF) | Public |
| POST | `/v1/session/guest` | Ouvrir ou reprendre une session invitée | Public |
| DELETE | `/v1/session` | Se déconnecter (famille de jetons révoquée) | Public |
| GET | `/.well-known/jwks.json` | Clés publiques de vérification | Public |
| GET | `/v1/me` | Compte, consentements, codes restants | Compte |
| PUT | `/v1/me/password` | Changer de mot de passe (autres sessions révoquées) | Compte |
| POST | `/v1/me/recovery-codes` | Régénérer les codes de récupération | Compte |
| PUT | `/v1/me/consents` | Accorder ou retirer un consentement | Compte |
| GET | `/v1/me/export` | Export JSON de toutes les données, tous services | Compte |
| DELETE | `/v1/me` | Supprimer le compte (propagé) | Compte |
| GET | `/v1/admin/stats` | Statistiques des comptes | Admin |
| POST | `/internal/v1/token` | Délivrer un jeton de service | Secret du service |
| GET | `/internal/v1/users/:id/contact` | Adresse de contact pour la veille | Service `users:contact` |

### profiles (`services/profiles/src/routes.ts`)

| Méthode | Route | Description | Rôle |
|---|---|---|---|
| GET, PUT, DELETE | `/v1/profiles/me` | Lire, enregistrer (nouvelle version) ou supprimer le profil | Session |
| GET | `/v1/profiles/me/versions[/:version]` | Historique des versions | Session |
| POST | `/v1/profiles/import` | Importer un CV PDF (10 Mo à la gateway) | Session |
| POST | `/v1/profiles/me/interview`, `…/interview/answer` | Intervieweuse de profil | Session |
| GET, POST | `/v1/profiles/me/evidence` | Lister ou déposer un justificatif | Compte |
| GET | `/v1/profiles/me/evidence/:id/file` | Télécharger un justificatif (déchiffré) | Compte |
| DELETE | `/v1/profiles/me/evidence/:id` | Supprimer un justificatif | Compte |
| PUT, GET, DELETE | `/v1/profiles/me/photo` | Photo du CV | Compte |
| POST | `/v1/assistants/feedback` | Avis sur une réponse d'assistant | Session |
| GET | `/v1/admin/stats` | Statistiques | Admin |
| GET | `/internal/v1/users/:id/profile` | Profil pour la veille | Service `profiles:read` |
| GET, DELETE | `/internal/v1/users/:id[/export]` | Export, suppression RGPD | Service `users:export`, `users:delete` |

### cv-generation (`services/cv-generation/src/routes.ts`)

| Méthode | Route | Description | Rôle |
|---|---|---|---|
| POST | `/v1/generations` | Générer un CV ciblé (JSON ou flux SSE) | Session |
| GET | `/v1/generations` | Lister ses CV | Session |
| GET, DELETE | `/v1/generations/:id` | Lire ou supprimer un CV | Session |
| PATCH | `/v1/generations/:id/lines` | Corriger des lignes (nouveau contrôle, révision) | Session |
| GET | `/v1/generations/:id/assistants` | Derniers résultats des assistants | Session |
| POST | `/v1/generations/:id/judge` | Juge de fidélité | Session |
| POST | `/v1/generations/:id/ats`, `…/ats/apply` | Conseillère ATS, insertion d'un mot-clé prouvé | Session |
| POST | `/v1/generations/:id/interview`, `…/interview/feedback` | Coach d'entretien (questions, retour STAR) | Session |
| POST | `/v1/generations/:id/learning-plan`, `/v1/learning-plan` | Plan de progression | Session |
| POST | `/v1/generations/:id/translate` | Traduire le CV (anglais, allemand) | Session |
| PUT | `/v1/generations/:id/translation/:lang` | Corriger une traduction | Session |
| GET | `/v1/ats/overview` | Synthèse ATS de ses CV | Session |
| POST | `/v1/assistants/feedback` | Avis | Session |
| GET | `/v1/admin/stats` | Statistiques, usage IA | Admin |
| GET, POST | `/internal/v1/generations/:id[/check]`, `…/translation/:lang` | CV vérifié pour l'export, contrôle de lignes | Session (jeton relayé) |

### jobs-matching (`services/jobs-matching/src/routes.ts`)

| Méthode | Route | Description | Rôle |
|---|---|---|---|
| POST | `/v1/offers` | Ajouter une offre collée (analyse unique) | Session |
| POST | `/v1/offers/from-posting/:id` | Cibler une offre du catalogue | Session |
| GET | `/v1/offers`, `/v1/offers/:id` | Lister, lire | Session |
| DELETE | `/v1/offers/:id` | Supprimer | Session |
| GET | `/v1/postings`, `/v1/postings/overview` | Catalogue filtré et paginé, totaux par pays | Session |
| POST | `/v1/postings/:id/explain` | Expliquer la correspondance avec le profil | Session |
| POST | `/v1/postings/scores` | Scores de correspondance | Session |
| GET | `/v1/cities` | Recherche de villes (GeoNames) | Session |
| POST | `/v1/admin/catalogue` | Lancer la synchronisation du catalogue | Admin |
| GET | `/v1/admin/stats` | Statistiques des sources et de l'IA | Admin |
| POST | `/internal/v1/ingestion`, `/internal/v1/matching` | Collecte et classement pour la veille | Service `matching:run` |

### job-watch (`services/job-watch/src/routes.ts`)

| Méthode | Route | Description | Rôle |
|---|---|---|---|
| GET, PUT, DELETE | `/v1/subscriptions/me` | Lire, créer ou modifier, résilier son abonnement | Compte |
| GET | `/v1/subscriptions/me/matches` | Offres déjà proposées | Compte |
| POST | `/v1/subscriptions/confirm/:token` | Confirmer (double opt-in) | Public (jeton) |
| POST | `/v1/subscriptions/unsubscribe/:token` | Désabonnement en un clic (RFC 8058) | Public (jeton) |
| POST | `/v1/webhooks/brevo` | Retours du fournisseur d'e-mail | Public (secret propre) |
| GET, POST | `/v1/reminders`, DELETE `/v1/reminders/:id` | Rappels | Compte |
| GET, POST | `/v1/admin/runs` | Exécutions de la veille, lancement manuel | Admin |
| GET | `/v1/admin/stats` | Statistiques | Admin |

### letters-export (`services/letters-export/src/routes.ts`)

| Méthode | Route | Description | Rôle |
|---|---|---|---|
| POST, GET | `/v1/letters` | Rédiger, lister les lettres | Session |
| GET, PUT, DELETE | `/v1/letters/:id` | Lire, corriger (contrôlée), supprimer | Session |
| POST | `/v1/letters/:id/translate`, `/v1/letters/:id/pdf` | Traduire, exporter la lettre | Session |
| POST | `/v1/exports/cv` | CV en PDF, annexes éventuelles | Session |
| POST | `/v1/exports/cv/docx` | CV en Word | Session |
| POST | `/v1/exports/cv/preview` | Aperçu HTML du CV | Session |
| POST, GET | `/v1/shares`, DELETE `/v1/shares/:id` | CV en ligne : créer, lister, révoquer | Session (comptes seulement, contrôlé par `accountOnly`) |
| GET | `/v1/public/cv/:token` | Consulter un CV partagé | Public (jeton) |
| POST | `/v1/applications/answer`, `/message`, `/check` | Réponse à un formulaire, message au recruteur, vérification | Session |
| GET, DELETE | `/v1/applications/history/:id` | Historique des textes | Session |
| GET, PUT | `/v1/applications/tracking[/:id]` | Suivi des candidatures | Session |
| GET | `/v1/admin/stats` | Statistiques | Admin |
| POST | `/internal/v1/reports/offers`, `/internal/v1/reports/gaps` | Rapports PDF de la veille | Service `reports:render` |

### gateway

| Méthode | Route | Description | Rôle |
|---|---|---|---|
| GET | `/api/admin/v1/health` | Santé agrégée des six services (`/ready`, délai de 3 s) | Admin |
| GET | `/health`, `/ready` | Sondes de la gateway | Public |

Extrait du **vrai code** de la garde de la gateway :

```ts
// gateway/src/app.ts : vérifie le jeton (sauf liste blanche), réserve /v1/admin/* aux administrateurs.
const guard = (service: string): RequestHandler => async (req, res, next) => {
  if (isInternalPath(req.path)) return next(new AppError("introuvable", 404, "Ressource introuvable."));
  if (isPublic(service, req.method, req.path)) return next();
  const token = bearerToken(req);
  if (!token) return next(unauthorized());
  let role: string;
  try {
    ({ role } = await verifier.verify(token));
  } catch {
    return next(unauthorized("Votre session a expiré. Reconnectez-vous."));
  }
  if (role === "service") return next(forbidden());           // un jeton de service ne passe jamais par la gateway
  if (isAdminPath(req.path) && role !== "admin") return next(forbidden());
  next();
};
```

La gateway n'est pas le seul rempart : chaque service revérifie le jeton et le rôle (« défense en
profondeur », `packages/http-kit/src/auth.ts`).

# Choix technologiques

Les versions ci-dessous sont les **plages déclarées** dans les fichiers `package.json` du dépôt et les images
de `compose.yaml`. Les versions exactes installées figurent dans les `package-lock.json` de chaque unité.

| Couche | Technologie | Version déclarée | Justification (ADR ou documentation) |
|---|---|---|---|
| Exécution | Node.js | ≥ 22 (`.nvmrc` : 22) ; images `node:22-bookworm-slim` | Un seul langage du navigateur au serveur ; version LTS |
| Langage | TypeScript (strict, NodeNext) | ^5.9.3 | Contrat typé de bout en bout (`z.infer`) : une sortie de l'IA ou un formulaire mal câblé casse la compilation, pas la production (décision Q1) |
| API | Express | ^5.3.0 | Cadre simple et répandu, testable avec Supertest (ADR 0012) |
| Contrats | Zod | ^4.6.7 | Une définition sert au type, à la validation et à l'OpenAPI (ADR 0017) |
| Gateway | http-proxy-middleware, helmet, express-rate-limit | ^3.0.7, ^8.3.0, ^8.7.1 | Relais en flux (SSE), en-têtes de sécurité, quotas (ADR 0015) |
| Jetons | jose | ^6.2.12 | JWT RS256 et JWKS : chaque service vérifie localement, sans appel à `auth` (ADR 0014) |
| Base | PostgreSQL + pgvector | image `pgvector/pgvector:0.8.0-pg16` | Transactions, plein texte multilingue et vecteurs dans le même moteur (ADR 0004, 0013) |
| Accès aux données | pg, node-pg-migrate | ^8.23.1, ^9.0.0 | SQL explicite, migrations SQL versionnées et testées en montée, descente et remontée |
| IA | Claude (API Anthropic ou Vertex AI UE) | modèles `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` (tarifs dans `llm-client/src/pricing.ts`) | Sorties structurées, rédaction en français et en allemand ; Vertex AI pour un traitement dans l'UE (ADR 0008, décision Q5) |
| Vecteurs | BGE-M3 par Text Embeddings Inference | image `text-embeddings-inference:cpu-1.8` | Vecteurs multilingues calculés localement (décision Q15) ; repli `hash` en développement |
| Référentiels | ESCO, GeoNames | API publique, `data/villes.json` | Métiers multilingues ; 2 475 villes de plus de 15 000 habitants |
| PDF | Puppeteer (Chromium), EJS, pdf-lib | ^25.14.0, ^3.1.10, ^1.17.1 | PDF identique à l'aperçu HTML, balisé ; annexes fusionnées (ADR 0005, 0018) |
| Lecture PDF | pdfjs-dist, multer | ^6.4.299, ^2.0.2 | Extraction du texte dans un processus isolé |
| Word | `node:zlib` seul | – | Archive OOXML écrite sans dépendance (ADR 0037) |
| E-mail | nodemailer ; Mailpit ; Brevo | ^8.0.2 ; image `axllent/mailpit:v1.27` | SMTP standard ; Mailpit capture tout en local ; Brevo, société française, données dans l'UE (décision Q18) |
| Frontend | React, React Router, TanStack Query | ^19.3.1, ^7.18.4, ^5.104.5 | Écosystème répandu, cache d'API (ADR 0022) |
| Outillage frontend | Vite, Tailwind CSS | ^8.3.4, ^4.3.3 | Compilation rapide, thèmes clair et sombre |
| Serveur web | nginx (image non privilégiée) | `nginxinc/nginx-unprivileged:1.27-alpine` | Fichiers statiques, relais `/api`, en-têtes de sécurité et CSP |
| Tests | Vitest, Supertest, Playwright, axe-core | ^5.0.5, ^7.3.1, ^1.64.1, ^4.14.0 | Rapides, TypeScript natif, vrai navigateur, accessibilité |
| Tests avancés | Stryker (mutation), fast-check (propriétés) | `stryker.config.json` par service | Mesurer la force des tests (ADR 0046) |
| Qualité | ESLint, typescript-eslint, Prettier | ^10.12.0, ^8.71.2, ^3.9.10 | Code homogène ; commits conventionnels vérifiés en CI |
| Conteneurs | Docker, Docker Compose | profils `core`, `full`, `veille`, `tei` | Pile lancée en une commande, identique pour l'équipe, la CI et le jury (ADR 0021) |
| CI/CD | GitHub Actions, gitleaks, Trivy, Terraform | `.github/workflows/*.yml` | Contrôles par service, sécurité de la chaîne, infrastructure en code |

**Alternatives écartées**, telles qu'elles sont documentées :

- **API Anthropic directe en production** : pas d'ancrage dans l'UE ; elle reste possible en développement
  (`LLM_PROVIDER=anthropic`).
- **pg-boss** pour les tâches de fond : remplacé par des minuteurs dans chaque service et un verrou en base
  (ADR 0009, puis ADR 0021).
- **Jest** : Vitest a été retenu ; une bascule ne serait faite que sur exigence de l'enseignant (`TASKS.md`).
- **Antivirus sur l'import** : jugé inutile, car le PDF n'est ni stocké ni servi et sa lecture est isolée
  (décision Q13).

# Réalisation

Ce chapitre présente chaque module, avec de courts extraits du code réel. Le chemin du fichier est indiqué
en commentaire de chaque extrait.

## Socle commun (`packages/`)

Chaque service démarre avec la même base : validation de la configuration (`@attesta/config`), journal
structuré (`@attesta/logger`), application Express durcie, erreurs normalisées et sondes de santé
(`@attesta/http-kit`). Le vérificateur de jetons met en cache les clés publiques d'`auth` et les recharge
quand une clé inconnue apparaît (rotation), au plus une fois toutes les 30 secondes :

```ts
// packages/http-kit/src/auth.ts
export function createJwksVerifier(jwksUrl: string, options: VerifierOptions): TokenVerifier {
  const keys = createRemoteJWKSet(new URL(jwksUrl), { cooldownDuration: 30_000, timeoutDuration: 5_000 });
  return createVerifier(keys, options);   // RS256 seul, émetteur "attesta-auth", audience contrôlée
}

/** Jeton de service portant la portée demandée (`users:delete`, `matching:run`…). */
export function requireScope(scope: string) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const principal = principalOf(res);
    next(principal.role === "service" && principal.scope.includes(scope) ? undefined : forbidden());
  };
}
```

## Service `auth`

**Fonctions** : comptes par identifiant et mot de passe (sans e-mail, ADR 0030), codes de récupération
(ADR 0039), session invitée, ancien lien de connexion, consentements, export et suppression RGPD, jetons de
service, statistiques pour l'administration.

**Mots de passe.** L'empreinte est calculée par scrypt (N = 2^15, r = 8, p = 1), après normalisation NFKC
(`services/auth/src/passwords.ts`). Pour un identifiant inconnu, le même calcul est fait sur une empreinte
leurre ; un plafond d'échecs par identifiant s'ajoute au quota par IP de la gateway.

```ts
// services/auth/src/routes.ts : connexion par mot de passe
const found = await store.credentials(username);
// Identifiant inconnu : même calcul qu'un vrai échec, pour ne pas révéler quels comptes existent.
const ok = await verifyPassword(password, found?.passwordHash ?? (await decoyHash()));
const user = found && ok ? await store.recordLogin(found.user.id, roleOf(username)) : undefined;
if (!user) {
  failures.set(key, [...recentFailures(key), Date.now()]);
  throw unauthorized("Identifiant ou mot de passe incorrect.");
}
```

**Jetons.** Durées définies dans `services/auth/src/keys.ts` : jeton d'accès de 15 minutes, jeton d'invité de
2 heures (identité invitée limitée à 24 heures). La rotation du refresh token et la détection de réutilisation
sont décrites au chapitre précédent.

**RGPD distribué** (`services/auth/src/rgpd.ts`). L'export interroge chaque service avec un jeton
`users:export`. Si un service ne répond pas, l'export échoue avec un message clair, plutôt que de livrer une
archive incomplète. La suppression passe par l'*outbox* :

```ts
// services/auth/src/rgpd.ts
for (const row of due) {
  const client = clients.get(row.target);
  try {
    if (client) {
      const token = await signer.serviceToken("auth", row.target, "users:delete");
      await client.json("DELETE", `/internal/v1/users/${row.userId}`, { token, accept: [200, 204, 404] });
    }
    await store.outboxDone(row.id);                       // 404 = déjà supprimé : idempotent
  } catch (error) {
    const giveUp = row.ageMs > GIVE_UP_MS;                // 24 h de reprises, puis alerte
    await store.outboxFailed(row.id, row.attempts, reason, giveUp);
  }
}
```

## Service `profiles`

**Profil versionné.** Chaque enregistrement crée une nouvelle ligne `profile_version`, validée par le schéma
`Profile`. Les CV générés gardent l'instantané de la version utilisée.

**Import d'un CV PDF.** Le texte est extrait dans un **processus enfant** lancé avec un environnement vide
(aucun secret transmis). Mémoire et temps CPU sont plafonnés par `prlimit` quand il est disponible, et un
délai global s'applique :

```ts
// services/profiles/src/extraction.ts
// Environnement vide : aucun secret (DATABASE_URL, clés…) n'est transmis.
const child = spawn(command, args, { env: {}, stdio: ["pipe", "pipe", "ignore"] });
const timer = setTimeout(() => settle(() =>
  reject(new PdfImportError("Ce PDF est trop long à analyser. Saisissez votre profil à la main."))), timeoutMs);
```

L'extraction structurée est ensuite faite par Claude, ou **par règles** sans IA (`import-rules.ts`,
ADR 0038) : rubriques en français, anglais et allemand, dates, puces, coordonnées. Dans les deux cas, chaque
élément proposé doit figurer dans le texte du PDF (`groundExtraction`), et rien n'est enregistré sans la
relecture du candidat.

**Justificatifs et photo** (ADR 0027 et 0036). Les fichiers sont chiffrés par le service avant d'être écrits
en base :

```ts
// services/profiles/src/evidence.ts
/** AES-256-GCM : vecteur d'initialisation aléatoire par fichier, étiquette d'authenticité vérifiée. */
export function encrypt(key: Buffer, plain: Uint8Array) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const content = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), content };
}
```

Un justificatif est **ancré** au libellé de l'élément du profil au moment du dépôt (`evidenceAnchor`) : si
l'expérience est renommée, la pièce cesse de la justifier.

**Intervieweuse de profil** (`assistant.ts`). Elle pose des questions sur les réalisations floues et propose
des faits chiffrés ; rien n'entre dans le profil sans la coche du candidat.

## Service `cv-generation`

C'est le cœur fonctionnel. Le **pipeline** (`src/pipeline.ts`) enchaîne quatre étapes :

1. **Analyse de l'offre** : déjà faite par `jobs-matching` à l'enregistrement de l'offre ; calcul des
   mots-clés absents du profil.
2. **Rédaction** : le modèle reçoit l'offre analysée, les faits du profil et la trame du parcours, et répond
   selon le schéma `DraftOutput`.
3. **Assemblage et validation** : `assemble()` recopie depuis le profil tout ce qui est factuel et complète ce
   que le modèle aurait omis. Le résultat doit passer `TailoredCv.safeParse`, sinon une relance bornée est
   faite avec la liste des écarts.
4. **Contrôle de fidélité** déterministe.

```ts
// services/cv-generation/src/pipeline.ts : relance bornée
for (let attempt = 1; attempt <= 1 + MAX_SCHEMA_RETRIES; attempt++) {
  if (attempt > 1) guardBudget();                         // plafond de coût par CV
  const result = await deps.provider.generate({
    step: "redaction", system: prompts.system("redaction"), messages,
    schema: DraftOutput, effort: "medium", maxTokens: 16000, /* … */
  });
  const parsed = TailoredCv.safeParse(assemble(result.data, profile, missing));
  if (parsed.success) return parsed.data;
  // Le modèle reçoit sa réponse et la liste exacte des écarts au contrat.
  messages.push({ role: "assistant", content: JSON.stringify(result.data) },
                { role: "user", content: `Ta réponse ne respecte pas le contrat. … ${z.prettifyError(parsed.error)}` });
}
```

Toute panne aboutit à un **mode dégradé** explicite (`indisponible`, `refus`, `budget`, `non-conforme`), jamais
à une sortie non validée.

**Contrôle de fidélité** (`src/faithfulness.ts`). Pour chaque ligne, le code vérifie que :

- chaque pointeur se résout dans le profil et appartient bien à l'entrée concernée (`unresolved-source`,
  `foreign-source`) ;
- chaque nombre ou année figure dans les sources (`number`, `date`), y compris les nombres écrits en lettres
  en français, anglais et allemand ;
- aucune entité ni compétence absente des sources n'apparaît (`entity`, `skill`), en particulier les
  mots-clés de l'offre manquants dans le profil.

Le texte est d'abord normalisé (minuscules, sans accents, alias comme `k8s` pour `kubernetes`), et les
caractères invisibles sont retirés pour qu'on ne puisse pas couper un mot afin d'échapper au contrôle.

```ts
// services/cv-generation/src/faithfulness.ts (extrait de checkLine)
for (const [i, sourceText] of sourceTexts.entries()) {
  const pointer = line.sources[i]!;
  if (sourceText === undefined) issues.push({ kind: "unresolved-source", value: pointer });
  else if (entryRef && !pointer.startsWith(`${entryRef}/`))
    issues.push({ kind: "foreign-source", value: pointer });
}
for (const n of new Set(numbers(text))) {
  if (!sourceNumbers.has(n)) issues.push({ kind: /^(19|20)\d\d$/.test(n) ? "date" : "number", value: n });
}
for (const keyword of new Set([...ctx.missingKeywords, ...ctx.guardTerms])) {
  if (contains(normalizedLine, keyword)) issues.push({ kind: "skill", value: keyword });
}
```

Le code documente lui-même la **limite** de ce contrôle : un verbe gonflé (« a participé » devenu « a
dirigé ») sans entité nouvelle peut passer. D'où la relecture humaine obligatoire et le **juge de fidélité**.

**Assistants** (`src/assistants.ts`) et leurs garde-fous :

| Assistant | Garde-fou vérifié par le code |
|---|---|
| Juge de fidélité (`judgeFidelity`) | Relit le sens ; une reformulation proposée n'est gardée que si elle passe le contrôle de fidélité ; jeu d'évaluation `evals/juge-fidelite.json` (`npm run eval:juge`, précision et rappel) |
| Conseillère ATS (`atsAdvice`, `atsProposal`) | Le statut de chaque mot-clé est calculé par le code ; seul un fait du profil est recopié, avec sa source |
| Traduction (`translateCv`) | `translationIssue` refuse une traduction qui modifie un nombre ou perd un nom propre du profil |
| Coach d'entretien (`interviewPrep`, `interviewFeedback`) | Les extraits cités doivent figurer mot pour mot dans la réponse du candidat |
| Plan de progression (`learningPlan`) | Liens tirés d'un catalogue officiel tenu dans `src/resources.ts` ; le modèle n'écrit jamais d'URL |

```ts
// services/cv-generation/src/assistants.ts
export function translationIssue(profile: Profile, source: string, text: string): string | null {
  if (numbers(text).join("|") !== numbers(source).join("|"))
    return "Les chiffres doivent rester ceux de l'original.";
  const lost = properNouns(profile).find((n) => has(source, n) && !has(text, n));
  return lost ? `« ${lost} » doit rester tel quel.` : null;
}
```

**Maîtrise des coûts.** Quota quotidien par utilisateur (sujet haché en HMAC), coût maximal par CV
(`MAX_COST_PER_CV_USD`), budget mensuel par service appliqué par `BudgetedProvider` dans `llm-client`, et
modèle choisi par étape (`LLM_STEP_MODELS`).

## Service `jobs-matching`

**Offres des candidats.** Le texte collé (50 à 20 000 caractères), traité comme une donnée et jamais comme
une instruction, est analysé une seule fois : titre, entreprise, langue, exigences indispensables et
souhaitées, mots-clés pondérés.

**Catalogue synchronisé** (`src/catalogue.ts`, ADR 0034). Une collecte est lancée toutes les
`CATALOGUE_SYNC_HOURS` heures (6 par défaut) auprès de sept sources. Aucune page n'est « scrapée » : seulement
des API publiques ou sous contrat et des flux RSS.

| Source | Fichier | Pays | Clé |
|---|---|---|---|
| Bundesagentur für Arbeit | `sources/ba.ts` | DE | non |
| Arbeitnow | `sources/arbeitnow.ts` | DE | non |
| Sites carrière (Greenhouse, Lever, SmartRecruiters ; `data/employeurs.json`) | `sources/employers.ts` | DE, FR, CA, TN | non |
| Flux RSS Tanitjobs et Tunisie Travail | `sources/rss.ts` | TN | non |
| Jooble | `sources/jooble.ts` | DE, FR, CA, TN | `JOOBLE_API_KEY` |
| Adzuna | `sources/adzuna.ts` | DE, FR, CA | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |

Les offres sont normalisées, dédoublonnées par empreinte et indexées en plein texte selon leur langue. Elles
sont aussi vectorisées (BGE-M3 par TEI, ou vecteur de hachage en développement), puis purgées après 60 jours.

**Classement hybride** (`src/matching.ts`, `src/ranking.ts`). Deux listes, plein texte et similarité
vectorielle, sont fusionnées par **rangs réciproques** (RRF). On obtient ensuite le score de localisation, la
couverture des compétences et, si une clé IA est configurée, un reclassement du top 20 par Claude. Le profil
transmis au classement est anonymisé (`anonymize.ts`).

```ts
// services/jobs-matching/src/ranking.ts
/** Fusion par rangs réciproques : score(d) = Σ 1 / (k + rang de d dans la liste). */
export function reciprocalRankFusion(lists: string[][], k = RRF_K /* 60 */) {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1)));
  }
  // Arrondi à 1e-12 : deux sommes égales en théorie peuvent différer d'un bit selon l'ordre des listes.
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score: Math.round(score * 1e12) / 1e12 }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
```

Les intitulés de métiers sont étendus par le référentiel européen **ESCO** (cache de 30 jours) ; les villes
viennent de **GeoNames**.

## Service `job-watch`

**Abonnement.** De 1 à 5 métiers, un pays, une ville résolue par `jobs-matching` et un rayon. Toute adresse
de réception saisie est confirmée par **double opt-in**. Chaque e-mail porte un désabonnement en un clic
(RFC 8058).

**Exécution quotidienne** (`src/daily.ts`). Elle s'exécute à `DAILY_RUN_HOUR` (7 h par défaut), sous verrou
(`withRunLock`) :

1. collecte du jour ;
2. pour chaque abonné : contact (`auth`), profil (`profiles`) et classement (`jobs-matching`), en excluant
   les offres déjà envoyées ;
3. production de deux rapports PDF (`letters-export`) : les offres, et les compétences à acquérir avec une
   priorité calculée ;
4. envoi d'un seul e-mail.

Trois mécanismes rendent une relance sûre : la réservation `claimDelivery`, l'unicité
`(subscription_id, run_date)` et la libération de la réservation si l'envoi a certainement échoué. Il n'y a
jamais d'e-mail vide.

**Rappels** (`src/reminders.ts`). Les étapes du plan de progression et les relances de candidature sont
vérifiées toutes les 15 minutes ; un compte a au plus 20 rappels en attente.

**Retours du fournisseur.** Le webhook Brevo, authentifié par son propre secret, enregistre plaintes, rebonds
et désabonnements sans adresse.

## Service `letters-export`

**Rendu PDF** (`src/render/pdf.ts`). Le CV est rendu en HTML par un gabarit EJS et des feuilles de style
(`templates/*.css`), puis imprimé par Chromium (Puppeteer). Le nombre de rendus simultanés est borné
(`PDF_MAX_CONCURRENCY`), comme leur durée (`PDF_TIMEOUT_MS`). Le PDF est balisé pour l'accessibilité et les
ATS :

```ts
// services/letters-export/src/render/pdf.ts
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
return page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, tagged: true });
```

Dans `compose.yaml`, le conteneur s'exécute avec un système de fichiers en lecture seule, sans capacités
Linux, et avec un profil **seccomp** dédié à Chromium (`infra/seccomp/chromium.json`).

**Usages par pays** (`src/render/norms.ts`, ADR 0036). Ce que le candidat a saisi n'est jamais modifié : on
choisit seulement ce qui figure dans le document.

```ts
// services/letters-export/src/render/norms.ts (extrait)
export const NORMS: Record<CvNorms, NormRules> = {
  DE: { photo: true,  birthDate: true,  nationality: true,  workPermit: true, drivingLicence: true, signature: true  },
  FR: { photo: true,  birthDate: false, nationality: false, workPermit: true, drivingLicence: true, signature: false },
  CA: { photo: false, birthDate: false, nationality: false, /* … */ },
  // TN : photo, date de naissance, nationalité et permis
};
```

**Cinq modèles** (ADR 0041) : Sobre, Soignée, Classique, Moderne et Compacte, tous en une colonne.

**Export Word** (`src/render/docx.ts`, ADR 0037). Le fichier `.docx` est une archive ZIP de fichiers XML
(Office Open XML), écrite **sans dépendance** grâce à `node:zlib`. Il reprend le même modèle de vue que le PDF.

**Annexes.** Les justificatifs choisis sont déchiffrés par `profiles` puis fusionnés en annexe (`annex.ts`,
pdf-lib).

**Lettres de motivation.** Trois tons sont proposés (sobre, chaleureux, dynamique). Chaque paragraphe cite ses
faits et passe le contrôle de fidélité de `cv-generation` (`/internal/v1/generations/:id/check`).

**CV en ligne** (ADR 0042). Un instantané HTML est servi par un lien secret (seule l'empreinte du jeton est
stockée). Le lien est non indexé, révocable et valable 90 jours, avec un compteur de consultations.

**Suivi des candidatures** (ADR 0040). Six statuts sont prévus, avec une relance suggérée après 10 jours.

## Gateway

En plus de la garde présentée au chapitre « Conception », la gateway applique les quotas configurables
(`RATE_LIMIT_*`), dont un plafond plus strict sur la création de compte, la connexion et la récupération. Elle
agrège la santé des services pour l'administration et réécrit les chemins dans son journal : jetons et
identifiants y sont remplacés par `:jeton` et `:id` (`normalizeRoute`).

## Frontend React

**Structure** (`frontend/src`) :

- `api/client.ts` : seul module qui appelle `fetch` ;
- `api/endpoints.ts` : un objet par service ;
- `api/sse.ts` : lecture du flux de génération ;
- `auth/` : session et gardes de routes (`RequireSession`, `RequireAccount`, `RequireAdmin`) ;
- `pages/` : environ vingt écrans, dont le Studio IA (`pages/studio/`) ;
- `components/` : mise en page, notifications, composants d'interface.

**Gestion d'état.** TanStack Query met en cache les réponses de l'API. La session est un contexte React. Le
jeton d'accès reste **en mémoire**, jamais dans le stockage du navigateur. Sur une réponse 401, un seul
rafraîchissement est lancé, puis la requête est rejouée :

```ts
// frontend/src/api/client.ts (commentaire d'en-tête)
/**
 * Seul module qui appelle `fetch` (ADR 0022, point 1). Le jeton d'accès vit en mémoire, jamais dans le
 * stockage du navigateur ; le refresh token est un cookie HttpOnly que JavaScript ne voit pas. Sur un 401,
 * un seul rafraîchissement est lancé (requêtes concurrentes regroupées), puis la requête est rejouée.
 */
```

Les gardes de routes ne sont « qu'un confort d'affichage » : la gateway et les services revérifient tout
(`auth/guards.tsx`).

**Navigation** (`App.tsx`) :

| Accès | Routes |
|---|---|
| Public | `/`, `/connexion`, `/guide`, `/exemples-cv`, `/exemples-cv/:slug`, `/tarifs`, `/confidentialite`, `/veille/confirmer/:token`, `/veille/desabonner/:token`, `/cv-en-ligne/:token` |
| Session, invité admis (`RequireSession`) | `/cv/etape/:step`, `/mes-cv`, `/mes-cv/:id`, `/offres`, `/offres/collectees`, `/assistants`, `/assistants/profil`, `/studio/:id/:assistant?` |
| Compte (`RequireAccount`) | `/lettres`, `/lettres/:id`, `/justificatifs`, `/veille`, `/candidatures`, `/compte` |
| Admin (`RequireAdmin`) | `/admin` |

L'API des lettres accepte aussi un invité (`letters-export`, rôle `guest` admis), mais l'interface réserve
l'écran des lettres aux comptes.

## Extension de navigateur

Le dossier `extension/` contient une extension Chrome Manifest V3 (`manifest.json`, `popup.html`,
`popup.js`). Elle demande seulement les permissions `activeTab`, `scripting` et `storage` et envoie l'offre de
la page affichée vers Attesta (ADR 0044). Elle n'est pas publiée sur les boutiques.

# Sécurité

## Authentification

| Mécanisme | Détail | Source |
|---|---|---|
| Mots de passe | scrypt (N = 2^15, r = 8, p = 1), sel aléatoire, comparaison en temps constant, empreinte leurre pour un identifiant inconnu | `services/auth/src/passwords.ts`, `routes.ts` |
| Jetons d'accès | JWT RS256 signés par `auth`, 15 minutes (2 heures pour un invité) ; aucune donnée personnelle dans le jeton (pas d'e-mail) ; `kid` pour la rotation des clés | `keys.ts`, `http-kit/src/auth.ts` |
| Vérification | Chaque service et la gateway vérifient signature, `exp`, `iss`, `aud` et algorithme (RS256 seul) par JWKS | `createJwksVerifier` |
| Renouvellement | Refresh token opaque en cookie HttpOnly, haché en base, tourné à chaque usage ; réutilisation = révocation de la famille ; 7 jours d'inactivité, 30 jours au plus | migration `1761000000000_auth.sql` |
| Anti-CSRF | En-tête `X-Attesta-Csrf: 1` exigé sur les routes à cookie ; aucune CORS, requêtes `OPTIONS` refusées à la gateway | `auth/src/routes.ts`, `gateway/src/app.ts` |
| Récupération | 8 codes à usage unique, empreinte seule, régénérables | ADR 0039 |
| Force brute | Quotas par IP à la gateway (connexion, création de compte, récupération), plafond d'échecs par identifiant dans `auth` | `gateway/src/app.ts` |

## Autorisations

- **Quatre rôles** (`candidate`, `admin`, `guest`, `service`) dans la revendication `role`.
- **Gateway** : liste blanche explicite des routes publiques, tout le reste exige un jeton ; `/v1/admin/*`
  réservé aux administrateurs ; un jeton de service est refusé ; `/internal/*` jamais routé.
- **Services** : `requireRole`, `requireAccount` et `requireScope` sur chaque route ; chaque requête de données
  est filtrée par le `sub` du jeton (`me(res)`), et une ressource d'autrui répond 404.
- **Jetons de service** : couples audience et portée autorisés listés dans `SERVICE_GRANTS` ; secret vérifié en
  temps constant.
- Les comptes administrateurs sont créés au démarrage. Leurs identifiants sont **réservés** : impossible de
  créer un compte `admin` par l'inscription.

## Validation des entrées

Chaque corps, paramètre et chaîne de requête est validé par un schéma Zod (`parseInput`), avec des bornes
explicites : longueurs, nombre d'éléments, formats de date et d'URL. La base double ces contraintes par des
`CHECK` (formats d'identifiant, énumérations, tailles de fichiers). Les fichiers déposés sont limités par
type MIME et par taille (justificatifs : 5 Mo ; photo : 2 Mo ; import : 10 Mo à la gateway). Le texte d'une
offre est **traité comme une donnée, jamais comme une instruction** : il est transmis au modèle dans un bloc
de données (`dataBlock`), ce qui limite l'injection d'instructions.

## Secrets

- Seuls les fichiers `.env.example` sont versionnés ; les secrets sont fournis par l'environnement.
- Chaque service valide sa configuration au démarrage (`@attesta/config`).
- `gitleaks` analyse tout l'historique en CI.
- Les mots de passe des rôles PostgreSQL locaux sont dérivés d'un suffixe réservé au poste de développement ;
  hors poste local, ils relèvent de l'hébergeur (`infra/postgres/init.sql`).
- Le processus de lecture des PDF reçoit un environnement vide.
- La liste des **noms** de variables figure en annexe ; aucune valeur n'est reproduite dans ce rapport.

## Protection des données personnelles

| Mesure | Mise en œuvre |
|---|---|
| Minimisation | Comptes sans e-mail ; jeton sans donnée personnelle ; profil transmis anonymisé au classement des offres |
| IA | Photo et informations personnelles (date de naissance, nationalité…) jamais envoyées au modèle |
| Chiffrement | Justificatifs et photo en AES-256-GCM, avec un vecteur d'initialisation par fichier |
| Empreintes | Jetons de connexion, de partage, de confirmation et codes de récupération stockés hachés ; IP hachées (HMAC) dans les consentements |
| Journaux | Ni corps, ni chaîne de requête, ni identité ; routes normalisées (`:id`, `:jeton`) ; contrôle en CI « aucune donnée saisie dans les journaux » |
| Conservation | Invités 24 h ; offres collectées 60 jours ; usage IA, avis, audit et événements e-mail 13 mois ; comptes inactifs 18 mois (`auth/src/store.ts`) |
| Droits | Export JSON agrégé de tous les services ; suppression propagée par outbox ; consentements journalisés avec la version du texte |
| Navigateur | CSP stricte (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP (`frontend/security-headers.conf`) |
| Conteneurs | Utilisateur non root, système de fichiers en lecture seule, `cap_drop: ALL`, `no-new-privileges`, seccomp pour Chromium ; npm retiré des images |

**Écart relevé.** La décision Q2 (`docs/questions.md`) prévoyait une purge des comptes après 12 mois
d'inactivité. Le code applique 18 mois (`interval '18 months'`). [À CONFIRMER : laquelle des deux durées fait
foi ; la documentation de conformité (`docs/conformite.md`) devra concorder.]

**Point juridique ouvert.** Le classement éventuel du traitement au regard du règlement européen sur l'IA est
noté comme une hypothèse non vérifiée dans `docs/questions.md`. Il doit être confirmé par une source juridique.

# Tests et qualité

## Stratégie

| Niveau | Outils | Contenu |
|---|---|---|
| Unitaires | Vitest | Contrôle de fidélité, classement RRF, usages par pays, import par règles, mots de passe, configuration |
| Propriétés | fast-check | Invariants de domaine : 22 propriétés réparties dans six suites |
| Intégration | Vitest, Supertest, PostgreSQL jetable | Chaque suite crée puis supprime sa propre base ; routes, erreurs, rôles |
| Contrat | `tests/openapi.test.ts` | L'OpenAPI publié correspond aux schémas Zod |
| Inter-services | `tests/upstreams.test.ts` | Appels `/internal`, jetons relayés, erreurs amont |
| IA | `ScriptedProvider` | Réponses valides, invalides, refus, pannes, relances, sans réseau |
| Évaluation | `evals/juge-fidelite.json`, `npm run eval:juge` | Précision et rappel du juge de fidélité |
| Mutation | Stryker (`stryker.config.json` par service, `mutation.yml`) | Force des tests (ADR 0046) |
| Bout en bout | Playwright | `e2e/parite` (17 cas : parité de la migration), `e2e/frontend` (recette, 13 récits utilisateur) |
| Accessibilité | @axe-core/playwright | Contrôle automatique sur plusieurs pages |

Dans le code, on compte des déclarations de tests dans chaque unité : `auth` 59, `profiles` 40,
`cv-generation` 69, `jobs-matching` 71, `job-watch` 46, `letters-export` 41, `gateway` 17, `frontend` 25,
paquets partagés 80. Ces chiffres sont obtenus par comptage statique des `it(` et `test(` ; un test de
propriétés génère en plus de nombreux cas.

## Résultats de la dernière campagne

Les résultats ci-dessous sont repris de `docs/rapport-campagne-tests.md` (26 octobre 2026). Ils n'ont pas été
réexécutés pour ce rapport.

| Cible | Résultat |
|---|---|
| `frontend` : `npm test` | 4 fichiers, **25/25 réussis** |
| Six suites de propriétés des services | **332/332 réussis** (auth 22, profiles 109, jobs-matching 30, cv-generation 144, letters-export 13, job-watch 14) |
| `services/auth` : couverture | 86/86 tests ; **92,30 % des lignes**, 80,66 % des branches, 92,12 % des fonctions |
| `services/auth` : mutation (`passwords.ts`) | 88 mutants : 82 tués, 3 survivants, 3 expirations ; **score de 93,2 %** |
| `npm test` à la racine (monolithe) | 234 réussis, **4 échoués** (délais Puppeteer et Chromium sous Windows), 40 ignorés |
| Recette E2E (13 scénarios) et parité | **Non exécutées** pendant cette campagne (pile complète requise) |

| Fonction mutée (`passwords.ts`) | Tués | Survivants | Expirations | Score |
|---|---:|---:|---:|---:|
| `derive` | 8 | 0 | 0 | 100 % |
| `hashPassword` | 6 | 0 | 0 | 100 % |
| `validParams` | 36 | 2 | 3 | 87,8 % |
| `verifyPassword` | 28 | 1 | 0 | 96,6 % |
| `decoyHash` | 3 | 0 | 0 | 100 % |

**Lecture critique.** Cette campagne est **partielle**. Les nouvelles preuves sont solides pour le frontend,
les propriétés et l'authentification. En revanche, la couverture globale n'est pas certifiée, les échecs de
délai Chromium restent à résoudre et la suite E2E n'a pas été observée en vert sur la pile microservices. Le
README le reconnaît : les tests sont en retard sur les dernières fonctionnalités.

## Qualité du code

- TypeScript strict partout, imports NodeNext avec l'extension `.js`.
- ESLint (`eslint.config.js`) et Prettier, vérifiés en CI ; commits conventionnels vérifiés en CI.
- 46 ADR documentent les décisions (`docs/adr/README.md`). Les ADR 0001 à 0025 sont acceptés ou remplacés ;
  les ADR 0026 à 0046 ont le statut « proposé » et ne sont pas encore commités.
- Prompts versionnés par étape (`services/*/prompts/<étape>/vN.md`, avec un `CHANGELOG.md`) ; la version du
  prompt est enregistrée avec chaque génération (`pipeline_version`, `prompt_version`).

# Déploiement

## Infrastructure locale (effective)

![Diagramme de déploiement](diagrammes/10-deploiement.png)

La pile est décrite par `compose.yaml`, en quatre profils :

| Profil | Contenu |
|---|---|
| `core` | Base, initialisation, Mailpit, frontend, gateway, `auth`, `profiles`, `cv-generation`, `jobs-matching`, `letters-export`, migrations et monolithe `web` |
| `full` | `core` plus `job-watch` |
| `veille` | Processus de veille du monolithe |
| `tei` | Serveur de vecteurs BGE-M3 (facultatif) |

Le service `db-init` exécute `infra/postgres/init.sql` à chaque démarrage. Ce script, idempotent, crée
**sept bases et sept rôles cloisonnés** : les six des services et `attesta_web`, celle de l'ancien monolithe.
Chaque service applique ses migrations au démarrage (`MIGRATE_ON_START`) et expose une sonde utilisée par
le `HEALTHCHECK` Docker. Les images sont construites en deux étapes : `node:22-bookworm-slim`, puis une
exécution sous l'utilisateur `node`.

**État constaté le 26 octobre 2026** : la pile tournait sur le poste, avec les six services, la gateway, le
frontend, la base et Mailpit à l'état `healthy`. Le frontend était publié sur le port 8081.

## Procédure d'installation pas à pas

Procédure tirée du README et de `CLAUDE.md`. Elle a été vérifiée sur le poste par l'état de la pile en
fonctionnement et par la connexion aux comptes de démonstration. Une reconstruction complète depuis zéro
n'a pas été rejouée pour ce rapport.

1. **Prérequis** : Docker (avec Compose) et Node.js 22.

   ```bash
   nvm use 22.18.0
   node -v          # doit afficher v22.18.0
   ```

2. **Récupérer le dépôt et installer les dépendances de la racine** :

   ```bash
   git clone <dépôt> attesta && cd attesta
   npm install
   ```

3. **Démarrer la pile complète** (bases, Mailpit, six services, gateway, frontend) :

   ```bash
   FRONTEND_PORT=8081 docker compose --profile full up -d --build --wait \
     db db-init mailpit auth profiles cv-generation jobs-matching job-watch letters-export gateway frontend
   ```

4. **Charger les données de démonstration** (cinq candidats fictifs et un administrateur ; les identifiants
   sont dans le README, pour un usage local seulement) :

   ```bash
   DEMO_API=http://localhost:8081 npm run demo:seed
   ```

5. **Ouvrir l'application** : `http://localhost:8081` ; e-mails envoyés en local : `http://localhost:8025`
   (Mailpit) ; API : `http://localhost:4000`.

6. **Facultatif** :
   - IA réelle : `LLM_PROVIDER=anthropic` avec une clé, ou `LLM_PROVIDER=vertex` avec un projet. Le README
     signale que `compose.yaml` ne transmet pas encore la clé aux services.
   - Envoi réel des e-mails : fichier `.env.smtp` non versionné, puis `npm run smtp:test`.
   - Extension : `chrome://extensions`, mode développeur, « Charger l'extension non empaquetée », dossier
     `extension/`.

7. **Développer un seul service** :

   ```bash
   cd services/cv-generation && npm ci && npm run typecheck && npm test
   npm run openapi        # régénère openapi.yaml après un changement de contrat
   ```

## Intégration continue (`.github/workflows/ci.yml`)

À chaque PR et à chaque push sur `main` :

| Tâche | Contenu |
|---|---|
| `qualite` | Lint, typage, paquets partagés compilés à jour, migrations en montée, descente et remontée, `npm audit` (niveau élevé), tests des scripts de déploiement |
| `unites` puis `tests` | Liste des unités touchées, puis tests en **matrice** par unité, avec une base PostgreSQL de service |
| `secrets` | gitleaks sur tout l'historique |
| `infra` | `terraform validate` (infrastructure gelée) |
| `commits` | Commits conventionnels |
| `e2e` | Parité et accessibilité |
| `image` | Pile compose, cloisonnement des bases, Trivy (vulnérabilités critiques et hautes corrigeables), parité complète avec Mailpit, absence de données saisies dans les journaux |

Les actions sont épinglées par empreinte de commit. Le workflow `mutation.yml` lance Stryker et `labels.yml`
synchronise les étiquettes. **Limite** : la CI est encore en partie tournée vers l'ancien monolithe (image
`web`, parité sur le port 3080), et aucune exécution réussie de GitHub Actions n'est attestée dans le dépôt.

## Déploiement cible (écrit, gelé)

`infra/terraform/` (environnements `preprod` et `prod`), `cd.yml`, `rollback.yml` et `infra/deploy/*.sh`
décrivent un déploiement sur **Google Cloud, région `europe-west9` (Paris)** :

- Cloud Run, Cloud SQL, Secret Manager, Artifact Registry ;
- Vertex AI pour Claude dans l'UE ;
- image construite une seule fois, préproduction, puis production par paliers (10, 50 et 100 %) après
  approbation, et retour arrière.

Ce déploiement est **gelé** par l'ADR 0021 (« hors périmètre de la soutenance ») tant que l'identité GCP
(`GCP_WIF_PROVIDER`) n'est pas configurée. [À CONFIRMER : aucun autre hébergement n'est mentionné dans le
dépôt.]

# Guide d'utilisation par rôle

Les captures ont été prises sur la pile locale, avec les comptes de démonstration (données fictives) et l'IA
en **mode démonstration** : les réponses sont calculées par le code et signalées comme telles dans
l'interface.

## Visiteur

Le visiteur arrive sur l'accueil, qui présente le principe et une comparaison avant-après d'un CV. Il peut
consulter le guide, les exemples de CV par métier, les tarifs et la politique de confidentialité, puis créer
un compte ou continuer en invité.

![Page d'accueil](captures/01-accueil.png)

![Exemples de CV par métier](captures/02-exemples-cv.png)

![Tarifs (gratuité de lancement)](captures/03-tarifs.png)

![Connexion et création de compte](captures/04-connexion.png)

À la création du compte, l'utilisateur choisit un identifiant et un mot de passe. Huit codes de
récupération lui sont remis **une seule fois** : il doit les conserver.

## Candidat (et invité)

1. **Créer un CV** : l'assistant en quatre étapes (profil, expériences et formations, offre visée,
   génération). Le candidat peut importer un CV PDF ; chaque élément proposé est vérifié dans le fichier et
   doit être relu.

   ![Étape 1 : profil et import d'un CV PDF](captures/05-profil-etape1.png)

   ![Étape 2 : expériences et formations](captures/06-profil-etape2.png)

2. **Ajouter une offre** : coller l'annonce, ou choisir une offre du catalogue, filtrable par pays et par
   mots-clés.

   ![Mes offres](captures/07-offres.png)

   ![Catalogue d'offres collectées dans quatre pays](captures/08-catalogue-offres.png)

3. **Générer et relire** : la progression s'affiche en direct. Le CV indique son score de fidélité, les
   lignes justifiées et les mots-clés de l'offre absents du profil (signalés, jamais ajoutés). Le candidat
   relit, corrige si besoin, puis choisit le modèle, le pays, la langue et l'export (PDF ou Word).

   ![Mes CV](captures/09-mes-cv.png)

   ![Relecture d'un CV ciblé : fidélité, juge, ATS, entretien](captures/10-cv-relecture.png)

4. **Studio IA** : six assistants autour du CV, avec le CV en direct à droite.

   ![Studio IA : juge de fidélité](captures/11-studio-ia.png)

   ![Centre des assistants](captures/12-assistants.png)

5. **Compte uniquement** : lettres de motivation, suivi des candidatures, justificatifs, veille emploi et
   gestion du compte (mot de passe, codes, consentements, export et suppression des données).

   ![Lettres de motivation](captures/13-lettres.png)

   ![Suivi des candidatures](captures/14-candidatures.png)

   ![Pièces justificatives](captures/15-justificatifs.png)

   ![Veille emploi](captures/16-veille.png)

   ![Mon compte : sécurité et données](captures/17-compte.png)

**Invité** : il dispose du parcours CV (profil, offre, génération, export, assistants) sans compte. Ses
données sont effacées sous 24 heures ; les écrans réservés aux comptes le renvoient vers la connexion.

## Administrateur

L'administrateur voit en plus l'onglet **Administration** : santé des six services (rafraîchie toutes les
30 secondes), statistiques des comptes, usage et budget de l'IA par service, avis sur les assistants,
exécutions de la veille. Il peut lancer la veille et la synchronisation du catalogue. Aucune donnée
personnelle n'est affichée.

![Tableau de bord d'administration](captures/18-administration.png)

## Recruteur

Le recruteur reçoit du candidat un lien de CV en ligne (`/cv-en-ligne/<jeton>`). Il consulte un instantané en
lecture seule, non indexé, tant que le lien n'est ni révoqué ni expiré (90 jours).
[CAPTURE : CV en ligne consulté par un recruteur] (non capturé : il aurait fallu créer un lien de partage,
donc écrire en base).

# Bilan : difficultés et solutions

| Difficulté | Solution retenue | Trace dans le dépôt |
|---|---|---|
| Un modèle de langage peut inventer des faits | Le modèle n'écrit que du texte sourcé ; le code recopie les champs factuels et contrôle chaque ligne ; une ligne non prouvée est retirée | ADR 0003, `cv.ts`, `faithfulness.ts` |
| Le contrôle déterministe laisse passer un verbe gonflé | Relecture humaine obligatoire, juge de fidélité évalué sur un jeu de référence | `faithfulness.ts` (limites documentées), `evals/` |
| Sorties de l'IA non conformes, pannes, coût | Relances bornées avec liste des écarts, mode dégradé, budget mensuel et par CV, quotas | `pipeline.ts`, `llm-client/src/budget.ts` |
| Développer sans clé IA | Fournisseur de démonstration et import par règles | ADR 0038, `demo-provider.ts` |
| Migrer un monolithe sans régression | Suite de parité écrite avant l'extraction, rejouée après chaque service | ADR 0011, `e2e/parite` |
| Cohérence des données sans clé étrangère entre bases | Instantanés dans les générations, suppression distribuée par outbox idempotente | ADR 0013, 0019 |
| Partager du code sans coupler les services | Paquets sans logique métier, livrés compilés ; lockfile par service | ADR 0023, 0025 |
| Lecture de PDF non fiables | Processus enfant sans environnement, plafonds de mémoire, de CPU et de temps | `extraction.ts`, décision Q13 |
| Sandbox de Chromium en conteneur | Profil seccomp dédié ; réglage AppArmor en CI | `infra/seccomp/chromium.json`, `ci.yml` |
| Classement stable et multilingue | Plein texte par langue, vecteurs BGE-M3, fusion RRF avec arrondi déterministe | `ranking.ts`, migration `anglais` |
| Usages du CV différents selon les pays | Règles par pays appliquées à l'export seulement | ADR 0036, `norms.ts` |
| Comptes sans e-mail mais récupérables | Codes de récupération à usage unique | ADR 0030, 0039 |
| Réseau instable sur le poste | Reprises npm dans les Dockerfile, cache de build ; vérifications reportées et tracées | `TASKS.md` (« Waiting On ») |
| Délais Chromium sous Windows dans les tests | Non résolu : signalé dans le rapport de campagne | `docs/rapport-campagne-tests.md` |

**Organisation.** L'historique Git montre un travail par **phases** : cadrage, socle, pipeline IA,
industrialisation, veille, puis migration en microservices. Chaque phase s'accompagne d'ADR, d'une relecture
indépendante (commits `fix(...): corrections de la relecture indépendante`) et d'un suivi dans `TASKS.md`. La
décision Q12 indique que Claude Code a servi d'outil de génération de code, avec trois niveaux de
vérification : relecture humaine, contrôle statique et CI. [À COMPLÉTER : méthode de travail, répartition des
rôles, planning.]

# Perspectives et évolutions

Les éléments suivants sont tirés de `TASKS.md`, du README (« État et limites ») et des ADR :

1. **Remettre les tests à niveau** : recette E2E sur la connexion par mot de passe, couverture des nouvelles
   fonctionnalités, résolution des délais Chromium, CI entièrement tournée vers les microservices.
2. **Retirer le monolithe** (`apps/`, `db/`, base `attesta_web`, conteneur `web`).
3. **Valider et commiter** les ADR 0026 à 0046 et les fonctionnalités associées.
4. **IA réelle en local** : transmettre la clé aux services dans `compose.yaml` ; premier `npm run evals:live`
   avec plafond de dépense ; arbitrage entre les modèles (coût et qualité, décision Q6).
5. **Constituer le jeu annoté** de correspondance offres-profils (50 offres × 5 profils) pour mesurer
   précision et rappel (décision Q17).
6. **Déployer** sur Google Cloud (Terraform prêt) : domaine d'envoi (SPF, DKIM, DMARC), compte Brevo et
   accord de traitement des données.
7. **Internationaliser l'interface** (anglais, allemand) et traduire les rapports de veille.
8. **Élargir la couverture tunisienne** (clé Jooble), publier l'extension, décider des formules tarifaires.
9. **Durcissement** (phase 6 du backlog) : sécurité, RGPD, performance, dette, version `v1.0`.

# Conclusion

Attesta répond à sa problématique par une idée simple, appliquée avec rigueur : **l'IA propose, le code
contrôle, le candidat décide**. Le contrat du CV empêche le modèle de créer des faits, le contrôle de fidélité
retire ce qui n'est pas prouvé, et la relecture humaine reste obligatoire. Autour de ce cœur, la plateforme
couvre toute la candidature, du profil à la veille emploi, dans quatre pays.

Sur le plan technique, le projet est passé d'un monolithe modulaire à six microservices autonomes, chacun avec
sa base, son contrat et ses tests, derrière une gateway qui centralise l'authentification et les quotas. La
protection des données y est traitée dès la conception : chiffrement, journaux sans données personnelles,
droits RGPD propagés à tous les services.

Le travail restant est clairement identifié : remettre la campagne de tests au niveau des dernières
fonctionnalités, retirer le monolithe, brancher l'IA réelle et, à terme, déployer la cible Google Cloud déjà
décrite en code.

[À COMPLÉTER : apport personnel du projet, compétences acquises.]

# Annexes {.unnumbered}

## Annexe A : glossaire {.unnumbered}

| Terme | Définition |
|---|---|
| ADR | *Architecture Decision Record* : document court qui consigne une décision d'architecture, son contexte et ses conséquences |
| ATS | *Applicant Tracking System* : logiciel de tri des candidatures |
| BGE-M3 | Modèle de vecteurs de texte multilingue |
| CSP | *Content Security Policy* : en-tête qui restreint les ressources qu'une page peut charger |
| ESCO | Classification européenne des aptitudes, compétences, certifications et professions |
| Fidélité | Propriété d'une ligne de CV dont chaque affirmation est justifiée par le profil |
| Gateway | Point d'entrée unique de l'API |
| JWKS | *JSON Web Key Set* : publication des clés publiques de vérification des jetons |
| JWT | *JSON Web Token* : jeton signé portant l'identité et le rôle |
| Mode dégradé | CV assemblé depuis le profil, sans reformulation, quand l'IA est indisponible |
| Mode démonstration | Fournisseur d'IA simulé par le code, sans clé ; ses réponses sont signalées |
| Outbox | Table où une opération à propager est écrite dans la même transaction, puis traitée en différé |
| Pointeur JSON | Chemin désignant un élément d'un document JSON, par exemple `/work/0/highlights/1` |
| RGPD | Règlement général sur la protection des données |
| RRF | *Reciprocal Rank Fusion* : fusion de classements par rangs réciproques |
| SSE | *Server-Sent Events* : flux d'événements du serveur vers le navigateur |
| TEI | *Text Embeddings Inference* : serveur de calcul de vecteurs |

## Annexe B : variables d'environnement (noms uniquement) {.unnumbered}

Noms relevés dans les fichiers `.env.example` versionnés. **Aucune valeur n'est reproduite.**

| Unité | Variables |
|---|---|
| Communes aux services | `NODE_ENV`, `PORT`, `LOG_LEVEL`, `TRUST_PROXY`, `DATABASE_URL`, `MIGRATE_ON_START`, `AUTH_JWKS_URL` |
| `gateway` | `AUTH_URL`, `PROFILES_URL`, `CV_GENERATION_URL`, `JOBS_MATCHING_URL`, `JOB_WATCH_URL`, `LETTERS_EXPORT_URL`, `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_LOGIN_PER_HOUR`, `RATE_LIMIT_GENERATION_PER_HOUR`, `RATE_LIMIT_EXPORT_PER_HOUR`, `RATE_LIMIT_IMPORT_PER_HOUR` |
| `auth` | `APP_BASE_URL`, `SMTP_URL`, `MAIL_FROM`, `AUTH_PRIVATE_KEY`, `AUTH_KEY_ID`, `ADMIN_EMAILS`, `ADMIN_USERNAMES`, `ADMIN_PASSWORD`, `IP_HASH_SECRET`, `COOKIE_PATH`, `COOKIE_SECURE`, `SERVICE_SECRET_JOB_WATCH`, URL des services |
| `profiles` | Variables IA (ci-dessous), `EVIDENCE_KEY` |
| `cv-generation` | Variables IA, `PROFILES_URL`, `JOBS_MATCHING_URL`, `MAX_COST_PER_CV_USD`, `DAILY_QUOTA`, `QUOTA_SECRET` |
| `jobs-matching` | Variables IA, `EMBEDDINGS_PROVIDER`, `TEI_URL`, `ESCO_ENABLED`, `BA_ENABLED`, `BA_DAILY_REQUESTS`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_DAILY_REQUESTS`, `ARBEITNOW_ENABLED`, `ARBEITNOW_DAILY_REQUESTS`, `CATALOGUE_SYNC_HOURS`, `EMPLOYERS_ENABLED`, `EMPLOYERS_DAILY_REQUESTS`, `RSS_ENABLED`, `RSS_DAILY_REQUESTS`, `JOOBLE_API_KEY`, `JOOBLE_DAILY_REQUESTS` |
| `job-watch` | `AUTH_URL`, `PROFILES_URL`, `JOBS_MATCHING_URL`, `LETTERS_EXPORT_URL`, `SERVICE_SECRET`, `APP_BASE_URL`, `SMTP_URL`, `MAIL_FROM`, `IP_HASH_SECRET`, `BREVO_WEBHOOK_TOKEN`, `DAILY_RUN_ENABLED`, `DAILY_RUN_HOUR` |
| `letters-export` | Variables IA, `CV_GENERATION_URL`, `PROFILES_URL`, `PUPPETEER_EXECUTABLE_PATH`, `PDF_MAX_CONCURRENCY`, `PDF_TIMEOUT_MS`, `PDF_NO_SANDBOX` |
| Variables IA | `LLM_PROVIDER`, `LLM_MODEL`, `LLM_STEP_MODELS`, `LLM_TIMEOUT_MS`, `VERTEX_PROJECT_ID`, `VERTEX_REGION`, `LLM_MONTHLY_BUDGET_EUR` |
| Compose et racine | `FRONTEND_PORT`, `MAILPIT_PORT`, `DB_PORT`, ports des services ; monolithe : `SESSION_SECRET`, `SESSION_STORE`, `PDF_MAX_CONCURRENCY`, `PDF_TIMEOUT_MS`, `LLM_PROVIDER`… |

## Annexe C : arborescence du projet {.unnumbered}

```
attesta/
├── services/                  Six microservices (src, migrations, prompts, tests, openapi.yaml, Dockerfile)
│   ├── auth/                  Comptes, sessions, JWT/JWKS, RGPD distribué
│   ├── profiles/              Profil versionné, import PDF, justificatifs, photo
│   ├── cv-generation/         Pipeline, fidélité, assistants, evals/
│   ├── jobs-matching/         Offres, sources/, classement, data/ (employeurs, villes)
│   ├── job-watch/             Veille quotidienne, rappels
│   └── letters-export/        Lettres, render/ (PDF, Word, usages par pays), templates/
├── gateway/                   Point d'entrée de l'API (routage, garde, quotas)
├── frontend/                  React (pages, studio, api, auth), nginx, en-têtes de sécurité
├── packages/                  shared-schemas, llm-client, http-kit, logger, config
│                              (+ llm, render, schema, shared, jobwatch : monolithe hérité)
├── extension/                 Extension Chrome « Cibler cette offre »
├── e2e/                       Playwright : parite/, frontend/
├── infra/                     postgres/ (bases, rôles), seccomp/, terraform/, deploy/
├── scripts/                   Données de démonstration, test SMTP, captures, CI
├── docs/                      46 ADR, architecture, plan et rapport de tests, runbook, conformité
├── apps/, db/                 Monolithe v0.4 (gelé, en cours de retrait)
├── compose.yaml               Pile locale (profils core, full, veille, tei)
└── .github/workflows/         ci, cd, rollback, mutation, labels
```

## Annexe D : index des décisions d'architecture {.unnumbered}

| ADR | Sujet |
|---|---|
| 0001 à 0010 | Monolithe modulaire, contrat unique, pipeline LLM, PostgreSQL, rendu PDF, données personnelles, veille, fournisseur LLM, hébergement, comptes et envoi |
| 0011 à 0021 | Extraction en microservices, communication, une base par service, JWT, gateway, llm-client, contrats OpenAPI et Zod, rendu PDF centralisé, RGPD distribué, observabilité, cible d'exécution |
| 0022 à 0025 | Frontend React, autonomie des services, rôles, paquets partagés compilés |
| 0026 à 0046 (proposés) | Ajustements de l'extraction, justificatifs, rôles de l'IA, assistants, comptes par mot de passe, sources d'offres, pays, catalogue, RSS tunisiens, usages par pays, Word, import par règles, codes de récupération, suivi, modèles, CV en ligne, exemples, extension, avis et tarifs, tests de mutation et de propriétés |
