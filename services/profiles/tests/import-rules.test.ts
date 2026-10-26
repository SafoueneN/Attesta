import { ImportedProfile } from "@attesta/shared-schemas";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { rulesProfile } from "../src/import-rules.js";

/*
 * Import de CV sans IA (ADR 0038) : boîte blanche (formats de dates, rubriques en trois langues, titres,
 * compétences, langues, bloc d'identité) et propriétés (fast-check) sur des textes quelconques.
 */

const CV = `Léa Martin
Développeuse back-end
lea.martin@example.org · 06 12 34 56 78 · Lyon, FR
https://lea.dev

Profil
Cinq ans d'API Node.js.

Expérience professionnelle
Développeuse back-end – Transports Rhône · Lyon   03/2021 – aujourd'hui
• Migration de 12 services Express
• ok
Développeuse junior chez Agence Web Sud   sept. 2019 - févr. 2021
- Maintenance de sites PHP

Formation
Diplôme d'ingénieur  Informatique  INSA Lyon  2019

Compétences :
Node.js : Express, PostgreSQL
Docker, Kubernetes, X

Langues
Anglais (C1), Allemand – B2, Wolof`;

describe("extraction par règles (boîte blanche)", () => {
  // Calculé dans chaque test (pas au chargement du fichier) : Stryker relie ainsi chaque mutant à ses tests.
  const p = () => rulesProfile(CV);

  it("en-tête : nom, titre, e-mail, téléphone, ville et pays, lien", () => {
    expect(p().basics).toEqual({
      name: "Léa Martin",
      label: "Développeuse back-end",
      email: "lea.martin@example.org",
      phone: "06 12 34 56 78",
      city: "Lyon",
      countryCode: "FR",
      url: "https://lea.dev",
      summary: "Cinq ans d'API Node.js.",
    });
  });

  it("expériences : titre découpé (–, ·, chez), dates « 03/2021 », « sept. 2019 », poste en cours", () => {
    expect(p().work).toEqual([
      {
        position: "Développeuse back-end",
        name: "Transports Rhône",
        location: "Lyon",
        startDate: "2021-03",
        endDate: null,
        summary: null,
        highlights: ["Migration de 12 services Express"],
      },
      {
        position: "Développeuse junior",
        name: "Agence Web Sud",
        location: null,
        startDate: "2019-09",
        endDate: "2021-02",
        summary: null,
        highlights: ["Maintenance de sites PHP"],
      },
    ]);
  });

  it("formation : une ligne terminée par une année ouvre une entrée ; l'établissement est reconnu", () => {
    expect(p().education).toEqual([
      {
        institution: "INSA Lyon",
        studyType: "Diplôme d'ingénieur",
        area: "Informatique",
        startDate: null,
        endDate: "2019",
      },
    ]);
  });

  it("compétences « Nom : mots-clés » ou en liste ; un mot d'une lettre est écarté", () => {
    expect(p().skills).toEqual([
      { name: "Node.js", keywords: ["Express", "PostgreSQL"] },
      { name: "Docker", keywords: [] },
      { name: "Kubernetes", keywords: [] },
    ]);
  });

  it("langues avec ou sans niveau", () => {
    expect(p().languages).toEqual([
      { language: "Anglais", fluency: "C1" },
      { language: "Allemand", fluency: "B2" },
      { language: "Wolof", fluency: null },
    ]);
  });

  it.each([
    ["2021-03 – 2023-11", "2021-03", "2023-11"],
    ["mars 2020 à juin 2022", "2020-03", "2022-06"],
    ["January 2018 to present", "2018-01", null],
    ["10.2015 bis heute", "2015-10", null],
    ["2016 – 2018", "2016", "2018"],
    ["Dezember 2019 bis März 2021", "2019-12", "2021-03"],
  ])("plage de dates « %s »", (range, start, end) => {
    const [w] = rulesProfile(`Experience\nConsultant – Acme ${range}\n• Mission de conseil`).work;
    expect([w?.startDate, w?.endDate]).toEqual([start, end]);
  });

  it.each([
    ["anglais", "Work experience", "Skills"],
    ["allemand", "Berufserfahrung", "Kenntnisse"],
    ["français", "Parcours professionnel", "Savoir-faire"],
  ])("rubriques en %s", (_l, work, skills) => {
    const r = rulesProfile(`Sam Doe\n${work}\nDev – Acme 2020 - 2021\n${skills}\nGo, Rust`);
    expect(r.work).toHaveLength(1);
    expect(r.skills.map((s) => s.name)).toEqual(["Go", "Rust"]);
  });

  it("un mot avant l'année n'est pas un mois (« Brumaire 2020 ») ; une ligne sans entrée ouverte est ignorée", () => {
    const r = rulesProfile("Expérience\nLigne orpheline\nConsultant – Acme Brumaire 2020 - 2021\n• Mission");
    expect(r.work).toEqual([
      expect.objectContaining({
        position: "Consultant",
        name: "Acme Brumaire",
        startDate: "2020",
        endDate: "2021",
      }),
    ]);
    expect(rulesProfile("Expérience\nLigne orpheline").work).toEqual([]);
  });

  it("bloc d'identité à la fin du texte (PDF en colonnes, CV exportés par Attesta)", () => {
    const r = rulesProfile(`PROFIL
Cheffe de projet depuis 10 ans.
COMPÉTENCES
Outils : SAP, Excel
LANGUES
Anglais – C1
Amina Diallo
Cheffe de projet transformation digitale
amina.diallo@example.org · 07 45 12 89 30 · Lille, FR ·
https://www.linkedin.com/in/amina-diallo
Autorisation de travail : résidente permanente`);
    expect(r.basics).toMatchObject({
      name: "Amina Diallo",
      label: "Cheffe de projet transformation digitale",
      phone: "07 45 12 89 30",
      city: "Lille",
      countryCode: "FR",
      url: "https://www.linkedin.com/in/amina-diallo",
    });
    // Les lignes d'identité ne polluent pas la rubrique où elles se trouvent.
    expect(r.languages).toEqual([{ language: "Anglais", fluency: "C1" }]);
    expect(r.skills).toEqual([{ name: "Outils", keywords: ["SAP", "Excel"] }]);
  });

  it("texte vide ou sans structure : profil vide, sans erreur", () => {
    expect(rulesProfile("")).toMatchObject({ basics: { name: null, email: null }, work: [], skills: [] });
  });
});

