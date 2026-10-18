# ADR 0005 : Gabarit HTML unique et Puppeteer en worker isolé

- Statut : accepté, **amendé par l'[ADR 0009](0009-hebergement-et-execution.md)** (pas de worker pg-boss pour le parcours interactif ; pg-boss en Phase 4), et par l'[ADR 0018](0018-rendu-pdf-centralise.md) (rendu dans letters-export)
- Date : 2026-10-16

## Décision

- **Un seul HTML** pour l'aperçu et le PDF : `packages/render` expose `renderCvHtml(cv, profile, variant)`, et le même HTML est affiché dans l'aperçu puis imprimé par Chromium. Deux variantes CSS partagent le même balisage : `ats` (une colonne, titres standards, aucune image) et `design`.
- Rendu par **Puppeteer** dans le **worker** (job pg-boss `render-pdf`). Un navigateur réutilisé, une page par job, un timeout de 20 s, et JavaScript désactivé dans la page rendue.
- **Polices embarquées** sous licence OFL, servies localement (par exemple Source Sans 3) et jamais depuis un CDN au moment du rendu.
- Dates formatées par une seule fonction (`MM/AAAA` ou selon la langue du CV), testée unitairement.
- **Test ATS** : extraction du texte du PDF avec `pdfjs-dist`. Il vérifie que chaque ligne du CV est retrouvée dans l'ordre, qu'il n'y a qu'une colonne (ordre de lecture identique au DOM) et que les dates sont cohérentes.
- Docker : Chromium et polices installés dans l'image, conteneur lancé avec `--init` (récupération des processus zombies de Chromium), utilisateur non-root. Cible : sandbox Chromium **active** grâce à un profil seccomp adéquat (Phase 3). En Phase 1, voir l'écart décrit ci-dessous.

## Étape intermédiaire en Phase 1 (état réel)

- **Rendu dans le processus web.** En Phase 1, il n'y a ni pipeline ni pg-boss. Le rendu tourne derrière l'interface `PdfRenderer`, avec une concurrence bornée (2 rendus simultanés) et un timeout de 20 s. Le passage dans le worker se fait en Phase 2, quand la file arrive avec le pipeline ; seul le câblage change. Risque accepté le temps de la Phase 1 : un plantage de Chromium touche le serveur web, ce qui est atténué par le redémarrage automatique du conteneur.
- **JavaScript de la page rendue** : il n'est pas désactivé par Puppeteer (cela bloquerait l'attente du chargement des polices). Il est neutralisé par une **CSP embarquée** dans le HTML du CV (`default-src 'none'`) : aucun script, aucune ressource réseau. Tout contenu saisi est échappé par EJS (test unitaire dédié).
- **Sandbox Chromium en conteneur : écart assumé.** Le profil seccomp par défaut de Docker bloque les espaces de noms utilisateur dont la sandbox de Chromium a besoin. Le conteneur lance donc Chromium avec `--no-sandbox` (`PDF_CHROMIUM_NO_SANDBOX=true`, réservé au conteneur). Cela est compensé par une isolation au niveau du conteneur : utilisateur non-root, système de fichiers en lecture seule, `cap_drop: ALL`, `no-new-privileges`, CSP `default-src 'none'` et HTML produit uniquement par notre gabarit. **À traiter en Phase 3** : profil seccomp dédié à Chromium pour réactiver la sandbox, avec une revue de sécurité indépendante. Hors conteneur (poste de développement, CI), la sandbox reste active.

## Conséquences

- L'égalité aperçu = PDF est garantie par construction, puis vérifiée par un test de rendu.
- Puppeteer pèse environ 300 Mo dans l'image : c'est le prix d'un rendu fidèle. Les alternatives (pdfkit, react-pdf) imposent un second gabarit et cassent l'égalité aperçu = PDF.
