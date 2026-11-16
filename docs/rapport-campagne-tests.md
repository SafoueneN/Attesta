# Rapport de campagne de tests — Attesta

**Édition :** 26 octobre 2026 · **Périmètre :** dépôt local, services et frontend · **Statut :** campagne partielle, résultats mixtes

Ce rapport consolide les éléments du [plan de tests](plan-de-tests.md), de la suite actuelle et des exécutions locales de cette campagne. Les nombres marqués « exécutés » proviennent des commandes lancées le 26 octobre 2026. Les scénarios simplement présents dans le code ou les workflows ne sont pas présentés comme passés.

## 1. Synthèse avant / après

| Indicateur          | Avant — dernier état documentaire disponible                                                                                                        | Après — vérifications du 26/10/2026                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Couverture          | Le plan de tests mentionne un seuil global de 75 % et 90 % pour le schéma. `docs/questions.md` cite 91 % de lignes, sans rapport brut daté attaché. | Service `auth` : **92,30 % lignes**, 90,67 % instructions, 80,66 % branches et 92,12 % fonctions. La couverture globale n’a pas pu être certifiée : la suite globale échoue sur quatre délais Puppeteer/Chromium. |
| Tests racine        | Le compte rendu de phase indiquait des suites vertes et ≥75 % de lignes, mais renvoyait à un rapport de phase non présent dans le dépôt.            | `npm test` : **234 réussis, 4 échoués, 40 ignorés** (278 au total). L’échec empêche de qualifier la campagne globale de verte.                                                                                    |
| Tests frontend      | Les tests existaient ; pas de résultat récent consolidé dans le dépôt.                                                                              | `frontend`: **25/25 réussis**.                                                                                                                                                                                    |
| Mutation            | Aucun score ni rapport de mutation antérieur n’est fourni par le compte rendu.                                                                      | `auth/src/passwords.ts`: **82 mutants tués sur 88, score brut 93,2 %** ; 3 survivants et 3 expirations. Le score dépasse le seuil Stryker haut de 80 %. Rapports conservés avec ce document.                      |
| Tests de propriétés | Le plan précédent ne documentait pas de campagne `fast-check`.                                                                                      | Les six suites ciblées des services passent : **332 tests réussis**. Les assertions génératives couvrent 22 propriétés de domaine.                                                                                |
| Parcours navigateur | Le plan décrit Playwright, l’accessibilité et la parité, sans exécution GitHub attestée.                                                            | Les 13 scénarios de recette frontend sont présents, mais non exécutés ici faute de pile compose complète. Deux captures authentiques du frontend local sont jointes.                                              |

La comparaison de couverture est indicative : les 91 % sont une référence historique globale et les 92,30 % mesurent seulement le service `auth`. Les périmètres ne sont pas identiques.

**Conclusion de campagne :** les preuves nouvelles sont bonnes pour le frontend, les propriétés et l’authentification. La campagne complète reste **non concluante** tant que les délais Chromium/Puppeteer ne sont pas résolus et que l’intégration complète et GitHub Actions n’ont pas été observées en vert.

## 2. Résultats exécutés