describe("propriétés (fuzzing fast-check)", () => {
  const line = fc.oneof(
    fc.string({ maxLength: 50 }),
    fc.constantFrom(
      "Expérience",
      "Formation",
      "Compétences",
      "Langues",
      "Profil",
      "Skills",
      "• Réalisation chiffrée",
      "Développeuse – Acme · Lyon 03/2021 – aujourd'hui",
      "Master  Université de Lyon  2018",
      "lea@example.org · 06 12 34 56 78 · Lyon, FR",
      "Anglais (C1), Wolof",
      "Node.js : Express, PostgreSQL",
      "Léa Martin",
    ),
  );
  const text = fc.array(line, { maxLength: 25 }).map((l) => l.join("\n"));

  it("ne lève jamais d'erreur et respecte le contrat de l'API (ImportedProfile)", () => {
    fc.assert(
      fc.property(text, (t) => {
        expect(() => ImportedProfile.parse(rulesProfile(t))).not.toThrow();
      }),
      { numRuns: 2000 },
    );
  });

  it("ne devine rien : chaque coordonnée extraite figure telle quelle dans le texte", () => {
    fc.assert(
      fc.property(text, (t) => {
        const one = (v: string) => v.replace(/\s+/g, " ");
        const flat = one(t);
        const { basics } = rulesProfile(t);
        for (const value of [basics.name, basics.label, basics.email, basics.phone, basics.city, basics.url])
          if (value) expect(flat).toContain(one(value));
      }),
      { numRuns: 2000 },
    );
  });

  it("au plus 30 compétences et 10 langues", () => {
    fc.assert(
      fc.property(fc.array(fc.stringMatching(/^[A-Za-z]{2,10}$/), { maxLength: 80 }), (items) => {
        const r = rulesProfile(`Compétences\n${items.join(", ")}\nLangues\n${items.join(", ")}`);
        expect(r.skills.length).toBeLessThanOrEqual(30);
        expect(r.languages.length).toBeLessThanOrEqual(10);
      }),
    );
  });
});

