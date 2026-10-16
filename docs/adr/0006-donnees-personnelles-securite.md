# ADR 0006 : Données personnelles, rétention et sécurité

- Statut : accepté le 2026-10-16 (durées tranchées dans `docs/questions.md`, Q2). Information de conception, pas un avis juridique.
- Date : 2026-10-16

## Décision : deux modes d'usage

| Mode | Ce qui est stocké | Durée |
|---|---|---|
| **Anonyme (par défaut)** | brouillon du formulaire et dernière génération, dans une session serveur | supprimés à la fin de la session, après **2 h** d'inactivité ou au plus tard **24 h** après sa création ; le PDF est généré à la demande et jamais stocké |
| **Compte (opt-in explicite)** | profil versionné, générations, traces, abonnement à la veille | supprimés à la demande (effet immédiat) ; purge après **12 mois** d'inactivité, précédée d'un e-mail de prévenance à 11 mois |

La veille emploi exige un compte et un consentement séparé, inscrit dans `consent_log`.

« Aucune conservation par défaut » signifie donc : rien ne survit à la session sans action explicite du candidat.

## Minimisation vers le LLM

- Avant l'envoi au modèle, `basics.name`, `email`, `phone`, `url`, `profiles` et l'adresse précise sont **remplacés par des jetons**. Le code les réinjecte au rendu, car le modèle n'en a pas besoin pour reformuler.
- Fournisseur choisi avec : traitement dans l'UE ou garanties de transfert, **aucune réutilisation pour l'entraînement**, rétention nulle ou minimale contractualisée.

## Sécurité applicative (OWASP)

- helmet avec une CSP stricte (aucun script inline, `nonce` si nécessaire), cookies `HttpOnly`, `Secure`, `SameSite=Lax`, protection CSRF (synchronizer token) sur tous les POST.
- Toutes les entrées validées par Zod à la frontière HTTP.
- Upload PDF : 5 Mo maximum, vérification du type MIME **et** des octets magiques, analyse en processus isolé (worker), sans stockage durable. L'antivirus (ClamAV) est **à décider** : coût d'image et d'exploitation à mettre en balance avec le risque, faible puisque le fichier n'est jamais servi à d'autres utilisateurs.
- Rate limiting par IP et par compte, plus fort sur les routes de génération.
- Logs pino avec `redact` et **aucun contenu de CV ni d'offre** journalisé : uniquement des identifiants, durées et compteurs.
- Secrets injectés par l'environnement (gestionnaire de secrets de l'hébergeur), `.env` ignoré par git, scan gitleaks en CI.

## Droits RGPD

- Export de toutes les données du compte en JSON (art. 15 et 20), suppression immédiate (art. 17), journal de consentement horodaté.
- Aucune décision automatisée (art. 22) : Attesta propose, le candidat valide chaque export.
- AI Act : mention « Contenu généré par une IA, à relire » sur l'aperçu, et case de relecture obligatoire avant l'export.
