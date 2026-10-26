import { Link, Navigate, useParams } from "react-router";
import { ArrowBadge, buttonClass, PageHeader, useDocumentTitle, WITH_ARROW } from "../components/ui";

/*
 * Exemples de CV par métier (ADR 0043) : pages statiques, sans compte, pour les candidats bloqués devant une
 * page blanche et pour être trouvées par les moteurs de recherche. Profils fictifs ; chaque exemple montre
 * des réalisations chiffrées, puis les usages des quatre pays de la plateforme.
 */

interface Example {
  slug: string;
  job: string;
  name: string;
  headline: string;
  summary: string;
  experience: { title: string; company: string; period: string; lines: string[] }[];
  skills: string[];
  tips: string[];
  /** Ce qui change d'un pays à l'autre pour ce métier. */
  countries: Partial<Record<"DE" | "FR" | "CA" | "TN", string>>;
}

const EXAMPLES: Example[] = [
  {
    slug: "developpeur-back-end",
    job: "Développeur back-end",
    name: "Léa Martin",
    headline: "Développeuse back-end Node.js · 5 ans d'expérience",
    summary: "Spécialisée Node.js et PostgreSQL, attentive à la performance et à la qualité du code.",
    experience: [
      {
        title: "Développeuse back-end",
        company: "Transports Rhône · Lyon",
        period: "2021 – aujourd'hui",
        lines: [
          "Réduction de 40 % du temps de réponse de l'API de réservation",
          "Migration de 12 services Express vers Node.js 20",
          "Tests d'intégration sur PostgreSQL avec Vitest",
        ],
      },
    ],
    skills: ["Node.js", "TypeScript", "PostgreSQL", "Docker", "REST"],
    tips: [
      "Chiffrez l'effet de votre travail : temps de réponse, nombre de services, incidents évités.",
      "Citez les versions et outils exacts demandés par l'offre, seulement s'ils sont dans votre parcours.",
      "Un lien GitHub ou un projet personnel vaut mieux qu'une liste de 30 technologies.",
    ],
    countries: {
      DE: "Beaucoup d'offres sont en anglais : un CV en anglais est accepté. Photo et date de naissance restent courantes.",
      CA: "Ni photo ni âge. Précisez votre autorisation de travail (résident permanent, permis de travail).",
      FR: "Une page suffit jusqu'à 10 ans d'expérience.",
    },
  },
  {
    slug: "data-analyst",
    job: "Data analyst",
    name: "Karim Benali",
    headline: "Data analyst · tableaux de bord et automatisation",
    summary: "Data analyst orienté métier : SQL, Power BI et automatisation des rapports en Python.",
    experience: [
      {
        title: "Data analyst",
        company: "Retail France · Paris",
        period: "2022 – aujourd'hui",
        lines: [
          "15 tableaux de bord Power BI pour les directions commerciales",
          "Rapports hebdomadaires automatisés en Python : 6 heures gagnées par semaine",
          "Requêtes SQL sur un entrepôt de 2 To",
        ],
      },
    ],
    skills: ["SQL", "Python", "pandas", "Power BI", "Excel"],
    tips: [
      "Montrez la décision rendue possible par vos analyses, pas seulement l'outil utilisé.",
      "Indiquez le volume de données et le nombre d'utilisateurs de vos tableaux de bord.",
    ],
    countries: {
      DE: "Les certifications (Microsoft PL-300, par exemple) sont très regardées.",
      CA: "Le français et l'anglais au niveau professionnel sont un atout fort au Québec.",
    },
  },
  {
    slug: "comptable",
    job: "Comptable",
    name: "Sophie Laurent",
    headline: "Comptable unique · 8 ans en PME",
    summary: "Comptable polyvalente, de la saisie au bilan, en lien direct avec l'expert-comptable.",
    experience: [
      {
        title: "Comptable unique",
        company: "Vins du Médoc SAS · Bordeaux",
        period: "2018 – aujourd'hui",
        lines: [
          "Comptabilité générale d'une PME de 45 salariés",
          "Clôture mensuelle raccourcie de 10 jours",
          "Déclarations de TVA et préparation des bilans annuels",
        ],
      },
    ],
    skills: ["Comptabilité générale", "TVA", "Clôture", "Sage", "Excel"],
    tips: [
      "Précisez la taille de l'entreprise et le périmètre (comptable unique, équipe, groupe).",
      "Nommez les logiciels : Sage, Cegid, SAP, DATEV en Allemagne.",
    ],
    countries: {
      DE: "Le diplôme et sa reconnaissance (Anerkennung) sont attendus ; DATEV est la référence.",
      TN: "Les normes comptables tunisiennes et la déclaration fiscale sont à mettre en avant.",
      FR: "Indiquez le permis B si le poste demande des déplacements.",
    },
  },
  {
    slug: "developpeur-front-end-junior",
    job: "Développeur front-end junior",
    name: "Thomas Nguyen",
    headline: "Développeur front-end React · en reconversion",
    summary: "Ancien professeur de mathématiques, formé au développement web en 2025.",
    experience: [
      {
        title: "Projet de fin de formation : Révisio",
        company: "École du Code · Nantes",
        period: "2025",
        lines: [
          "Interface d'une application de révision en React et TypeScript",
          "Intégration d'une API REST pour les exercices",
        ],
      },
      {
        title: "Professeur de mathématiques",
        company: "Collège Jules Verne · Nantes",
        period: "2017 – 2024",
        lines: ["Création d'exercices interactifs en ligne pour les élèves"],
      },
    ],
    skills: ["React", "TypeScript", "JavaScript", "HTML", "CSS", "Git"],
    tips: [
      "En reconversion, mettez les projets en premier et gardez l'ancien métier pour ce qu'il apporte.",
      "Un lien vers un projet en ligne compense le manque d'expérience en entreprise.",
    ],
    countries: {
      CA: "Les stages et le bénévolat comptent : indiquez-les comme de l'expérience.",
      TN: "Les plateformes freelance et les stages PFE sont très regardés par les recruteurs.",
    },
  },
  {
    slug: "chef-de-projet",
    job: "Chef de projet",
    name: "Amina Diallo",
    headline: "Cheffe de projet transformation digitale · 10 ans",
    summary: "De l'industrie aux services publics : conduite du changement, Scrum et pilotage budgétaire.",
    experience: [
      {
        title: "Cheffe de projet transformation digitale",
        company: "Métropole Numérique · Lille",
        period: "2020 – aujourd'hui",
        lines: [
          "Dématérialisation de 35 démarches administratives",
          "Budget de 2,4 M€ et équipe de 9 personnes",
          "Satisfaction des usagers en hausse de 30 % en 2 ans",
        ],
      },
    ],
    skills: ["Scrum", "PRINCE2", "Jira", "Conduite du changement", "Power BI"],
    tips: [
      "Budget, taille d'équipe, délais tenus : les trois chiffres que tout recruteur cherche.",
      "Les certifications (PSM, PRINCE2, PMP) vont dans une rubrique à part, datées.",
    ],
    countries: {
      DE: "Lebenslauf : signature datée en bas du CV ; les certificats de travail (Arbeitszeugnisse) se joignent.",
      CA: "PMP est la certification la plus reconnue en Amérique du Nord.",
      FR: "Mentionnez le secteur public ou privé : les recruteurs y sont sensibles.",
    },
  },
];

