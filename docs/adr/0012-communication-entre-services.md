# ADR 0012 : Communication entre services

- Statut : accepté le 2026-10-18
- Décideurs : chef de projet, équipe

## Contexte

Six services ([ADR 0011](0011-microservices-extraction.md)) doivent coopérer : la génération lit le profil
et l'offre, l'export lit le CV vérifié, la veille fait classer des offres et rendre des rapports, et la
suppression d'un compte touche tous les services. L'équipe est réduite, la cible est un poste local sous
docker-compose ([ADR 0021](0021-cible-execution-et-outillage.md)).

## Décision

1. **REST synchrone en JSON sur HTTP**, versionné par le chemin (`/v1/...`). Une évolution compatible
   (champ optionnel ajouté) garde `v1` ; une rupture crée `v2`, et les deux coexistent le temps de migrer
   les consommateurs.
2. **Trafic externe** : navigateur → `apps/web` → gateway (`/api/<service>/v1/...`) → service. Le
   navigateur ne parle jamais directement à un service ; la gateway est aussi exposée en local pour les
   démonstrations d'API (REST Client).
3. **Trafic interne** : appels directs sur le réseau docker (`http://profiles:4002`), sous le préfixe
   `/internal/v1/...`, jamais routé par la gateway. Deux identités possibles :
   - **jeton de l'utilisateur relayé** (`Authorization: Bearer`) quand l'appel sert une requête de
     l'utilisateur (la génération lit _son_ profil) ;
   - **jeton de service** émis par `auth` (audience = service cible, portée minimale) pour les tâches
     système : veille quotidienne, suppression et export RGPD.
4. **Asynchrone sans courtier partagé** : un service qui a du travail de fond utilise **pg-boss dans sa
   propre base** (job-watch : exécution quotidienne ; auth : distribution des événements RGPD). Un
   événement qui doit sortir d'un service passe par une **table outbox** du producteur, puis par un appel
   HTTP idempotent avec reprises ([ADR 0019](0019-rgpd-distribue.md)).
5. **Client HTTP commun** (`packages/http-kit`) : propagation de `X-Request-Id`, délai d'attente par
   défaut de 5 s (90 s sur les chemins LLM), 2 reprises avec gigue sur les seules requêtes idempotentes
   (GET, PUT, DELETE), erreurs typées. Aucune donnée personnelle dans les journaux du client.
6. **Progression de génération en SSE** : `cv-generation` émet un flux `text/event-stream` ; la gateway et
   `apps/web` le relaient sans le mettre en mémoire tampon. Le repli sans JavaScript (POST puis redirection)
   est conservé.
7. **Un aller-retour par dépendance et par requête** : le consommateur demande une ressource complète
   (pas de bavardage) ; les données de référence peu volatiles (ESCO) restent chez leur propriétaire.

## Options considérées

| Option                                     | Complexité | Infrastructure en plus | Adapté à EJS et à l'équipe | Couplage temporel |
| ------------------------------------------ | ---------- | ---------------------- | -------------------------- | ----------------- |
| A. REST + outbox + pg-boss local (retenue) | moyenne    | aucune                 | oui                        | moyen             |
| B. Courtier de messages (RabbitMQ, NATS)   | élevée     | un courtier à opérer   | moyen                      | faible            |
| C. gRPC entre services                     | élevée     | génération de code     | non (navigateur, EJS)      | moyen             |
| D. Base partagée « pour aller vite »       | faible     | aucune                 | oui                        | **interdit**      |

## Conséquences

- Plus facile : un seul style d'API, testable avec supertest et REST Client, lisible en soutenance.
- Plus difficile : une panne d'un fournisseur se propage aux consommateurs synchrones. Parade : délais
  d'attente, messages d'erreur explicites en français, mode dégradé de la génération (déjà existant).
- À revoir si un flux devient massif ou multi-consommateur : un courtier (option B) remplacerait alors
  les appels HTTP de l'outbox, sans changer les producteurs.
