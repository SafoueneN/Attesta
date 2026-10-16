# ADR 0005 : Gabarit HTML unique et Puppeteer en worker isolé

- Statut : proposé
- Date : 2026-10-16

## Décision

- **Un seul HTML** pour l'aperçu et le PDF : `packages/render` expose `renderCvHtml(cv, profile, variant)`, et le même HTML est affiché dans l'aperçu puis imprimé par Chromium. Deux variantes CSS partagent le même balisage : `ats` (une colonne, titres standards, aucune image) et `design`.
- Rendu par **Puppeteer** dans le **worker** (job pg-boss `render-pdf`). Un navigateur réutilisé, une page par job, un timeout de 20 s, et JavaScript désactivé dans la page rendue.
- **Polices embarquées** sous licence OFL, servies localement (par exemple Source Sans 3) et jamais depuis un CDN au moment du rendu.
- Dates formatées par une seule fonction (`MM/AAAA` ou selon la langue du CV), testée unitairement.
- **Test ATS** : extraction du texte du PDF avec `pdfjs-dist`. Il vérifie que chaque ligne du CV est retrouvée dans l'ordre, qu'il n'y a qu'une colonne (ordre de lecture identique au DOM) et que les dates sont cohérentes.
- Docker : Chromium et polices installés dans l'image, conteneur lancé avec `--init` (récupération des processus zombies de Chromium), utilisateur non-root, sandbox Chromium **active** (pas de `--no-sandbox`), avec le profil seccomp adéquat.

## Étape intermédiaire en Phase 1

En Phase 1, il n'y a ni pipeline ni pg-boss. Le rendu tourne donc **dans le processus web**, derrière l'interface `PdfRenderer`, avec une concurrence bornée (2 rendus simultanés) et un timeout. Le passage dans le worker se fait en Phase 2, quand la file arrive avec le pipeline. Seul le câblage change, pas l'interface. Risque accepté le temps de la Phase 1 : un plantage de Chromium touche le serveur web, ce qui est atténué par le redémarrage automatique du conteneur.

## Conséquences

- L'égalité aperçu = PDF est garantie par construction, puis vérifiée par un test de rendu.
- Puppeteer pèse environ 300 Mo dans l'image : c'est le prix d'un rendu fidèle. Les alternatives (pdfkit, react-pdf) imposent un second gabarit et cassent l'égalité aperçu = PDF.
