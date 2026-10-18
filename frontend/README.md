# Frontend

> Statut : **pas encore de code** ; construit en Phase M5 ([ADR 0022](../docs/adr/0022-frontend-react.md)).

Application web d'Attesta : React, Vite, TypeScript strict, Tailwind CSS, React Router, TanStack Query.
Elle consomme **uniquement la gateway** (`/api/*`, même origine). Port de développement : 5173 ; servie par
nginx sur le port 8080 dans compose.

## Pages prévues

| Route              | Page                                                                  | Accès            |
| ------------------ | --------------------------------------------------------------------- | ---------------- |
| `/`                | Accueil                                                               | public           |
| `/connexion`       | Connexion et inscription par lien magique                             | public           |
| `/tableau-de-bord` | Tableau de bord                                                       | candidat         |
| `/profil/etape/:n` | Profil en 5 étapes, import d'un CV PDF                                | invité, candidat |
| `/offres`          | Offres et analyse de compatibilité                                    | invité, candidat |
| `/cv/generer`      | Génération, aperçu, relecture ligne par ligne avec la source          | invité, candidat |
| `/cv`              | Mes CV                                                                | candidat         |
| `/lettres`         | Lettres de motivation                                                 | candidat         |
| `/veille`          | Veille emploi : alertes et rapports                                   | candidat         |
| `/parametres`      | Paramètres, export et suppression du compte (RGPD)                    | candidat         |
| `/admin`           | Santé des services, coûts LLM ([ADR 0024](../docs/adr/0024-roles.md)) | administrateur   |
| `*`                | Page introuvable                                                      | public           |

## Structure prévue

```
src/
  api/          seule couche qui appelle fetch : client, refresh du jeton, une fonction par opération
  hooks/        hooks React Query (useProfile, useGeneration…)
  pages/        une page par route
  components/   composants d'interface (jetons de design Tailwind)
  routes/       routeur, routes protégées par rôle
  lib/          toasts, focus, formatage
tests/          Vitest + Testing Library ; e2e Playwright + axe-core à la racine (e2e/)
```
