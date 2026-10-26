#!/usr/bin/env node
// Données de démonstration : cinq candidats fictifs (chacun pensé pour une partie des fonctionnalités) et un administrateur, créés par l'API publique (la
// gateway), exactement comme le ferait un utilisateur. Aucun accès direct aux bases (règle 1 de CLAUDE.md) :
// chaque donnée traverse les vrais services, contrôle de fidélité compris. Comptes par identifiant et mot de
// passe (ADR 0030) ; veilles actives sans confirmation. Les rapports partent vers les adresses fictives : à
// lancer sur une pile sans --env-file .env.smtp (e-mails gardés par Mailpit). Pile locale uniquement ;
// relançable sans doublons.
//
//   docker compose --profile full up -d --wait
//   npm run demo:seed
//   (par le frontend, comme un utilisateur : DEMO_API=http://localhost:$FRONTEND_PORT, 8080 par défaut ;
//    MAILPIT_URL=http://localhost:8025)

const api = (process.env.DEMO_API ?? `http://localhost:${process.env.FRONTEND_PORT ?? 8080}`).replace(
  /\/$/,
  "",
);
const mailpit = (process.env.MAILPIT_URL ?? "http://localhost:8025").replace(/\/$/, "");
/** Identifiants : partie locale de l'adresse fictive (« lea.martin ») ; mot de passe commun, local seulement. */
const password = process.env.DEMO_PASSWORD ?? "demo-attesta-local";
const admin = { username: "admin", password: process.env.DEMO_ADMIN_PASSWORD ?? "admin-dev-uniquement" };
const usernameOf = (p) => p.email.split("@")[0];
/**
 * DEMO_ONLY=lea.martin,amina.diallo : seulement ces comptes. DEMO_WATCH=0 : ni veille ni rappels, pour une
 * pile qui envoie de vrais e-mails (--env-file .env.smtp) : le testeur saisit alors sa propre adresse.
 */
const only = process.env.DEMO_ONLY?.split(",")
  .map((u) => u.trim())
  .filter(Boolean);
const withWatch = process.env.DEMO_WATCH !== "0";

for (const url of [api, mailpit]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    console.error(`Refusé : ${url} n'est pas local. Les données fictives ne vont que sur la pile locale.`);
    process.exit(2);
  }
}

/* ---------------------------------------------------------------------------------------------------- */
/* Personnages et offres (fictifs)                                                                      */
/* ---------------------------------------------------------------------------------------------------- */

