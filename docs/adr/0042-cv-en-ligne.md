# ADR 0042 : CV en ligne partageable

- Statut : **proposé** le 2026-10-25, à valider par le chef de projet ; **complète** l'ADR
  [0018](0018-rendu-pdf-centralise.md)
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

Les candidats collent un lien vers leur CV dans LinkedIn ou un e-mail ; les concurrents (Kickresume,
Resume.io) proposent un CV en ligne avec le nombre de consultations.

## Décision

1. **Instantané** : à la création du lien, le CV est rendu en HTML (même gabarit que le PDF : modèle,
   usages du pays, photo) et stocké (`cv_share`, letters-export). Le lien ne change pas si le CV évolue :
   le candidat en crée un nouveau.
2. **Lien secret** : jeton aléatoire de 24 octets, seule son empreinte SHA-256 est stockée ; 90 jours ;
   révocable ; comptes seulement ; relecture du CV et consentement explicite exigés (« mes coordonnées
   seront visibles par toute personne qui reçoit ce lien »).
3. **Lecture publique** `GET /v1/public/cv/{token}` (route publique de la gateway) : `noindex`,
   `no-referrer`, aucun script ni ressource externe (CSP), compteur de consultations et date de la
   dernière. Page `/cv-en-ligne/{token}` du frontend, cadre isolé (`sandbox`).
4. RGPD : liens effacés avec le compte, listés dans l'export ; liens expirés purgés.

## Conséquences

- Le CV partagé est une donnée personnelle publique par lien : le consentement est demandé à chaque
  création, et la révocation est immédiate.
