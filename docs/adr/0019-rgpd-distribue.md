# ADR 0019 : RGPD dans une architecture répartie

- Statut : accepté le 2026-10-18 ; prolonge l'[ADR 0006](0006-donnees-personnelles-securite.md) et
  l'[ADR 0010](0010-veille-comptes-envoi.md). Information de conception, pas un avis juridique.
- Décideurs : chef de projet

## Contexte

Dans le monolithe, la suppression d'un compte est une transaction unique et l'export une requête. Après le
découpage, les données d'une personne sont réparties dans six bases. Les droits d'accès, de portabilité
et d'effacement (art. 15, 17 et 20) doivent rester complets, et le consentement à la veille explicite.

## Décision

1. **Carte des données** : chaque service documente dans son `README.md` les données personnelles qu'il
   détient, leur finalité et leur durée de conservation ; `docs/conformite.md` les agrège.
2. **Suppression de compte** (cohérence à terme, idempotente) :
   1. l'utilisateur confirme ; `auth` passe le compte en `suppression_en_cours`, révoque tous ses jetons
      et écrit une ligne d'**outbox** par service détenteur, dans la même transaction ;
   2. un job pg-boss d'`auth` appelle `DELETE /internal/v1/users/{id}` sur chaque service, avec un jeton
      de service de portée `users:delete` ; chaque service efface tout et répond `204`, même s'il n'avait
      rien ;
   3. reprises avec recul exponentiel pendant 24 h, puis alerte dans les journaux ;
   4. quand tous ont répondu, `auth` efface le compte et garde une trace d'audit **sans donnée
      personnelle** (identifiant, date, services confirmés).

   L'utilisateur voit immédiatement « Vos données ont été effacées » : ses jetons sont révoqués dès
   l'étape 1, et aucun service ne sert de données sans jeton valide.

3. **Export** : `GET /v1/me/export` sur `auth` agrège en JSON les réponses de
   `GET /internal/v1/users/{id}/export` de chaque service (jeton de portée `users:export`, délai de 10 s
   par service). Un service injoignable fait échouer l'export avec un message clair, plutôt que de
   produire une archive incomplète.
4. **Consentements** : `auth` journalise ceux du service et de la politique de confidentialité ;
   `job-watch` journalise le consentement à la veille et gère le double opt-in et le désabonnement en un
   clic (RFC 8058), comme aujourd'hui. La suppression du compte retire le consentement à la veille.
5. **Données d'invité** (parcours anonyme) : chaque service purge les données liées à un `sub` d'invité
   après 24 h (job de purge par service), comme la session actuelle.
6. **Journaux sans donnée personnelle** : `packages/logger` masque les champs sensibles ; aucun service
   ne journalise d'e-mail, de nom, de texte de CV, d'offre ou de prompt, ni d'identifiant d'utilisateur.
   La CI cherche dans les journaux de la pile E2E les noms et adresses saisis par les tests (contrôle
   existant, étendu à tous les services).
7. **Journal d'audit** (`attesta_auth.audit_event`) : connexion, déconnexion, export, suppression,
   changement de consentement, avec la date et le type d'événement, sans adresse IP en clair (HMAC, comme
   `consent_log`).

## Options considérées

| Option                                      | Couplage | Garantie d'effacement     | Complexité                |
| ------------------------------------------- | -------- | ------------------------- | ------------------------- |
| A. Outbox + appels idempotents (retenue)    | faible   | à terme, tracée           | moyenne                   |
| B. Appels synchrones en série depuis `auth` | fort     | partielle en cas de panne | faible                    |
| C. Transaction distribuée (2PC)             | fort     | immédiate                 | élevée, non supportée ici |

## Conséquences

- Plus facile : chaque service reste maître de l'effacement de ses données ; un nouveau service ajoute
  une ligne d'outbox.
- Plus difficile : il faut tester l'idempotence et les reprises (panne simulée d'un service).
- Contrôle de la Phase 4 : suppression et export agrégés vérifiés de bout en bout.