const PERSONAS = [
  {
    email: "lea.martin@demo.attesta.localhost",
    recipient: "lea.offres@demo.attesta.localhost",
    tone: "chaleureux",
    profile: {
      basics: {
        name: "Léa Martin",
        label: "Développeuse back-end",
        email: "lea.martin@demo.attesta.localhost",
        phone: "06 12 34 56 78",
        summary:
          "Développeuse back-end depuis 5 ans, spécialisée Node.js et PostgreSQL, attentive à la performance et à la qualité du code.",
        location: { city: "Lyon", countryCode: "FR" },
      },
      work: [
        {
          name: "Transports Rhône",
          position: "Développeuse back-end",
          location: "Lyon",
          startDate: "2021-03",
          highlights: [
            "Migration de 12 services Express vers Node.js 20",
            "Réduction de 40 % du temps de réponse de l'API de réservation",
            "Mise en place de tests d'intégration sur PostgreSQL avec Vitest",
            "Revue de code et accompagnement de 2 alternants",
          ],
        },
        {
          name: "Agence Pixel",
          position: "Développeuse web",
          location: "Villeurbanne",
          startDate: "2019-01",
          endDate: "2021-02",
          highlights: [
            "Développement de 8 sites e-commerce en Node.js et React",
            "Intégration de paiements Stripe pour 5 clients",
          ],
        },
      ],
      education: [
        { institution: "INSA Lyon", studyType: "Diplôme d'ingénieur", area: "Informatique", endDate: "2018" },
      ],
      skills: [
        { name: "Back-end", keywords: ["Node.js", "Express", "TypeScript", "REST"] },
        { name: "Données", keywords: ["PostgreSQL", "Redis"] },
        { name: "Qualité", keywords: ["Vitest", "Tests d'intégration", "Docker"] },
      ],
      languages: [
        { language: "Français", fluency: "Langue maternelle" },
        { language: "Anglais", fluency: "C1" },
      ],
    },
    offers: [
      `Développeur back-end Node.js (H/F) – Lyon
Rejoignez l'équipe plateforme de MobiLyon, éditeur d'applications de mobilité.
Missions : concevoir et maintenir des API REST en Node.js et TypeScript, optimiser les requêtes PostgreSQL, écrire des tests automatisés, participer aux revues de code.
Profil : 3 ans d'expérience minimum en Node.js, maîtrise de PostgreSQL, culture des tests. Une expérience de Kubernetes et de Kafka est un plus.
CDI, télétravail 2 jours par semaine.`,
      `Backend-Entwickler (m/w/d) Node.js – Berlin
Für unser Fintech-Team in Berlin suchen wir eine/n Backend-Entwickler/in.
Aufgaben: Entwicklung von REST-APIs mit Node.js und TypeScript, Datenbankdesign mit PostgreSQL, Docker-basierte Deployments, Code-Reviews.
Profil: mehrjährige Erfahrung mit Node.js, gute Englischkenntnisse, Erfahrung mit Docker. AWS-Kenntnisse wünschenswert.
Unbefristet, Vollzeit, hybrides Arbeiten.`,
    ],
    watch: { occupations: ["Backend-Entwickler", "Développeur back-end"], country: "DE", city: "Berlin" },
    // Mobilité vers l'Allemagne : traductions du CV et de la lettre, offre en allemand.
    scenario: {
      ats: { apply: 1 },
      translate: ["de", "en"],
      letterTranslate: "de",
      reminders: [
        { kind: "relance", inDays: 2, title: "Relancer MobiLyon", detail: "Une semaine sans réponse." },
      ],
      votes: [["traduction", 1]],
    },
    evidence: [
      {
        target: "/work/0",
        kind: "attestation_employeur",
        label: "Attestation d'employeur – Transports Rhône",
        lines: [
          "Transports Rhône atteste que Léa Martin occupe le poste",
          "de développeuse back-end depuis mars 2021.",
        ],
      },
      {
        target: "/education/0",
        kind: "diplome",
        label: "Diplôme d'ingénieur – INSA Lyon",
        lines: ["Diplôme d'ingénieur, spécialité informatique,", "délivré à Léa Martin en 2018."],
      },
    ],
  },
  {
    email: "karim.benali@demo.attesta.localhost",
    recipient: "karim.veille@demo.attesta.localhost",
    tone: "dynamique",
    profile: {
      basics: {
        name: "Karim Benali",
        label: "Data analyst",
        email: "karim.benali@demo.attesta.localhost",
        summary: "Data analyst orienté métier : tableaux de bord, SQL et automatisation des rapports.",
        location: { city: "Paris", countryCode: "FR" },
      },
      work: [
        {
          name: "Retail France",
          position: "Data analyst",
          location: "Paris",
          startDate: "2022-01",
          highlights: [
            "Conception de 15 tableaux de bord Power BI pour les directions commerciales",
            "Automatisation des rapports hebdomadaires en Python, soit 6 heures gagnées par semaine",
            "Écriture de requêtes SQL sur un entrepôt de 2 To",
          ],
        },
        {
          name: "Banque du Centre",
          position: "Analyste reporting",
          location: "Orléans",
          startDate: "2019-09",
          endDate: "2021-12",
          highlights: [
            "Fiabilisation du reporting mensuel des risques",
            "Formation de 20 utilisateurs à Excel avancé",
          ],
        },
      ],
      education: [
        {
          institution: "Université Paris-Dauphine",
          studyType: "Master",
          area: "Statistique",
          endDate: "2019",
        },
      ],
      skills: [
        { name: "Analyse", keywords: ["SQL", "Python", "pandas"] },
        { name: "Visualisation", keywords: ["Power BI", "Excel"] },
      ],
      languages: [
        { language: "Français", fluency: "Langue maternelle" },
        { language: "Arabe", fluency: "Courant" },
        { language: "Anglais", fluency: "B2" },
      ],
    },
    offers: [
      `Data Analyst Power BI (H/F) – Paris
Au sein de la direction financière d'un groupe de distribution, vous construisez les tableaux de bord de pilotage.
Missions : modéliser les données, développer des rapports Power BI, écrire des requêtes SQL, automatiser les traitements en Python.
Profil : 3 ans d'expérience, maîtrise de SQL et Power BI. La connaissance de Snowflake et de dbt serait appréciée.
CDI, Paris 9e.`,
      `Analyste BI confirmé (H/F) – Paris La Défense
Vous accompagnez les métiers dans l'analyse de leurs indicateurs.
Compétences attendues : SQL avancé, Power BI ou Tableau, Python, sens de la pédagogie pour former les utilisateurs.
Un anglais professionnel est requis. Une expérience en banque est un plus.`,
    ],
    watch: { occupations: ["Data analyst"], country: "FR", city: "Paris" },
    // Juge et conseillère ATS : « Fiabilisation », « pilotage » ; entretien technique travaillé.
    scenario: {
      judge: true,
      ats: { apply: 2 },
      coach: [
        {
          level: "technique",
          answers: [
            "Chez Retail France, les rapports hebdomadaires étaient faits à la main. Ma mission : les automatiser. J'ai écrit des scripts Python avec pandas. Résultat : 6 heures gagnées par semaine.",
            "J'ai fait des tableaux de bord Power BI.",
          ],
        },
      ],
      reminders: [
        {
          kind: "relance",
          inDays: 1,
          title: "Préparer l'entretien technique",
          detail: "Revoir les questions SQL avec le coach.",
        },
      ],
      votes: [
        ["juge-fidelite", 1],
        ["conseils-ats", 1],
        ["coach-retour", -1],
      ],
    },
    evidence: [
      {
        target: "/education/0",
        kind: "diplome",
        label: "Master Statistique – Université Paris-Dauphine",
        lines: ["Master mention Statistique,", "délivré à Karim Benali en 2019."],
      },
      {
        target: "/languages/2",
        kind: "certificat",
        label: "Certificat d'anglais B2",
        lines: ["Certificat de langue anglaise, niveau B2,", "obtenu par Karim Benali."],
      },
    ],
  },
  {
    email: "sophie.laurent@demo.attesta.localhost",
    recipient: "sophie.emploi@demo.attesta.localhost",
    tone: "sobre",
    profile: {
      basics: {
        name: "Sophie Laurent",
        label: "Comptable",
        email: "sophie.laurent@demo.attesta.localhost",
        summary: "Comptable polyvalente, 8 ans d'expérience en PME, de la saisie au bilan.",
        location: { city: "Bordeaux", countryCode: "FR" },
      },
      work: [
        {
          name: "Vins du Médoc SAS",
          position: "Comptable unique",
          location: "Bordeaux",
          startDate: "2018-04",
          highlights: [
            "Tenue de la comptabilité générale d'une PME de 45 salariés",
            "Préparation des bilans annuels avec l'expert-comptable",
            "Réduction de 10 jours des délais de clôture mensuelle",
            "Gestion des déclarations de TVA",
          ],
        },
        {
          name: "Cabinet Garonne Expertise",
          position: "Assistante comptable",
          location: "Bordeaux",
          startDate: "2015-09",
          endDate: "2018-03",
          highlights: ["Suivi d'un portefeuille de 60 dossiers clients", "Saisie et révision des comptes"],
        },
      ],
      education: [
        {
          institution: "Lycée Gustave Eiffel",
          studyType: "BTS",
          area: "Comptabilité et gestion",
          endDate: "2015",
        },
      ],
      skills: [
        { name: "Comptabilité", keywords: ["Comptabilité générale", "TVA", "Bilan", "Clôture"] },
        { name: "Outils", keywords: ["Sage", "Excel"] },
      ],
      languages: [{ language: "Français", fluency: "Langue maternelle" }],
    },
    offers: [
      `Comptable unique (H/F) – Bordeaux
PME industrielle de 60 personnes recherche son/sa comptable unique.
Missions : comptabilité générale et auxiliaire, déclarations de TVA, préparation du bilan, suivi de trésorerie.
Profil : 5 ans d'expérience minimum, maîtrise de Sage et d'Excel. La connaissance de la consolidation est un plus.
CDI, 39 h, Mérignac.`,
    ],
    watch: { occupations: ["Comptable"], country: "FR", city: "Bordeaux" },
    // Coach (RH puis manager), plan de progression (consolidation), réponse de formulaire.
    scenario: {
      judge: true,
      coach: [
        {
          level: "rh",
          answers: [
            "Je souhaite rejoindre une PME industrielle pour être au cœur des décisions financières, comme chez Vins du Médoc où je gère seule la comptabilité de 45 salariés.",
          ],
        },
        {
          level: "manager",
          answers: [
            "La clôture mensuelle prenait trop de temps. Ma tâche était de la raccourcir. J'ai mis en place un rapprochement bancaire hebdomadaire. Résultat : 10 jours gagnés sur la clôture.",
            "J'ai amélioré la clôture.",
          ],
        },
      ],
      plan: true,
      reminders: [
        {
          kind: "progression",
          inDays: 14,
          title: "Point d'étape : consolidation",
          detail: "Terminer le module d'initiation à la consolidation.",
        },
      ],
    },
    evidence: [
      {
        target: "/work/0",
        kind: "attestation_employeur",
        label: "Attestation d'employeur – Vins du Médoc SAS",
        lines: [
          "Vins du Médoc SAS atteste que Sophie Laurent occupe le poste",
          "de comptable unique depuis avril 2018.",
        ],
      },
    ],
  },
  {
    // Reconversion : profil mince, réalisations sans chiffres (intervieweuse), écart fort (plan), offre en
    // anglais (traduction), pas de veille ni de justificatif (états vides).
    email: "thomas.nguyen@demo.attesta.localhost",
    tone: "dynamique",
    profile: {
      basics: {
        name: "Thomas Nguyen",
        label: "Développeur front-end junior",
        email: "thomas.nguyen@demo.attesta.localhost",
        summary:
          "Ancien professeur de mathématiques reconverti dans le développement web, diplômé d'une formation intensive en 2025.",
        location: { city: "Nantes", countryCode: "FR" },
      },
      work: [
        {
          name: "Collège Jules Verne",
          position: "Professeur de mathématiques",
          location: "Nantes",
          startDate: "2017-09",
          endDate: "2024-06",
          highlights: [
            "Enseignement des mathématiques en collège",
            "Création d'exercices interactifs en ligne pour les élèves",
            "Coordination de l'équipe de mathématiques",
          ],
        },
      ],
      projects: [
        {
          name: "Révisio",
          description: "Application de révision pour collégiens, projet de fin de formation.",
          startDate: "2025-01",
          endDate: "2025-04",
          highlights: [
            "Développement de l'interface en React et TypeScript",
            "Intégration d'une API REST pour les exercices",
          ],
        },
        {
          name: "Portfolio personnel",
          highlights: ["Site statique en HTML, CSS et JavaScript"],
        },
      ],
      education: [
        {
          institution: "École du Code Nantes",
          studyType: "Titre professionnel",
          area: "Développeur web et web mobile",
          endDate: "2025",
        },
        { institution: "Université de Nantes", studyType: "Master", area: "Mathématiques", endDate: "2017" },
      ],
      skills: [
        { name: "Front-end", keywords: ["React", "TypeScript", "JavaScript", "HTML", "CSS"] },
        { name: "Outils", keywords: ["Git"] },
      ],
      languages: [
        { language: "Français", fluency: "Langue maternelle" },
        { language: "Vietnamien", fluency: "Courant" },
        { language: "Anglais", fluency: "B1" },
      ],
    },
    offers: [
      `Développeur front-end React (H/F) – Nantes
Startup de la logistique, nous cherchons un développeur front-end pour notre application web.
Missions : développer des interfaces en React et TypeScript, écrire des tests automatisés avec Jest et Playwright, participer à l'intégration continue (GitHub Actions), suivre l'accessibilité (RGAA).
Profil : 2 ans d'expérience en React, maîtrise de TypeScript, des tests et de Git. Next.js et Storybook sont un plus.
CDI, Nantes, télétravail partiel.`,
      `Junior Front-end Developer – Amsterdam (remote friendly)
We are an edtech scale-up building learning tools for teenagers.
You will build React components with TypeScript, work with designers in Figma, and write unit tests.
Requirements: first experience with React and TypeScript, good communication skills, professional English. Teaching experience is a strong plus.
Full-time, hybrid or remote within Europe.`,
    ],
    scenario: {
      ats: { apply: 0 },
      translate: ["en"],
      plan: true,
      coach: [
        {
          level: "rh",
          answers: [
            "J'ai enseigné pendant sept ans et j'ai créé des exercices en ligne pour mes élèves : c'est là que j'ai découvert le développement, puis j'ai suivi une formation.",
          ],
        },
      ],
      reminders: [
        {
          kind: "progression",
          inDays: 7,
          title: "Avancer sur les tests Jest",
          detail: "Plan de progression.",
        },
      ],
      votes: [["plan-progression", 1]],
    },
    evidence: [],
  },
  {
    // Profil senior et riche : trois CV, juge, traduction, coach, plusieurs justificatifs et rappels
    // passés et à venir (envoyés ou non).
    email: "amina.diallo@demo.attesta.localhost",
    recipient: "amina.veille@demo.attesta.localhost",
    tone: "sobre",
    profile: {
      basics: {
        name: "Amina Diallo",
        label: "Cheffe de projet transformation digitale",
        email: "amina.diallo@demo.attesta.localhost",
        phone: "07 45 12 89 30",
        summary:
          "Cheffe de projet depuis 10 ans, de l'industrie aux services publics : conduite du changement, méthodes agiles et pilotage budgétaire.",
        location: { city: "Lille", countryCode: "FR" },
        profiles: [{ network: "LinkedIn", url: "https://www.linkedin.com/in/amina-diallo-demo" }],
      },
      work: [
        {
          name: "Métropole Numérique",
          position: "Cheffe de projet transformation digitale",
          location: "Lille",
          startDate: "2020-02",
          highlights: [
            "Pilotage de la dématérialisation de 35 démarches administratives",
            "Gestion d'un budget de 2,4 M€ et d'une équipe de 9 personnes",
            "Déploiement de Jira et de la méthode Scrum dans 4 équipes",
            "Hausse de 30 % de la satisfaction des usagers en 2 ans",
          ],
        },
        {
          name: "Textiles du Nord",
          position: "Chargée de projet ERP",
          location: "Roubaix",
          startDate: "2016-09",
          endDate: "2020-01",
          highlights: [
            "Migration de l'ERP vers SAP S/4HANA pour 3 usines",
            "Formation de 120 utilisateurs aux nouveaux processus",
            "Rédaction des cahiers des charges avec les métiers",
          ],
        },
        {
          name: "Conseil & Process",
          position: "Consultante junior",
          location: "Paris",
          startDate: "2014-09",
          endDate: "2016-08",
          highlights: ["Cartographie des processus pour 6 clients industriels"],
        },
      ],
      education: [
        {
          institution: "IESEG School of Management",
          studyType: "Master",
          area: "Management",
          endDate: "2014",
        },
      ],
      certificates: [
        { name: "Professional Scrum Master I", issuer: "Scrum.org", date: "2021-05" },
        { name: "PRINCE2 Foundation", issuer: "Axelos", date: "2019-11" },
      ],
      skills: [
        { name: "Gestion de projet", keywords: ["Scrum", "PRINCE2", "Jira", "Pilotage budgétaire"] },
        { name: "Transformation", keywords: ["Conduite du changement", "Cartographie des processus"] },
        { name: "Outils", keywords: ["SAP S/4HANA", "Excel", "Power BI"] },
      ],
      languages: [
        { language: "Français", fluency: "Langue maternelle" },
        { language: "Anglais", fluency: "C1" },
        { language: "Wolof", fluency: "Courant" },
      ],
    },
    offers: [
      `Directeur·rice de projets digitaux (H/F) – Lille
Collectivité territoriale, nous recrutons un·e directeur·rice de projets pour notre programme de services numériques.
Missions : piloter un portefeuille de projets, encadrer une équipe, gérer le budget, conduire le changement auprès des agents.
Profil : 8 ans d'expérience en gestion de projet, maîtrise des méthodes agiles (Scrum), expérience du secteur public appréciée.
Poste de catégorie A, Lille.`,
      `Product Owner ERP (H/F) – Roubaix
Groupe industriel textile, nous cherchons un Product Owner pour notre ERP SAP.
Missions : recueillir les besoins des usines, prioriser le backlog dans Jira, animer les cérémonies Scrum, former les utilisateurs.
Profil : expérience d'un projet SAP S/4HANA, certification Scrum appréciée, anglais courant.
CDI, Roubaix.`,
      `Consultante senior en transformation (H/F) – Paris
Cabinet de conseil, vous accompagnez nos clients industriels dans leur transformation.
Compétences : cartographie des processus, conduite du changement, PRINCE2 ou équivalent, Power BI. SAFe est un plus.
CDI, Paris, déplacements fréquents.`,
    ],
    watch: { occupations: ["Chef de projet"], country: "FR", city: "Lille" },
    scenario: {
      judge: true,
      ats: { apply: 1 },
      translate: ["en"],
      letterTranslate: "en",
      coach: [
        {
          level: "manager",
          answers: [
            "À la Métropole, 35 démarches devaient être dématérialisées en deux ans. J'étais responsable du programme. J'ai organisé 4 équipes en Scrum et suivi le budget chaque mois. Résultat : la satisfaction des usagers a augmenté de 30 %.",
          ],
        },
      ],
      reminders: [
        { kind: "relance", inDays: 0, title: "Répondre à la collectivité", detail: "Proposition reçue." },
        { kind: "relance", inDays: 3, title: "Remercier la DSI après l'entretien", detail: "" },
        {
          kind: "progression",
          inDays: 30,
          title: "Se renseigner sur SAFe",
          detail: "Demandé par le cabinet.",
        },
      ],
      votes: [["juge-fidelite", -1]],
    },
    evidence: [
      {
        target: "/work/0",
        kind: "attestation_employeur",
        label: "Attestation d'employeur – Métropole Numérique",
        lines: [
          "Métropole Numérique atteste qu'Amina Diallo occupe le poste",
          "de cheffe de projet transformation digitale depuis février 2020.",
        ],
      },
      {
        target: "/certificates/0",
        kind: "certificat",
        label: "Certificat Professional Scrum Master I",
        lines: ["Professional Scrum Master I,", "obtenu par Amina Diallo en mai 2021."],
      },
      {
        target: "/work/1",
        kind: "recommandation",
        label: "Lettre de recommandation – Textiles du Nord",
        lines: [
          "Le directeur industriel de Textiles du Nord recommande",
          "Amina Diallo pour son projet ERP.",
        ],
      },
    ],
  },
];

