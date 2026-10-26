# Extension « Cibler cette offre »

Extension de navigateur (Chrome, Edge ; Manifest V3) : sur une page d'offre (LinkedIn, StepStone, Indeed,
site d'un employeur…), un clic envoie le texte de l'annonce à Attesta, à l'étape « Offre visée ». Voir
[ADR 0044](../docs/adr/0044-extension-navigateur.md).

## Installer en local

1. Ouvrir `chrome://extensions` (ou `edge://extensions`), activer le **mode développeur**.
2. « Charger l'extension non empaquetée » → choisir ce dossier `extension/`.
3. Sur une page d'offre, cliquer sur l'icône Attesta, puis « Envoyer l'offre à Attesta ».

L'adresse d'Attesta se règle dans la fenêtre de l'extension (par défaut `http://localhost:8081`).

## Données

- Lue seulement au clic, dans l'onglet actif (`activeTab`) : sélection, sinon le texte principal de la page.
- Transmise dans le fragment de l'URL (`#annonce=…`), qui n'est jamais envoyé à un serveur.
- Rien n'est conservé, sauf l'adresse d'Attesta choisie.

`icon.png` (128 × 128) est à fournir avant publication sur les boutiques d'extensions.