describe("tables de mois et de rubriques (deuxième vague, mutants survivants)", () => {
  const MONTHS: [string, string][] = [
    ["01", "jan janv janvier january januar"],
    ["02", "feb fév févr février february februar"],
    ["03", "mar mars march märz"],
    ["04", "apr avr avril april"],
    ["05", "may mai"],
    ["06", "jun juin june juni"],
    ["07", "jul juil juillet july juli"],
    ["08", "aug aoû août august"],
    ["09", "sep sept septembre september"],
    ["10", "oct octobre october oktober"],
    ["11", "nov novembre november"],
    ["12", "dec déc décembre december dez dezember"],
  ];
  const cases = MONTHS.flatMap(([n, names]) => names.split(" ").map((m) => [m, n] as const));

  it.each(cases)("« %s 2020 » → mois %s (avec ou sans point d'abréviation)", (month, n) => {
    for (const written of [month, `${month}.`, month.toUpperCase()]) {
      const [w] = rulesProfile(`Expérience\nConsultant – Acme ${written} 2020 – 2021\n• Mission`).work;
      expect(w?.startDate).toBe(`2020-${n}`);
    }
  });

  it.each([
    ["work", "Expérience"],
    ["work", "Expériences professionnelles"],
    ["work", "Parcours"],
    ["work", "Employment history"],
    ["work", "Berufliche Erfahrung"],
    ["work", "Praxiserfahrung"],
    ["education", "Études"],
    ["education", "Diplômes"],
    ["education", "Academic background"],
    ["education", "Ausbildung"],
    ["education", "Bildungsweg"],
    ["education", "Studium"],
    ["skills", "Compétences techniques"],
    ["skills", "Outils"],
    ["skills", "Technical skills"],
    ["skills", "Fähigkeiten"],
    ["skills", "IT-Kenntnisse"],
    ["languages", "Languages"],
    ["languages", "Sprachen"],
    ["languages", "Sprachkenntnisse"],
    ["summary", "Résumé"],
    ["summary", "À propos"],
    ["summary", "About me"],
    ["summary", "Über mich"],
    ["summary", "Kurzprofil"],
  ])("rubrique %s : « %s »", (section, heading) => {
    const body: Record<string, string> = {
      work: "Consultant – Acme 2020 – 2021",
      education: "Master  Université de Lyon  2019",
      skills: "Go, Rust",
      languages: "Anglais (C1)",
      summary: "Dix ans de conseil.",
    };
    const r = rulesProfile(`Sam Doe\n${heading} :\n${body[section]}`);
    const found = {
      work: r.work.length,
      education: r.education.length,
      skills: r.skills.length,
      languages: r.languages.length,
      summary: r.basics.summary ? 1 : 0,
    };
    expect(found[section as keyof typeof found]).toBeGreaterThan(0);
  });

  it.each([
    "Centres d'intérêt",
    "Loisirs",
    "Hobbies",
    "Références",
    "Certifications",
    "Projets",
    "Projects",
    "Interessen",
  ])("rubrique ignorée « %s » : son contenu ne va nulle part", (heading) => {
    const r = rulesProfile(`Sam Doe\nCompétences\nGo\n${heading}\nCourse à pied, Lecture`);
    expect(r.skills.map((s) => s.name)).toEqual(["Go"]);
  });

  it("un titre de rubrique trop long (plus de 40 caractères) reste une ligne de texte", () => {
    const r = rulesProfile("Profil\nExpériences professionnelles et associatives de terrain\nConsultant");
    expect(r.basics.summary).toContain("Expériences professionnelles et associatives");
  });

  it.each([
    ["+49 30 1234567", "+49 30 1234567"],
    ["+33 6 12 34 56 78", "+33 6 12 34 56 78"],
    ["(0)6.12.34.56.78", "(0)6.12.34.56.78"],
    ["12 34", null],
  ])("téléphone « %s »", (phone, expected) => {
    expect(rulesProfile(`Sam Doe\n${phone}\nCompétences\nGo`).basics.phone).toBe(expected);
  });
});