/* ---------------------------------------------------------------------------------------------------- */
/* Appels                                                                                               */
/* ---------------------------------------------------------------------------------------------------- */

const step = (who, text) => console.log(`  ${who.padEnd(14)} ${text}`);

async function call(token, method, path, body, accept = "application/json") {
  const res = await fetch(`${api}/api${path}`, {
    method,
    headers: {
      Accept: accept,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok && res.status !== 404) {
    const detail = await res.text();
    throw new Error(`${method} ${path} : ${res.status} ${detail.slice(0, 200)}`);
  }
  return res;
}
const json = async (res) => (res.status === 204 || res.status === 404 ? null : res.json());

/** Connexion par identifiant et mot de passe ; le compte est créé s'il n'existe pas encore (ADR 0030). */
async function login({ username, password: secret }, create = true) {
  const csrf = { "X-Attesta-Csrf": "1", "Content-Type": "application/json", Accept: "application/json" };
  const post = (path, body) =>
    fetch(`${api}/api/auth/v1${path}`, { method: "POST", headers: csrf, body: JSON.stringify(body) });
  let session = await post("/session/password", { username, password: secret });
  if (session.status === 401 && create)
    session = await post("/accounts", { username, password: secret, policyAccepted: true });
  if (!session.ok) throw new Error(`Connexion de ${username} : ${session.status} ${await session.text()}`);
  return (await session.json()).accessToken;
}

/** Génération d'un CV ciblé, lue en flux (SSE) jusqu'à l'événement final. */
async function generate(token, offerId) {
  const res = await call(token, "POST", "/cv/v1/generations", { offerId }, "text/event-stream");
  const text = await res.text();
  const events = text.split("\n\n").flatMap((block) =>
    block
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice(6))),
  );
  const done = events.find((e) => e.type === "done");
  if (!done) throw new Error(`Génération sans résultat : ${JSON.stringify(events.at(-1))}`);
  return done.generationId;
}

