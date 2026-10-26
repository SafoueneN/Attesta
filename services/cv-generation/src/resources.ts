import { normalize } from "./faithfulness.js";

/*
 * Ressources d'apprentissage du plan de progression (ADR 0029, point 4) : liens officiels tenus dans le
 * code. Le modèle n'écrit jamais d'URL ; une compétence absente du catalogue n'a simplement pas de lien.
 */

const CATALOG: [string[], { title: string; url: string }[]][] = [
  [["python"], [{ title: "Tutoriel officiel Python", url: "https://docs.python.org/fr/3/tutorial/" }]],
  [
    ["sql", "postgresql"],
    [{ title: "Tutoriel PostgreSQL", url: "https://www.postgresql.org/docs/current/tutorial.html" }],
  ],
  [
    ["tableau"],
    [{ title: "Formations gratuites Tableau", url: "https://www.tableau.com/fr-fr/learn/training" }],
  ],
  [
    ["power bi"],
    [
      {
        title: "Parcours Power BI (Microsoft Learn)",
        url: "https://learn.microsoft.com/fr-fr/training/powerplatform/power-bi",
      },
    ],
  ],
  [["excel"], [{ title: "Formation Excel (Microsoft)", url: "https://support.microsoft.com/fr-fr/excel" }]],
  [
    ["javascript"],
    [{ title: "Guide JavaScript (MDN)", url: "https://developer.mozilla.org/fr/docs/Web/JavaScript/Guide" }],
  ],
  [
    ["typescript"],
    [{ title: "Manuel TypeScript", url: "https://www.typescriptlang.org/docs/handbook/intro.html" }],
  ],
  [["react"], [{ title: "Apprendre React", url: "https://fr.react.dev/learn" }]],
  [["node js", "node"], [{ title: "Apprendre Node.js", url: "https://nodejs.org/fr/learn" }]],
  [["java"], [{ title: "Tutoriels Java (Oracle)", url: "https://dev.java/learn/" }]],
  [["docker"], [{ title: "Bien démarrer avec Docker", url: "https://docs.docker.com/get-started/" }]],
  [["kubernetes"], [{ title: "Tutoriels Kubernetes", url: "https://kubernetes.io/fr/docs/tutorials/" }]],
  [["git"], [{ title: "Livre Pro Git", url: "https://git-scm.com/book/fr/v2" }]],
  [["aws"], [{ title: "AWS Skill Builder", url: "https://skillbuilder.aws/" }]],
  [
    ["azure"],
    [{ title: "Azure (Microsoft Learn)", url: "https://learn.microsoft.com/fr-fr/training/azure/" }],
  ],
  [
    ["gcp", "google cloud"],
    [{ title: "Google Cloud Skills Boost", url: "https://www.cloudskillsboost.google/" }],
  ],
  [["php"], [{ title: "Manuel PHP", url: "https://www.php.net/manual/fr/" }]],
  [["symfony"], [{ title: "Documentation Symfony", url: "https://symfony.com/doc/current/index.html" }]],
  [["angular"], [{ title: "Tutoriels Angular", url: "https://angular.dev/tutorials" }]],
  [["vue"], [{ title: "Guide Vue.js", url: "https://fr.vuejs.org/guide/introduction" }]],
  [
    ["spark"],
    [
      {
        title: "Démarrage rapide Apache Spark",
        url: "https://spark.apache.org/docs/latest/quick-start.html",
      },
    ],
  ],
  [["r"], [{ title: "R pour la science des données", url: "https://r4ds.hadley.nz/" }]],
  [["scrum", "agile"], [{ title: "Guide Scrum", url: "https://scrumguides.org/" }]],
  [["sap"], [{ title: "SAP Learning", url: "https://learning.sap.com/" }]],
  [["salesforce"], [{ title: "Trailhead (Salesforce)", url: "https://trailhead.salesforce.com/fr" }]],
  [["looker"], [{ title: "Documentation Looker", url: "https://cloud.google.com/looker/docs" }]],
  [["dbt"], [{ title: "Cours gratuits dbt", url: "https://learn.getdbt.com/" }]],
  [
    ["airflow"],
    [
      {
        title: "Tutoriels Apache Airflow",
        url: "https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html",
      },
    ],
  ],
  [
    ["anglais", "english"],
    [{ title: "Cours d'anglais (British Council)", url: "https://learnenglish.britishcouncil.org/" }],
  ],
  [
    ["allemand", "deutsch"],
    [{ title: "Cours d'allemand (Goethe-Institut)", url: "https://www.goethe.de/fr/spr/ueb.html" }],
  ],
];

/** Ressources d'une compétence : correspondance exacte d'un des noms, après normalisation. */
export function resourcesFor(skill: string): { title: string; url: string }[] {
  const key = normalize(skill).trim();
  return CATALOG.find(([names]) => names.some((n) => normalize(n).trim() === key))?.[1] ?? [];
}
