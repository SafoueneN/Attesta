# ADR 0036 : Usages du CV selon le pays visé, photo et informations personnelles

- Statut : **proposé** le 2026-10-24, à valider par le chef de projet ; **complète** l'ADR
  [0033](0033-pays-veille.md)
- Décideurs : porteur du projet, chef de projet (validation)

## Contexte

Les quatre pays de la plateforme n'ont pas les mêmes usages : un Lebenslauf allemand porte photo, date de
naissance, nationalité et une signature datée ; au Canada, photo, âge et nationalité sont à proscrire
(législation sur les droits de la personne) ; en Tunisie, photo et date de naissance sont attendues ; en
France, la photo est facultative. Un même CV partait partout.

## Décision

1. **Profil** : champs facultatifs `basics.birthDate`, `nationality`, `workPermit`, `drivingLicence`. Ils
   ne sont jamais transmis à l'IA (les assistants ne reçoivent que des éléments choisis du parcours) ni
   extraits d'un CV importé.
2. **Photo** : stockée à part dans `profiles` (table `profile_photo`, chiffrée AES-256-GCM comme les
   justificatifs, 2 Mo, JPEG ou PNG vérifiés par signature), une par compte ; ni dans les versions du
   profil, ni dans les CV générés, jamais envoyée à l'IA. Recadrée au format d'identité 3:4 dans le
   navigateur. Comptes seulement. Exportée (métadonnées) et effacée avec le compte.
3. **Export** : `CvExportRequest.norms` (`FR` par défaut). Règles (`render/norms.ts`) :

   | Pays | Photo   | Naissance | Nationalité | Autorisation | Permis | Signature       |
   | ---- | ------- | --------- | ----------- | ------------ | ------ | --------------- |
   | DE   | oui     | oui       | oui         | oui          | oui    | lieu, date, nom |
   | FR   | oui     | non       | non         | oui          | oui    | non             |
   | CA   | **non** | **non**   | **non**     | oui          | oui    | non             |
   | TN   | oui     | oui       | oui         | non          | oui    | non             |

   Les informations personnelles viennent du profil le plus récent ; les rubriques et lignes sourcées ne
   changent pas. Le pays est suggéré d'après l'offre (« (m/w/d) » : Allemagne) et modifiable à l'export.

## Conséquences

- Un CV conforme aux usages de chaque pays, sans ressaisie ; le Canada est protégé par défaut.
- La photo n'est jamais dans un prompt ni dans un journal.
- Tests à écrire à la passe finale (règles par pays, photo, export).