/* ---------------------------------------------------------------------------------------------------- */
/* Scénario                                                                                             */
/* ---------------------------------------------------------------------------------------------------- */

/**
 * PDF d'une page, écrit à la main (aucune dépendance), barré de la mention « document fictif » : une pièce
 * de démonstration ne doit jamais pouvoir passer pour une vraie attestation.
 */
function fakePdf(title, lines) {
  // Latin-1 seulement : le tiret long n'y figure pas, il devient un tiret simple.
  const clean = (t) => t.replace(/[()\\]/g, "").replace(/–/g, "-");
  const text = [
    "BT /F1 11 Tf 0.75 0.1 0.1 rg 60 790 Td (DOCUMENT FICTIF - DONNEES DE DEMONSTRATION ATTESTA) Tj ET",
    `BT /F1 20 Tf 0 0 0 rg 60 730 Td (${clean(title)}) Tj ET`,
    ...lines.map((l, i) => `BT /F1 12 Tf 60 ${690 - i * 22} Td (${clean(l)}) Tj ET`),
    "BT /F1 9 Tf 0.4 0.4 0.4 rg 60 80 Td (Piece generee pour la demonstration ; sans valeur.) Tj ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = Buffer.byteLength(pdf, "latin1");
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function seedEvidence(who, token, pieces) {
  const existing = await json(await call(token, "GET", "/profiles/v1/profiles/me/evidence"));
  if (existing?.length) return step(who, `${existing.length} justificatif(s) déjà présent(s)`);
  for (const piece of pieces) {
    const form = new FormData();
    form.append("target", piece.target);
    form.append("kind", piece.kind);
    form.append("label", piece.label);
    form.append(
      "piece",
      new Blob([fakePdf(piece.label, piece.lines)], { type: "application/pdf" }),
      "piece.pdf",
    );
    const res = await fetch(`${api}/api/profiles/v1/profiles/me/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: form,
    });
    if (!res.ok) throw new Error(`Justificatif « ${piece.label} » : ${res.status} ${await res.text()}`);
    step(who, `justificatif joint : ${piece.label}`);
  }
}

/** Date locale AAAA-MM-JJ décalée de `days` jours. */
const day = (days) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Une étape d'assistant qui échoue (assistant indisponible, ajout refusé) n'arrête pas le jeu de données. */
async function tryStep(who, label, fn) {
  try {
    const done = await fn();
    if (done !== false) step(who, label);
  } catch (error) {
    step(who, `⚠ ${label} : ${error.message.slice(0, 120)}`);
  }
}

/**
 * Usage des assistants IA (ADR 0028 et 0029) sur les CV du candidat, comme dans le Studio : chaque résultat
 * est conservé par le service et réapparaît à l'ouverture. Ne rejoue rien si le premier CV a déjà des
 * résultats ou si des rappels existent.
 */
async function seedAssistants(who, token, p) {
  const s = p.scenario;
  if (!s) return;
  const list = (await json(await call(token, "GET", "/cv/v1/generations"))) ?? [];
  const ids = list
    .filter((g) => g.status === "ok")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((g) => g.id);
  if (!ids.length) return step(who, "aucun CV vérifié : assistants ignorés");
  const [first] = ids;
  const post = (path, body) => call(token, "POST", path, body).then(json);

  const stored = (await json(await call(token, "GET", `/cv/v1/generations/${first}/assistants`))) ?? {};
  if (Object.keys(stored).length) step(who, "assistants déjà utilisés : résultats conservés");
  else {
    if (s.judge)
      await tryStep(who, "CV jugé par le juge de fidélité", () => post(`/cv/v1/generations/${first}/judge`));
    if (s.ats) {
      await tryStep(who, "CV scanné par la conseillère ATS", async () => {
        const advice = await post(`/cv/v1/generations/${first}/ats`);
        for (const k of advice.keywords.filter((k) => k.status === "a_placer").slice(0, s.ats.apply)) {
          const proposal = await post(`/cv/v1/generations/${first}/ats/apply`, { term: k.term });
          const g = await json(await call(token, "GET", `/cv/v1/generations/${first}`));
          await call(token, "PATCH", `/cv/v1/generations/${first}/lines`, {
            revision: g.revision,
            lines: [],
            additions: [{ entry: proposal.entry, text: proposal.text, sources: proposal.sources }],
          });
          step(who, `conseil ATS appliqué : « ${k.term} »`);
        }
        await post(`/cv/v1/generations/${first}/ats`);
      });
    }
    for (const lang of s.translate ?? [])
      await tryStep(who, `CV traduit (${lang})`, () =>
        post(`/cv/v1/generations/${ids.at(lang === "de" ? 1 : -1) ?? first}/translate`, { lang }),
      );
    for (const c of s.coach ?? [])
      await tryStep(who, `entretien blanc ${c.level} : ${c.answers.length} réponse(s)`, async () => {
        const prep = await post(`/cv/v1/generations/${first}/interview`, { level: c.level });
        for (const [i, answer] of c.answers.entries()) {
          const question = prep.questions[i % prep.questions.length].question;
          await post(`/cv/v1/generations/${first}/interview/feedback`, { question, answer });
        }
      });
    if (s.plan)
      await tryStep(who, "plan de progression tracé", () =>
        post(`/cv/v1/generations/${first}/learning-plan`),
      );
    if (s.letterTranslate)
      await tryStep(who, `lettre traduite (${s.letterTranslate})`, async () => {
        const [letter] = (await json(await call(token, "GET", "/letters/v1/letters"))) ?? [];
        if (!letter) return false;
        await post(`/letters/v1/letters/${letter.id}/translate`, { lang: s.letterTranslate });
      });
    for (const [role, vote] of s.votes ?? []) {
      await tryStep(who, `avis ${vote > 0 ? "👍" : "👎"} sur ${role}`, () =>
        post(`/cv/v1/assistants/feedback`, { role, vote, providerKind: "demo" }),
      );
    }
  }

  if (!withWatch) return step(who, "rappels ignorés (DEMO_WATCH=0) : ils exigent une adresse confirmée");
  const reminders = (await json(await call(token, "GET", "/watch/v1/reminders"))) ?? [];
  if (reminders.length) step(who, `${reminders.length} rappel(s) déjà programmé(s)`);
  else
    for (const r of s.reminders ?? [])
      await tryStep(who, `rappel le ${day(r.inDays)} : ${r.title}`, () =>
        post("/watch/v1/reminders", {
          kind: r.kind,
          sendOn: day(r.inDays),
          title: r.title,
          detail: r.detail,
          link: `/studio/${first}/${r.kind === "progression" ? "plan" : "redaction"}`,
        }),
      );
}

async function seedPersona(p) {
  const who = p.profile.basics.name;
  const token = await login({ username: usernameOf(p), password });
  step(who, `connecté (${usernameOf(p)})`);

  if (await json(await call(token, "GET", "/profiles/v1/profiles/me"))) step(who, "profil déjà présent");
  else {
    await call(token, "PUT", "/profiles/v1/profiles/me", { profile: p.profile });
    step(who, "profil enregistré");
  }

  const existing = await json(await call(token, "GET", "/cv/v1/generations"));
  if (existing?.length) step(who, `${existing.length} CV déjà générés : offres et CV conservés`);
  else {
    let first;
    for (const rawText of p.offers) {
      const offer = await json(await call(token, "POST", "/jobs/v1/offers", { rawText }));
      const generationId = await generate(token, offer.id);
      first ??= generationId;
      step(who, `offre « ${offer.title} » → CV ciblé généré`);
    }
    // Une ligne retouchée par la candidate : la relecture affiche « Modifiée par vous ».
    const generation = await json(await call(token, "GET", `/cv/v1/generations/${first}`));
    const line = generation?.cv?.work?.[0]?.highlights?.[0];
    if (line) {
      await call(token, "PATCH", `/cv/v1/generations/${first}/lines`, {
        revision: generation.revision,
        lines: [{ path: "/work/0/highlights/0", text: `${line.text} (relu par ${who.split(" ")[0]})` }],
      });
      step(who, "une ligne corrigée à la main");
    }
    await call(token, "POST", "/letters/v1/letters", { generationId: first, tone: p.tone });
    step(who, `lettre de motivation (${p.tone})`);
  }

  await seedEvidence(who, token, p.evidence);
  await seedAssistants(who, token, p);

  if (!p.watch || !withWatch) return step(who, "pas de veille : à créer avec votre propre adresse");
  const current = await json(await call(token, "GET", "/watch/v1/subscriptions/me"));
  if (current?.status === "active") step(who, "veille déjà active");
  else {
    // Veille active dès l'enregistrement, sans lien de confirmation (ADR 0030, point 5).
    await call(token, "PUT", "/watch/v1/subscriptions/me", {
      ...p.watch,
      radiusKm: 25,
      workingTime: "indifferent",
      email: p.recipient,
      consent: true,
    });
    step(who, `veille active → ${p.recipient}`);
  }
}

console.log(`Données de démonstration sur ${api} (e-mails : ${mailpit})\n`);
const selected = PERSONAS.filter((p) => !only?.length || only.includes(usernameOf(p)));
for (const p of selected) await seedPersona(p);

const adminToken = await login(admin, false);
await call(adminToken, "POST", "/watch/v1/admin/runs");
step("Administration", "veille lancée : rapports quotidiens et offres collectées en cours");

console.log(`
Terminé. Pour voir les résultats :
  - Application : identifiants ci-dessous, mot de passe « ${password} »
${selected.map((p) => `      ${usernameOf(p)}`).join("\n")}
      admin (administration, mot de passe « ${admin.password} »)
  - ${
    withWatch
      ? `Rapports de veille reçus par : ${selected
          .filter((p) => p.watch && p.recipient)
          .map((p) => p.recipient)
          .join(", ")}`
      : "Veille : à créer depuis chaque compte, avec votre propre adresse (confirmée par e-mail)"
  }`);
