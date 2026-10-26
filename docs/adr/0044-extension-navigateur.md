# ADR 0044 : Extension de navigateur « Cibler cette offre »

- Statut : **proposé** le 2026-10-25, à valider par le chef de projet
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

Copier-coller une annonce est la première friction du ciblage. Teal, Jobscan et Simplify proposent une
extension qui envoie l'offre affichée en un clic.

## Décision

1. **Extension Manifest V3** (`extension/`, Chrome et Edge) : au clic, dans l'onglet actif seulement
   (`activeTab`), lit la sélection ou, à défaut, le texte principal de la page (bloc de texte le plus
   pertinent, titre en tête) ; aucune lecture en arrière-plan, aucun accès permanent aux sites.
2. **Transmission par le fragment d'URL** : ouvre Attesta sur `/cv/etape/3#annonce=…&source=…`. Le
   fragment n'est jamais envoyé à un serveur ; la page pré-remplit le formulaire, efface le fragment, et le
   candidat relit avant d'enregistrer. Texte limité à 20 000 caractères.
3. Aucune clé, aucun compte dans l'extension, aucune donnée conservée hormis l'adresse d'Attesta choisie.

## Options considérées

- Appel direct à l'API depuis l'extension : écarté (jetons de session dans l'extension, permissions
  d'hôte larges).

## Conséquences

- Fonctionne sur tout site d'offres, sans scraping côté serveur : c'est le candidat qui envoie la page
  qu'il consulte.
- Publication sur les boutiques : icône, politique de confidentialité et revue à prévoir.
