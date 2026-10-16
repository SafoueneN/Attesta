# ADR 0009 : Hébergement sur Google Cloud (Paris), exécution sans worker pour le parcours interactif

- Statut : accepté le 2026-10-16 (décision Q10 ; remplace la partie « worker pg-boss » des ADR 0004 et 0005)
- Date : 2026-10-16

## Contexte

Il faut héberger dans l'UE, avec trois environnements, des déploiements progressifs, un retour arrière rapide, des sauvegardes et aucun secret dans le dépôt. Le modèle d'IA tourne sur Vertex AI (ADR 0008).

## Décision 1 : Google Cloud, région `europe-west9` (Paris)

| Besoin                      | Service                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Application (préprod, prod) | **Cloud Run** (2ᵉ génération) : une révision immuable par déploiement, répartition du trafic entre révisions             |
| Base de données             | **Cloud SQL PostgreSQL 16** avec `pgvector`, sauvegardes quotidiennes et restauration à un instant donné (PITR, 7 jours) |
| Images                      | **Artifact Registry** (`europe-west9`)                                                                                   |
| Secrets                     | **Secret Manager** (`SESSION_SECRET`, mot de passe de la base)                                                           |
| Migrations                  | **Cloud Run Job** avec la même image (`node-pg-migrate`)                                                                 |
| Déploiement depuis GitHub   | **Workload Identity Federation** : aucune clé de compte de service                                                       |
| IA                          | Vertex AI région `eu`, par l'identité du service Cloud Run : **aucune clé** à gérer                                      |

Pourquoi ce choix plutôt que Scaleway ou OVHcloud : un seul fournisseur et un seul contrat de sous-traitance pour l'hébergement et l'IA ; l'authentification à Vertex sans clé ; des révisions qui rendent le retour arrière quasi instantané (bascule du trafic). En contrepartie, la dépendance à Google augmente. L'image reste un conteneur standard (Docker + PostgreSQL), donc portable.

**Coût (ordre de grandeur, non vérifié)** : Cloud SQL de 10 à 60 € par mois et par environnement selon la taille ; Cloud Run facturé à l'usage (préprod à 0 instance au repos, prod à 1 instance minimum). À chiffrer avec le calculateur Google Cloud avant engagement.

## Décision 2 : pas de worker pg-boss pour la génération et le rendu

L'ADR 0005 prévoyait un worker séparé pour isoler Chromium et les appels longs. Après les Phases 1 et 2, les raisons d'origine sont traitées autrement :

| Risque                                        | Traitement                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Chromium bloque ou plante                     | Processus séparé ; navigateur relancé automatiquement ; concurrence bornée ; délai maximal |
| Analyse d'un PDF piégé qui bloque le serveur  | **`worker_thread`** avec délai et limites mémoire (Phase 3)                                |
| Plusieurs instances : verrou, quota, limiteur | **Tables PostgreSQL** à mise à jour atomique (Phase 3)                                     |
| Génération longue                             | Cloud Run accepte des requêtes de plusieurs minutes et le streaming (SSE)                  |

Ajouter une file pg-boss, un service worker toujours actif et un relais de progression (LISTEN/NOTIFY) ajouterait de la complexité sans nouveau bénéfice. **pg-boss arrive en Phase 4**, pour la veille emploi planifiée, son vrai cas d'usage.

## Décision 3 : comptes en Phase 4

Un compte sans adresse e-mail vérifiée est fragile, et l'envoi d'e-mails (double opt-in, lien de connexion) arrive avec la veille en Phase 4, première fonction qui a besoin de conserver des données. Les comptes y sont regroupés avec l'export et la suppression des données (art. 15, 17 et 20), le journal de consentement et les tables `cv_generation` et `cv_line_trace`. D'ici là, aucune donnée de CV n'est conservée au-delà de la session.

## Sandbox Chromium

Un profil seccomp dédié (`infra/seccomp/chromium.json`, dérivé du profil par défaut de Docker v28, plus `clone`, `unshare`, `setns` et `chroot`) **réactive la sandbox** de Chromium en local et sur tout hôte Docker. Testé : lecture seule, `cap_drop: ALL` et `no-new-privileges`. Cloud Run ne permet pas de choisir un profil seccomp : le test de fumée du déploiement vérifie l'export PDF avec la sandbox active, et `PDF_CHROMIUM_NO_SANDBOX=true` n'est activé qu'en cas d'échec constaté, avec l'isolation par micro-VM de Cloud Run comme compensation.
