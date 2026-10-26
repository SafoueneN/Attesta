# ADR 0030 : Comptes par identifiant et mot de passe ; l'adresse e-mail n'est saisie que dans la veille

- Statut : **proposé** le 2026-10-24, à valider par le chef de projet ; **remplace** le point 2 (« comptes
  sans mot de passe ») de l'ADR [0010](0010-veille-comptes-envoi.md), et son double opt-in de la veille
- Décideurs : chef de projet (validation), équipe

## Contexte

L'ADR 0010 a retenu des comptes sans mot de passe : un lien de connexion envoyé par e-mail. Chaque connexion
dépend donc de l'envoi d'un e-mail, et une panne ou une mauvaise configuration SMTP bloque toute connexion.
Le porteur du projet veut que l'utilisateur crée seul son compte, sans e-mail, et n'indique une adresse que
là où il veut recevoir les rapports de veille.

## Décision

1. **Création de compte par identifiant et mot de passe** (`POST /v1/accounts`) : identifiant de 3 à 30
   caractères (`[a-z0-9._-]`, en minuscules), mot de passe de 10 à 128 caractères, acceptation de la
   politique journalisée comme avant. Aucune adresse e-mail n'est demandée ni stockée par `auth`.
2. **Connexion** (`POST /v1/session/password`) : même session qu'avant (jeton d'accès de 15 min, refresh
   token tourné en cookie HttpOnly, ADR 0014). Message unique « identifiant ou mot de passe incorrect » ; un
   identifiant inconnu coûte le même calcul qu'un échec, pour ne pas révéler les comptes existants. Dix
   échecs par identifiant et par quart d'heure, en plus du plafond par IP de la gateway.
3. **Empreinte scrypt** de `node:crypto` (N = 2^15, r = 8, p = 1, sel de 16 octets), format auto-décrit
   `scrypt$N$r$p$sel$empreinte`. Aucune dépendance ajoutée.
4. **Administrateurs** : `ADMIN_USERNAMES` liste les identifiants administrateurs. Ils sont réservés : on ne
   peut pas les créer par l'inscription publique. Le compte est créé au démarrage avec `ADMIN_PASSWORD`
   (secret ; valeur de développement dans `compose.yaml` seulement) et n'est jamais modifié ensuite.
5. **Adresse de réception dans la veille, sans confirmation** (`job-watch`) : pour un compte par
   identifiant, l'adresse de la veille est obligatoire. À la demande du porteur du projet, la veille est
   **active dès l'enregistrement** : plus de lien de confirmation (le double opt-in de l'ADR 0010 est retiré).
   Le consentement coché reste journalisé, et chaque e-mail garde son lien de désabonnement en un clic. Les
   rapports quotidiens et les rappels (ADR 0029) partent à cette adresse. `UserContact.email` devient
   nullable.
6. **Anciens comptes par lien** : conservés (colonne `email` devenue facultative), routes `/v1/login-links`
   gardées pour eux mais plus proposées par l'interface. Leur retrait fera l'objet d'un ADR.

## Options considérées

- **E-mail + mot de passe** : écarté, l'utilisateur ne veut pas donner d'adresse pour créer son compte.
- **Lien magique et mot de passe** : écarté, deux parcours à maintenir et la dépendance SMTP demeure.
- **Fournisseur d'identité (Google, etc.)** : écarté pour l'instant, dépendance externe et données partagées.

## Conséquences

- Risque accepté : une adresse mal saisie, ou celle d'un tiers, reçoit les rapports jusqu'au désabonnement ;
  les rebonds suspendent la veille (ADR 0010). À réexaminer avant une ouverture au public.
- La connexion ne dépend plus de l'envoi d'e-mails ; seul la veille (confirmation, rapports, rappels) en a
  besoin.
- Pas de réinitialisation de mot de passe sans e-mail : un mot de passe oublié impose de créer un nouveau
  compte. Une réinitialisation par l'adresse confirmée de la veille pourra être ajoutée.
- Politique de confidentialité mise à jour (version du 2026-10-24).
- Tests à adapter à la passe finale : `e2e/support.ts` et les tests d'`auth` utilisent encore le lien de
  connexion.