| Commande / cible                         |                                                                             Résultat | Interprétation                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | -----------------------------------------------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` à la racine                   | 18 fichiers passés, 4 en échec, 3 ignorés ; 234 tests passés, 4 en échec, 40 ignorés | Les 4 échecs sont liés à Puppeteer/Chromium : attente de 30 s lors du lancement/rendu PDF. Ils touchent `packages/llm/test/extraction.test.ts` et `apps/web/test/ia.test.ts`; les suites `packages/render/test/pdf-ats.test.ts` et `report.test.ts` sont signalées en échec après le même délai.                                                                                                                        |
| `npm run test:coverage` à la racine      |                 Même résultat fonctionnel ; aucun rapport global exploitable produit | Ne pas reprendre les chiffres historiques comme couverture actuelle certifiée.                                                                                                                                                                                                                                                                                                                                          |
| `frontend`: `npm test`                   |                                                         4 fichiers, **25/25 passés** | Tests unitaires composants, pages et client API simulé.                                                                                                                                                                                                                                                                                                                                                                 |
| Six fichiers de propriétés des services  |                                                       6 fichiers, **332/332 passés** | Résultats : auth 22, profiles 109, jobs-matching 30, cv-generation 144, letters-export 13, job-watch 14.                                                                                                                                                                                                                                                                                                                |
| `services/auth`: `npm run test:coverage` |                                                         6 fichiers, **86/86 passés** | Lignes 92,30 % ; branches 80,66 % ; fonctions 92,12 % ; instructions 90,67 %.                                                                                                                                                                                                                                                                                                                                           |
| `services/auth`: `npm run test:mutation` |           88 mutants analysés dans le rapport ; 82 tués, 3 survivants, 3 expirations | Score brut 93,2 % (seuil haut Stryker : 80 %). Le processus a également signalé un refus Windows lors de `taskkill` à l’arrêt du runner ; les statuts individuels du rapport généré sont utilisés, mais la commande ne doit pas encore être considérée comme une exécution CI propre. Voir le [rapport Stryker HTML](rapport-tests/artifacts/index.html) et son [résultat JSON](rapport-tests/artifacts/mutation.json). |

Les délais Puppeteer sont des échecs observés dans cet environnement Windows local. Ils ne prouvent pas à eux seuls une régression produit ; ils restent néanmoins bloquants pour un résultat vert.

## 3. Score de mutation par fonction

Stryker a ciblé `services/auth/src/passwords.ts`. Le score ci-dessous est calculé comme `mutants tués / mutants générés` ; les expirations comptent comme non tuées.

| Fonction / règle métier                                |   Tués | Survivants | Expirations |  Total |      Score |
| ------------------------------------------------------ | -----: | ---------: | ----------: | -----: | ---------: |
| Constante `PARAMS` — coût de dérivation                |      1 |          0 |           0 |      1 |  **100 %** |
| `derive` — dérivation scrypt et normalisation          |      8 |          0 |           0 |      8 |  **100 %** |
| `hashPassword` — création de l’empreinte               |      6 |          0 |           0 |      6 |  **100 %** |
| `validParams` — bornes des paramètres d’empreinte      |     36 |          2 |           3 |     41 | **87,8 %** |
| `verifyPassword` — validation et comparaison constante |     28 |          1 |           0 |     29 | **96,6 %** |
| `decoyHash` — empreinte leurre mise en cache           |      3 |          0 |           0 |      3 |  **100 %** |
| **Total**                                              | **82** |      **3** |       **3** | **88** | **93,2 %** |

Les points faibles sont concentrés dans les cas limites de validation des paramètres scrypt. Étape recommandée : ajouter des exemples déterministes sur les bornes exactes et leurs valeurs adjacentes, puis relancer Stryker sur `auth`. Les cinq survivants/expirations ne sont pas assimilés à des défauts produits : ils signalent des tests manquants ou trop lents à examiner.

## 4. User stories et recette fonctionnelle

La suite Playwright [e2e/frontend/recette.spec.ts](../e2e/frontend/recette.spec.ts) définit 13 scénarios visibles côté utilisateur et une capture par étape clé (`CAPTURES_DIR`). Elle n’a pas été exécutée pendant cette campagne, car elle requiert les services de la pile compose.

| ID   | User story vérifiée par la recette                                                  |
| ---- | ----------------------------------------------------------------------------------- |
| US01 | Créer un compte avec identifiant et codes de récupération, sans e-mail obligatoire. |
| US02 | Se connecter ; refuser un mauvais mot de passe sans révéler si le compte existe.    |
| US03 | Importer un CV PDF et obtenir un profil prérempli à relire.                         |
| US04 | Parcourir et filtrer le catalogue d’offres par pays.                                |
| US05 | Générer un CV ciblé dont chaque ligne est contrôlée contre le profil.               |
| US06 | Exporter en PDF et Word en tenant compte du modèle et du pays.                      |
| US07 | Créer un lien de partage secret et révocable pour le CV.                            |
| US08 | Rédiger une lettre de motivation liée aux faits du CV.                              |
| US09 | Consulter et modifier la veille emploi et son consentement.                         |
| US10 | Suivre une candidature par étape.                                                   |
| US11 | Faire évaluer la fidélité du CV par l’assistant IA.                                 |
| US12 | Contrôler l’accès administrateur et l’absence de données personnelles visibles.     |
| US13 | Supprimer son compte et les données associées au titre du RGPD.                     |

Les tests E2E plus anciens de [parité](../e2e/parite/) couvrent également les libellés, les rôles ARIA, les URL, les e-mails reçus, les erreurs HTTP, la navigation clavier, les exports PDF et les protections CSRF. La recette frontend et la parité sont deux suites distinctes.

## 5. Approche boîte noire et tests fonctionnels automatisés

- **API et contrats :** les suites `tests/app.test.ts`, `tests/openapi.test.ts` et `tests/upstreams.test.ts` des services vérifient les routes, schémas, réponses d’erreur, validations et comportements d’intégration à la frontière HTTP.
- **Expériences utilisateur :** Playwright interagit par libellés, rôles ARIA, URL, téléchargements et messages visibles, plutôt que par détails internes du DOM. Les parcours ciblent le CV, les comptes, les consentements, la veille, les partages, les candidatures et l’effacement.
- **Accessibilité :** axe-core est appelé par les parcours navigateur sur plusieurs pages ; le lecteur d’écran et certaines vérifications manuelles WCAG restent à faire.
- **Exports :** les tests PDF valident l’extraction de texte, les liens et le contenu ATS ; ils font partie des scénarios touchés par les délais Chromium locaux.
- **Doubles et réponses simulées :** `packages/llm/test/*` utilise `ScriptedProvider` pour les réponses valides, invalides, les erreurs et les relances ; les `tests/app.test.ts` des services injectent aussi ce fournisseur simulé. Les tests de connecteurs remplacent les sources d’offres et SMTP par des réponses enregistrées ou faux fournisseurs. Cela limite le non-déterminisme et évite les appels réseau pendant ces tests. La commande racine a exécuté les tests du monolithe, mais pas les six suites `app.test.ts` des services extraits.

Les tests fonctionnels automatisés de la suite frontend passent (25/25). Les 13 parcours E2E, les intégrations PostgreSQL et la suite complète de parité restent à exécuter sur la pile de services.

## 6. Tests unitaires, boîte blanche et couverture

La boîte blanche s’appuie sur Vitest, la couverture V8, les branches métier et les erreurs contrôlées : schémas, import de CV, fidélité, normalisation des données, mots de passe, bornes scrypt, rendu et classement. La campagne d’authentification mesurée apporte les résultats par fichier suivants :

| Fichier        |  Lignes | Branches | Fonctions | Observation                                                                                           |
| -------------- | ------: | -------: | --------: | ----------------------------------------------------------------------------------------------------- |
| `cookies.ts`   |   100 % |   87,5 % |     100 % | Couvert dans la campagne.                                                                             |
| `keys.ts`      | 96,55 % |  88,88 % |     100 % | Quelques lignes de configuration restent non couvertes.                                               |
| `mail.ts`      | 57,14 % |      0 % |   71,42 % | Principal déficit : erreurs et voies d’envoi.                                                         |
| `passwords.ts` |   100 % |  95,45 % |    87,5 % | Très bonne couverture des lignes ; les mutants montrent encore des lacunes de sensibilité aux bornes. |
| `rgpd.ts`      | 48,88 % |  47,05 % |   33,33 % | Effacement/export et chemins de gouvernance à renforcer.                                              |
| `routes.ts`    | 98,94 % |  83,49 % |     100 % | Les branches principales des routes sont exercées.                                                    |
| `store.ts`     | 96,96 % |  77,14 % |   97,72 % | Quelques chemins de stockage restent non parcourus.                                                   |

La couverture de lignes élevée n’implique pas que les tests détectent toutes les erreurs : le score de mutation de `validParams` l’illustre. Priorités de couverture : consentement et effacement RGPD (`rgpd.ts`), voies d’envoi et erreurs SMTP (`mail.ts`), puis mutants survivants sur les paramètres scrypt.

## 7. Fuzzing par propriétés (Hypothesis / fast-check)

Le dépôt TypeScript utilise **fast-check**, l’approche de tests de propriétés comparable à Hypothesis, plutôt que la bibliothèque Python Hypothesis. Les générateurs produisent des entrées variables et réduisent les contre-exemples. Les six fichiers ciblés ont réussi **332 tests Vitest** :

| Service          | Cibles de propriétés                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `auth`           | Mot de passe cohérent avec son empreinte, données d’empreinte corrompues, normalisation idempotente des codes de récupération. |
| `profiles`       | Textes de CV variés, extraction/import par règles, normalisation des compétences et langues.                                   |
| `jobs-matching`  | Variantes de villes et entrées de géolocalisation/recherche.                                                                   |
| `cv-generation`  | Fidélité : aucune ligne non sourcée, quantités et variantes linguistiques générées.                                            |
| `letters-export` | Règles et normes de CV appliquées à des profils générés.                                                                       |
| `job-watch`      | Écarts de compétences, déduplication et bornes de résultats sur des offres générées.                                           |

Les graines et cas sont définis dans les tests ; tout contre-exemple trouvé par fast-check peut être réduit et rejoué. Les tests génératifs tournent localement sur les six suites citées. La CI GitHub n’a pas encore été observée en exécution.

## 8. Évaluation IA et appels simulés

Les tests automatisés des niveaux unitaires, contrat et parcours ne dépendent pas d’un modèle réel. Les réponses LLM sont simulées et validées par schéma, avec cas invalides, relances et erreurs. Le jeu de fidélité en rejeu historique comprend 4 cas et a retiré 7 inventions sur 7, sans faux positif indiqué par le plan de tests.

L’évaluation `evals:live` avec Vertex/Claude n’a pas été exécutée faute d’identifiants. Le jeu annoté de 50 offres pour précision@10/rappel@20 reste à constituer. Les conclusions sur les tests IA portent donc sur les contrats et jeux rejoués, pas sur la qualité statistique du modèle en production.

## 9. GitHub Actions et intégration continue

Les workflows [ci.yml](../.github/workflows/ci.yml) et [mutation.yml](../.github/workflows/mutation.yml) sont définis dans le dépôt :

- la CI se déclenche sur les PR et les pushs sur `main` ; elle prévoit lint, types, migrations montée/descente/remontée, audit des dépendances, tests de chaque unité, secrets, Terraform, commitlint, parité Playwright et vérification de l’image Docker ;
- les tests en matrice limitent les unités exécutées aux changements d’une PR, et toutes les unités sur `main` ;
- la suite de mutation est séparée de la CI rapide, planifiée chaque lundi à 04:00 UTC et lançable manuellement ; elle vise les six services et conserve les rapports Stryker comme artefacts 14 jours ;
- le déploiement reste conditionné à une configuration Google Cloud.

**État GitHub : non vérifié.** Les workflows sont présents localement, mais aucun lien de run GitHub vert n’est disponible dans le dépôt ou dans cette session. Le score auth obtenu ici ne vaut pas preuve du job GitHub. Le rapport Stryker contient ses résultats JSON/HTML locaux ; la commande doit être relancée dans un environnement où l’arrêt des workers Windows ne retourne pas `taskkill` accès refusé.

## 10. Captures de la plateforme

Les deux images ont été capturées le 26 octobre 2026 depuis le frontend React local sur Chromium Playwright. Il s’agit de l’interface publique de démonstration, sans session authentifiée ; les contenus visibles sont des données de démonstration.

![Accueil Attesta sur le frontend local](rapport-tests/captures/01-accueil-attesta.png)

_Figure 1 — Page d’accueil et démonstration du CV sourcé._

![Parcours avant/après du CV](rapport-tests/captures/02-avant-apres-cv.png)

_Figure 2 — Comparaison visuelle entre un CV non vérifiable et un CV sourcé._

Les captures étape par étape des 13 user stories sont prévues par la suite E2E via `CAPTURES_DIR`. Elles n’ont pas été produites dans cette campagne : l’authentification, l’API et la base nécessitent la pile compose complète. Reproduction des deux captures locales : démarrer le frontend puis exécuter `node scripts/capture-platform-report.mjs`.

## 11. Actions de suivi

1. Corriger l’environnement Chromium/Puppeteer ou adapter les tests PDF pour qu’ils terminent sans délai de 30 s ; relancer `npm test` et `npm run test:coverage` à la racine.
2. Ajouter des tests de frontière pour `validParams`, puis relancer la mutation sur `auth` et vérifier une fin de commande propre.
3. Renforcer `rgpd.ts` et `mail.ts`, où la couverture des lignes mesurée est respectivement de 48,88 % et 57,14 %.
4. Démarrer la pile compose et exécuter `npx playwright test e2e/frontend/recette.spec.ts` avec `CAPTURES_DIR`, puis joindre les captures produites et les résultats axe-core.
5. Déclencher la CI sur GitHub et archiver les liens de runs ; exécuter ensuite la mutation planifiée pour les six services.
6. Garder en attente les affirmations de qualité sur le modèle réel et le ranking tant que `evals:live` et le jeu annoté matching ne sont pas exécutés.

## Références du dépôt

- [Plan de tests](plan-de-tests.md)
- [ADR 0046 — mutation et tests de propriétés](adr/0046-tests-de-mutation-et-proprietes.md)
- [Recette Playwright frontend](../e2e/frontend/recette.spec.ts)
- [Configuration Vitest racine](../vitest.config.ts)
- [CI GitHub Actions](../.github/workflows/ci.yml)
- [Mutation GitHub Actions](../.github/workflows/mutation.yml)
