# ADR 0027 : Pièces justificatives jointes au profil

- Statut : **proposé** le 2026-10-23, à valider par le chef de projet ; **précise** les ADR
  [0003](0003-pipeline-llm.md) (vocabulaire de la fidélité) et [0019](0019-rgpd-distribue.md) (nouvelle
  donnée personnelle)
- Décideurs : chef de projet (validation), équipe

## Contexte

Le contrôle de fidélité garantit qu'une ligne du CV renvoie à un fait du profil : l'IA n'invente rien. Il ne
dit rien de la véracité du profil lui-même, que le candidat déclare. Le mot « Prouvé » affiché sur les lignes
laissait pourtant croire à une vérification. Les candidats veulent aussi pouvoir appuyer leurs déclarations
(diplôme, attestation d'employeur, certificat de langue) et les montrer au recruteur s'ils le souhaitent.

## Décision

1. **Trois niveaux, nommés honnêtement** : _déclaré_ (fait du profil), _sourcé_ (ligne du CV rattachée à un
   fait du profil, ce que garantit le contrôle) et _justifié_ (le fait est accompagné d'une pièce jointe par
   le candidat). « Prouvé » disparaît de l'interface. Attesta ne certifie aucune pièce : l'interface le dit.
2. **Les pièces appartiennent au service `profiles`**, propriétaire du profil (ADR 0013) : table
   `profile_evidence`, rattachée à un élément du profil par pointeur JSON (`/work/0`, `/education/1`,
   `/certificates/0`, `/languages/0`) avec le libellé de l'élément au moment du dépôt ; si l'élément change
   ensuite, la pièce est signalée « à rattacher de nouveau » plutôt que de justifier un autre fait.
3. **Fichiers acceptés** : PDF, PNG, JPEG, vérifiés par leur signature, 5 Mo au plus, 20 pièces au plus par
   compte. Réservé aux comptes (pas aux invités, dont les données sont effacées sous 24 heures).
4. **Chiffrement au repos** (AES-256-GCM, clé `EVIDENCE_KEY` du service, jamais en base), **jamais envoyées
   à un modèle d'IA** (aucun chemin vers `llm-client`), jamais journalisées.
5. **Partage au choix du candidat** : à l'export du CV, il coche les pièces à joindre ; `letters-export` les
   obtient de `profiles` par une route interne **avec le jeton du candidat relayé** (comme pour son profil) :
   un service ne peut lire que les pièces de l'utilisateur qui le demande, sans nouvelle portée de service.
   Une annexe « Justificatifs » est ajoutée après le CV. Rien n'est partagé sans ce choix.
6. **Dépendance** : `pdf-lib` dans `letters-export` — fusionner des PDF existants et intégrer des images à un
   PDF, ce que le rendu Chromium ne sait pas faire ; bibliothèque pure JavaScript, licence MIT.
7. **RGPD** : l'export de données contient la liste des pièces (métadonnées) ; chaque fichier se télécharge
   depuis la page « Mes justificatifs ». Suppression d'une pièce à tout moment ; toutes les pièces sont
   effacées avec le profil ou le compte.

## Options considérées

| Sujet        | Option retenue                         | Option écartée                    | Raison                                                     |
| ------------ | -------------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| Propriétaire | `profiles`                             | Nouveau service « documents »     | la pièce n'a de sens qu'avec le fait qu'elle appuie        |
| Stockage     | PostgreSQL (`bytea` chiffré)           | Stockage objet (S3, GCS)          | volume faible (≤ 100 Mo par compte), pile locale inchangée |
| Partage      | Annexe PDF choisie à l'export          | Lien de vérification public       | aucune surface publique nouvelle                           |
| Vérification | Aucune (pièce fournie par le candidat) | Vérification auprès des émetteurs | hors périmètre ; attestations signées à étudier plus tard  |

## Conséquences

- Plus facile : le candidat peut appuyer ses déclarations, et le vocabulaire ne promet plus ce qu'Attesta ne
  vérifie pas.
- Plus difficile : `profiles` stocke des fichiers sensibles (clé à gérer, sauvegardes plus lourdes) ;
  `letters-export` dépend de `profiles` pour l'annexe.
- À revoir : stockage objet si le volume grandit ; attestations vérifiables (diplômes numériques signés).
