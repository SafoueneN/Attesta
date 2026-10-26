# ADR 0039 : Mot de passe oublié par codes de récupération

- Statut : **proposé** le 2026-10-24, à valider par le chef de projet ; **complète** l'ADR
  [0030](0030-comptes-identifiant-mot-de-passe.md)
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

Les comptes par identifiant n'ont pas d'adresse e-mail (ADR 0030) : un mot de passe oublié faisait perdre
le compte. Un lien de réinitialisation par e-mail est impossible.

## Décision

1. **Codes de récupération** (pratique de GitHub, Proton, Google) : 8 codes à usage unique (« K7QM-4XRT »,
   alphabet sans caractères ambigus), remis **une seule fois** à la création du compte, avec copie et
   téléchargement ; seule leur empreinte SHA-256 est stockée (`recovery_code`). Régénérables depuis le
   compte (les anciens sont annulés).
2. **Mot de passe oublié** (`POST /v1/password/reset`, public) : identifiant, un code inutilisé, nouveau
   mot de passe ; le code est consommé, toutes les sessions sont révoquées, une nouvelle est ouverte. Même
   message pour un identifiant inconnu ou un code faux ; 10 essais par identifiant et par quart d'heure,
   plafond par IP à la gateway.
3. **Changement de mot de passe** (`PUT /v1/me/password`) : l'actuel est exigé ; les autres sessions sont
   révoquées.
4. `Me.recoveryCodesLeft` : la page Compte invite à régénérer quand il n'en reste plus.

## Conséquences

- Un candidat qui perd mot de passe **et** codes perd son compte : c'est le prix d'un compte sans e-mail,
  annoncé à la création. Une récupération par l'adresse de la veille pourra s'ajouter.
