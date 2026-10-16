# ADR 0010 : Veille emploi, comptes et envoi d'e-mails (Phase 4)

- Statut : accepté (mis en œuvre en Phase 4) ; précise l'[ADR 0007](0007-veille-emploi.md)
- Date : 2026-10-16

## Contexte

La Phase 4 livre la veille quotidienne : deux rapports PDF par e-mail, à partir du profil du candidat. Elle exige ce que le parcours anonyme n'avait pas : un compte (adresse vérifiée), un profil conservé, des consentements journalisés, un envoi fiable et une exécution planifiée. Aucune clé d'API payante n'était disponible : tout ce qui peut l'être est vérifié en local sur des données réelles et gratuites (BA Jobsuche, ESCO, GeoNames), le reste est testé avec des données fictives. BGE-M3 n'a pas pu être téléchargé sur le poste de développement : la veille réelle a tourné avec les vecteurs de développement.

## Décisions

### 1. Questions Q14 à Q18

| #   | Décision                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q14 | **BA Jobsuche** pour le pilote DE (API publique, sans clé, non officielle : validation Zod de chaque réponse, échec visible). **Adzuna** (DE, FR) livré et testé sur réponses fictives, activé dès que des clés existent. Jooble et France Travail : backlog, en attente d'accès. |
| Q15 | **BGE-M3 sur Text Embeddings Inference (CPU), autohébergé** : service Cloud Run privé à Paris, poids en cache dans un bucket. Les textes ne quittent pas l'infrastructure.                                                                                                        |
| Q16 | Formule par défaut, **affichée comme hypothèse** dans le rapport 2 : 0,5 × fréquence + 0,3 × écart de salaire − 0,2 × effort (`packages/jobwatch/src/gaps.ts`).                                                                                                                   |
| Q17 | Jeu annoté : **toujours à constituer par l'équipe**. Les seuils (similarité minimale 0,45 pour BGE-M3, pertinence minimale 20) sont provisoires.                                                                                                                                  |
| Q18 | **Brevo** (société française, données dans l'UE) par son **relais SMTP** ; Mailpit en local. Le code ne dépend que de SMTP (nodemailer) : changer de fournisseur ne touche que la configuration et le webhook.                                                                    |

### 2. Comptes sans mot de passe

Connexion par **lien à usage unique** envoyé par e-mail (15 min ; seule l'empreinte SHA-256 du jeton est stockée). Le lien ouvre une page de confirmation (POST) : les antivirus de messagerie qui visitent les liens ne le consomment pas. Même réponse que l'adresse ait un compte ou non. Session régénérée à la connexion, CV en cours conservé. Le compte n'est créé qu'à la consommation du lien, avec l'acceptation de la politique de confidentialité journalisée.

Alternative écartée : mot de passe (stockage, réinitialisation, et l'adresse doit de toute façon être vérifiée pour la veille).

### 3. Consentement et envoi

- **Double opt-in** : la veille reste « en attente » tant que le lien de confirmation (48 h) n'est pas utilisé. Modifier les critères d'une veille active ne redemande pas de confirmation.
- **Journal de consentement** (`consent_log`) : accord et retrait, finalité (`service`, `veille`), version de la politique, empreinte de l'IP. Aucun e-mail promotionnel n'existe : aucun consentement « promo » n'est collecté.
- **Désabonnement en un clic** : en-têtes `List-Unsubscribe` et `List-Unsubscribe-Post` (RFC 8058) ; le POST de la messagerie est accepté sans cookie, le jeton suffit.
- **Pas d'e-mail vide** : aucune offre nouvelle (jamais envoyée à cet abonné), aucun e-mail.
- **Au plus un e-mail par abonné et par jour** : l'envoi est réservé (`email_delivery`, statut `en_cours`) avant l'appel SMTP ; un refus du serveur lève la réservation, un arrêt brutal ne provoque jamais de doublon.
- **Plaintes et rebonds** : webhook Brevo authentifié par jeton porteur (comparaison à temps constant). Plainte : veille arrêtée, retrait journalisé, alerte ; rebond définitif : veille suspendue. Taux de plaintes sur 30 jours journalisé à chaque exécution, alerte au-delà de 0,1 %.
- Aucun pixel de suivi, aucune image distante, aucun lien réécrit.

### 4. Matching

1. **Ingestion par requêtes** : on ne recopie pas les sources entières. Pour chaque abonné : intitulés saisis, plus les métiers ESCO voisins dans la langue de la source (pivot FR → DE), ville et rayon. Budget journalier de requêtes par source ; journal par exécution (`job_source_run`).
2. **Normalisation et déduplication** : unicité `(source, identifiant)` puis empreinte (intitulé sans « (m/w/d) », employeur, ville, date). La déduplication par similarité de vecteurs (second niveau de l'ADR 0007) **n'est pas faite** : backlog.
3. **Rappel** : filtres durs en SQL (pays, fraîcheur de 14 jours, rayon par haversine, temps de travail, offre jamais envoyée) ; recherche lexicale (`websearch_to_tsquery`, français et allemand, `ts_rank_cd` : **pas du BM25**, cf. ADR 0004) ; recherche vectorielle HNSW avec un seuil de similarité ; fusion **RRF** (k = 60) ; 20 premiers.
4. **Précision** : rerank LLM (prompt `rerank-offres/v1`, sortie validée par Zod, identifiants courts, budget par abonné). Chaque compétence manquante citée par le modèle n'est retenue que si elle figure **dans l'offre** et **pas dans le profil**. Mode dégradé : classement du rappel, compétences repérées sans modèle.
5. **Anonymisation** : ni nom, ni coordonnées, ni liens, ni employeurs, ni établissements dans le texte vectorisé ou envoyé au modèle ; adresses e-mail, téléphones et URL retirés des textes libres.

### 5. Exécution

Un **Cloud Run Job** (même image que l'application, `node apps/worker/dist/main.js`) lancé chaque matin par **Cloud Scheduler**. Il purge, ingère, vectorise, puis traite chaque abonné. pg-boss apporte les relances avec attente croissante (2 relances) et une file par clé ; l'idempotence d'une relance le même jour repose sur les contraintes de la base. Une seule tâche par exécution (budgets de requêtes en mémoire). En local : `docker compose run --rm veille`.

Les rapports PDF ne sont **pas conservés** : ils sont produits, joints à l'e-mail, puis oubliés. La table `report` du modèle cible disparaît ; `email_delivery` en tient lieu.

## Conséquences

- Le schéma suit le modèle cible avec trois écarts documentés dans `docs/architecture.md` : pas de table `profile` (une version de profil par enregistrement suffit), pas de table `report`, coordonnées en `double precision` (pas de PostGIS dans l'image pgvector).
- Les données des comptes sont effacées en cascade à la suppression, ou après 18 mois d'inactivité ; les offres 60 jours après leur publication.

## Limites connues

- **Langue** : en allemand, sans modèle, un nom d'outil sans signe distinctif (« Kubernetes ») n'est pas repéré comme compétence ; seul le rerank LLM le signale.
- **ESCO** : la recherche plein texte de l'API rapproche parfois sur un mot secondaire. On exige le mot principal de l'intitulé (heuristique) ; la saisie de l'abonné est toujours cherchée telle quelle.
- **BA Jobsuche** est non officielle : un changement de format arrête l'ingestion (erreur journalisée, alerte), sans données corrompues.
- **Salaires** : BA publie souvent des taux horaires, non convertis (le nombre d'heures est inconnu) ; l'écart de salaire du rapport 2 est donc souvent « données insuffisantes ».
- Rapports en **français** seulement, y compris pour le pilote DE (dictionnaire allemand : backlog).
- La précision et le rappel ne sont **pas mesurés** tant que le jeu annoté (Q17) n'existe pas.

## Relecture indépendante de la Phase 4 (2026-10-16)

Un relecteur qui n'avait pas écrit le code a audité la phase et démontré ses constats par des scripts contre la base de test.

| Constat                                                                                                                                                           | Gravité | Correction                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deux e-mails le même jour : la réservation d'envoi était levée sur toute erreur, y compris après acceptation du message (échec de l'écriture en base, délai SMTP) | haute   | réservation levée seulement si le message n'est certainement pas parti (code de réponse SMTP, erreur de configuration, d'authentification ou d'enveloppe, connexion jamais établie) ; écriture du statut hors du `try`. Tests « issue incertaine » et « refus explicite » |
| Adresses e-mail dans les journaux et dans `pgboss.job.output` via les erreurs de nodemailer                                                                       | haute   | `MailError` assainie (code et code SMTP seulement), levée par `SmtpMailer`                                                                                                                                                                                                |
| Offres jamais envoyées (SMTP en panne) considérées comme envoyées le lendemain                                                                                    | moyenne | seules les offres d'un jour ayant un envoi sont exclues ; les résultats sans envoi sont remplacés à chaque exécution, dans une transaction                                                                                                                                |
| Veille en attente supprimée par la purge alors que son lien de confirmation était valide                                                                          | moyenne | purge sur l'expiration du lien, plus sur la date de création                                                                                                                                                                                                              |
| Anonymisation : numéros allemands, nom, employeur ou ville cités dans le texte libre                                                                              | moyenne | motif des numéros allemands ; retrait des valeurs identifiantes déclarées (nom et ses parties, employeurs, établissements, ville), sauf si elles sont aussi des compétences ; corpus complet gardé en local pour la vérification des compétences                          |
| Une offre mal formée (entité HTML invalide, détail retiré, résultat non conforme) faisait échouer toute la requête                                                | moyenne | point de code borné ; offre ignorée et comptée en erreur (BA : 404, 410, format ; Adzuna : résultat par résultat) ; une panne de la source interrompt toujours la requête (relance)                                                                                       |
| Webhook : 500 au lieu de 401 pour un jeton non ASCII                                                                                                              | basse   | comparaison des empreintes SHA-256                                                                                                                                                                                                                                        |
| Masquage des jetons sensible à la casse                                                                                                                           | basse   | expression insensible à la casse                                                                                                                                                                                                                                          |
| Plaintes et rebonds Brevo peut-être jamais rapprochés (identifiant de message propre à Brevo)                                                                     | soupçon | en-tête `X-Mailin-custom` = identifiant de l'envoi, rapproché en priorité. **À vérifier en préprod avec un vrai événement Brevo**                                                                                                                                         |
| Lien de connexion d'un tiers ouvert par la victime : CV enregistré dans le compte du tiers                                                                        | soupçon | adresse du compte affichée (masquée) avant la connexion, avec un avertissement ; le lien inconnu est refusé dès l'ouverture                                                                                                                                               |
| Avalanche de liens vers une adresse tierce depuis plusieurs IP                                                                                                    | soupçon | plafond de 3 demandes par heure et par adresse (empreinte HMAC)                                                                                                                                                                                                           |
| Limiteur général sur le webhook et le désabonnement en un clic                                                                                                    | soupçon | ces deux routes, authentifiées par jeton, en sont exemptées                                                                                                                                                                                                               |
| Confirmation du double opt-in non journalisée ; export incomplet                                                                                                  | soupçon | confirmation journalisée dans `consent_log` ; export avec l'empreinte d'IP et l'identifiant d'envoi                                                                                                                                                                       |
| Web et job partageant la même identité ; jeton du webhook facultatif en production                                                                                | soupçon | identité dédiée au job (base, Vertex, SMTP, TEI) ; le web n'invoque plus TEI ; jeton obligatoire en production                                                                                                                                                            |
| npm : nodemailer 8 vulnérable (CVE-2026-82659 et deux dénis de service), relevé par Trivy                                                                         | haute   | nodemailer 10.1.2 ; `npm audit` et Trivy à zéro                                                                                                                                                                                                                           |

Assumés et documentés :

- le jeton du webhook est généré par Terraform, donc présent dans l'état (bucket privé, comme les autres secrets générés) ;
- TEI reste en entrée « tous » protégée par l'IAM : l'entrée « interne » exigerait un réseau VPC pour le job ;
- les données de jobs pg-boss (intitulés, ville, identifiant d'abonnement ; jamais d'adresse depuis la correction) sont effacées par pg-boss après 7 jours, pas à la suppression du compte ;
- rejouer une date passée (`--date`) peut reproposer une offre envoyée à une date postérieure : réservé à la reprise après incident.