const COUNTRY_NAMES = { DE: "Allemagne", FR: "France", CA: "Canada", TN: "Tunisie" } as const;

function SampleCv({ e }: { e: Example }) {
  return (
    <article
      aria-label={`Exemple de CV : ${e.job}`}
      className="rounded-2xl bg-white p-6 text-[#1a1a1a] shadow-float"
    >
      <h2 className="text-2xl font-bold">{e.name}</h2>
      <p className="font-semibold">{e.headline}</p>
      <p className="mt-3 text-sm">{e.summary}</p>
      <h3 className="mt-5 border-b border-[#1a1a1a] pb-1 text-sm font-bold tracking-wide uppercase">
        Expérience
      </h3>
      {e.experience.map((x) => (
        <div key={x.title} className="mt-3">
          <p className="flex justify-between gap-3 text-sm font-semibold">
            <span>{x.title}</span>
            <span className="font-normal whitespace-nowrap">{x.period}</span>
          </p>
          <p className="text-sm italic">{x.company}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {x.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ))}
      <h3 className="mt-5 border-b border-[#1a1a1a] pb-1 text-sm font-bold tracking-wide uppercase">
        Compétences
      </h3>
      <p className="mt-2 text-sm">{e.skills.join(" · ")}</p>
    </article>
  );
}

export function ExamplesList() {
  useDocumentTitle("Exemples de CV par métier");
  return (
    <div className="space-y-8">
      <PageHeader
        title="Exemples de CV par métier"
        lead="Des CV fictifs mais réalistes, avec des réalisations chiffrées et les usages de chaque pays. Inspirez-vous-en, puis créez le vôtre à partir de votre propre parcours."
      />
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {EXAMPLES.map((e) => (
          <li key={e.slug}>
            <Link
              to={`/exemples-cv/${e.slug}`}
              className="card group block h-full space-y-2 transition-transform hover:-translate-y-1"
            >
              <h2 className="text-lg font-bold">{e.job}</h2>
              <p className="text-sm text-ink-muted">{e.headline}</p>
              <p className="text-xs text-ink-subtle">
                Conseils pour{" "}
                {Object.keys(e.countries)
                  .map((c) => COUNTRY_NAMES[c as keyof typeof COUNTRY_NAMES])
                  .join(", ")}
              </p>
              <span className="text-sm font-bold text-accent-text">
                Voir l'exemple <span aria-hidden="true">→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExampleDetail() {
  const { slug } = useParams();
  const e = EXAMPLES.find((x) => x.slug === slug);
  useDocumentTitle(e ? `Exemple de CV : ${e.job}` : "Exemple de CV");
  if (!e) return <Navigate to="/exemples-cv" replace />;
  return (
    <div className="space-y-8">
      <PageHeader
        title={`Exemple de CV : ${e.job}`}
        lead="Profil fictif. Sur Attesta, chaque ligne de votre CV vient de votre propre parcours : rien n'est recopié d'un exemple."
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SampleCv e={e} />
        <div className="space-y-6">
          <section className="card space-y-3">
            <h2 className="text-lg font-bold">Ce qui fait la différence</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {e.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
          <section className="card space-y-3">
            <h2 className="text-lg font-bold">Selon le pays</h2>
            <dl className="space-y-3 text-sm">
              {Object.entries(e.countries).map(([code, tip]) => (
                <div key={code}>
                  <dt className="font-bold">{COUNTRY_NAMES[code as keyof typeof COUNTRY_NAMES]}</dt>
                  <dd className="text-ink-muted">{tip}</dd>
                </div>
              ))}
            </dl>
          </section>
          <Link to="/cv" className={`${buttonClass("primary", "lg")} ${WITH_ARROW}`}>
            Créer mon CV ciblé
            <ArrowBadge />
          </Link>
        </div>
      </div>
      <Link to="/exemples-cv" className="link">
        ← Tous les exemples
      </Link>
    </div>
  );
}
