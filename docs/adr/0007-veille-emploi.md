# ADR 0007 : Veille emploi, sources, matching en deux étages, envoi

- Statut : accepté ; précisé et mis en œuvre par l'[ADR 0010](0010-veille-comptes-envoi.md)
- Date : 2026-10-16

## Décision

### Ingestion

- Un connecteur par source, derrière l'interface `JobSourceConnector { fetchSince(cursor): AsyncIterable<RawPosting> }`.
- Sources : **BA Jobsuche** (DE, API non officielle, donc fragile : dépendance assumée et surveillée), **Adzuna** (250 requêtes par jour, attribution obligatoire dans les rapports), **Jooble**, **France Travail** (sous réserve d'accès). **Aucun scraping.**
- Normalisation vers `job_posting`, déduplication par empreinte (titre et employeur normalisés, ville, date) et, en second niveau, similarité d'embeddings supérieure à un seuil.
- Chaque exécution est journalisée par source (nombre d'offres, erreurs, quota consommé).

### Matching

1. **Rappel** : filtres durs (langue, rayon, contrat, fraîcheur) ; recherche lexicale (ADR 0004) ; vecteurs BGE-M3 (1 024 dimensions, index HNSW) ; fusion **RRF** (k = 60) ; métiers voisins via **ESCO** (et ISCO-08), qui sert de pivot entre FR, DE et EN.
2. **Précision** : rerank LLM du **top 20 seulement**, avec une sortie validée par Zod qui fournit un score décomposé (similarité, couverture des compétences, lieu) et l'explication « il vous manque X et Y » (compétences de l'offre absentes du profil).

Le profil est **anonymisé** avant le calcul (nom, photo, âge, adresse). Seule la localisation au niveau de la ville sert au filtre de rayon.

**Hébergement de BGE-M3, à décider** : conteneur Hugging Face Text Embeddings Inference (CPU, autohébergé dans l'UE, coût fixe) ou API managée. Proposition : TEI autohébergé.

### Rapports

- Une vue HTML par rapport, rendue en PDF par le worker de l'ADR 0005.
- **Rapport 1** : offres classées, avec un lien vers la source et l'attribution.
- **Rapport 2** : écarts de compétences classés par priorité. La formule est à valider (voir `docs/questions.md`). Les fourchettes salariales sont **sourcées et indicatives**, avec un vocabulaire « associé à » (jamais « cause ») et aucune variable protégée.
- Aucune offre nouvelle ce jour-là : **pas d'e-mail**.

### Envoi

- Fournisseur à choisir entre Amazon SES (eu-central-1) et Brevo. SPF, DKIM et DMARC (`p=quarantine`, puis `reject`).
- Double opt-in ; désabonnement en un clic (en-têtes `List-Unsubscribe` et `List-Unsubscribe-Post`, RFC 8058) ; aucun pixel de suivi sans consentement.
- Suivi des plaintes via les webhooks du fournisseur, avec une alerte au-delà de 0,1 %.
- Planification pg-boss : un job quotidien par abonnement, avec `singletonKey = abonnement + date`, ce qui rend la relance idempotente.
