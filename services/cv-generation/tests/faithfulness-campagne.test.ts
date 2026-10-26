import { Profile, type TailoredCv } from "@attesta/shared-schemas";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkFaithfulness, checkLine, lineContext, normalize, sanitizeText } from "../src/faithfulness.js";
import { lea } from "./fixtures.js";

/*
 * Campagne de tests du contrôle de fidélité (ADR 0003) : tables en boîte blanche (une entrée par alias,
 * nombre en lettres, ordre de grandeur, titre contrôlé, unité), parcours du CV complet, propriétés (fast-check).
 * Écrits à partir des mutants survivants de Stryker : chaque table tue une famille de mutants.
 */

const profile = Profile.parse({
  ...lea,
  work: [
    { ...lea.work[0]!, highlights: ["Suivi des projets de l'équipe", ...lea.work[0]!.highlights] },
    lea.work[1]!,
  ],
  projects: [{ name: "Attesta", highlights: ["Contrôle de fidélité en TypeScript"] }],
});
// Calculé dans chaque test : un calcul au chargement du fichier rendrait les mutants « statiques » (Stryker).
const ctx = () => lineContext(profile, []);
/** Ligne d'expérience : ses sources comptent seules (pas le reste du profil). */
const inEntry = (text: string, source = "/work/0/highlights/0") =>
  checkLine({ text, sources: [source] }, ctx(), "/work/0");
const withSource = (text: string, sourceText: string) => {
  const p = Profile.parse({ ...profile, work: [{ ...profile.work[0]!, highlights: [sourceText] }] });
  return checkLine({ text, sources: ["/work/0/highlights/0"] }, lineContext(p, []), "/work/0");
};

describe("alias d'écriture : une seule forme normalisée", () => {
  it.each([
    ["NodeJS", "Node.js"],
    ["Postgres", "PostgreSQL"],
    ["k8s", "Kubernetes"],
    ["JS", "JavaScript"],
    ["TS", "TypeScript"],
    ["PowerBI", "Power BI"],
    ["MS Excel", "Excel"],
    ["GCP", "Google Cloud"],
    ["ReactJS", "React"],
    ["VueJS", "Vue"],
    ["NextJS", "Next.js"],
    ["Vue.js", "Vue"],
    ["React.js", "ReactJS"],
    ["Express.js", "Express js"],
    ["golang", "Go"],
    ["sklearn", "scikit-learn"],
    ["ML", "Machine Learning"],
  ])("« %s » = « %s »", (variant, canonical) => {
    expect(normalize(variant)).toBe(normalize(canonical));
  });

  it("« Node.js » reste « node js » (pas « node javascript »), accents et ponctuation retirés", () => {
    expect(normalize("Node.js")).toBe(" node js ");
    expect(normalize("Équipe C++ / C#, À Lyon !")).toBe(" equipe c++ c# a lyon ");
  });
});

describe("nombres écrits en lettres", () => {
  const WORDS: [string, string][] = [
    ["2", "deux two zwei"],
    ["3", "trois three drei"],
    ["4", "quatre four vier"],
    ["5", "cinq five funf"],
    ["6", "six sechs"],
    ["7", "sept seven sieben"],
    ["8", "huit eight acht"],
    ["10", "dix ten zehn"],
    ["12", "douze twelve zwolf"],
    ["15", "quinze fifteen"],
    ["20", "vingt twenty zwanzig"],
    ["30", "trente thirty"],
    ["50", "cinquante fifty"],
    ["100", "cent hundred hundert"],
    ["1000", "mille thousand tausend"],
  ];
  const cases = WORDS.flatMap(([value, words]) => words.split(" ").map((w) => [w, value] as const));

  it.each(cases)(
    "« %s » sans preuve est signalé ; prouvé par « %s » en chiffres, il est admis",
    (word, value) => {
      expect(withSource(`Livraison de ${word} projets`, "Livraison de projets")).toContainEqual({
        kind: "number",
        value: word,
      });
      expect(withSource(`Livraison de ${word} projets`, `Livraison de ${value} projets`)).toEqual([]);
    },
  );

  it("« un » et « neuf » ne sont pas des nombres (ambigus)", () => {
    expect(withSource("Un projet neuf", "Projet")).toEqual([]);
  });
});

describe("ordres de grandeur et titres contrôlés", () => {
  it.each([
    "dizaine",
    "douzaine",
    "vingtaine",
    "centaine",
    "milliers",
    "millions",
    "milliards",
    "doublé",
    "triplé",
    "quadruplé",
  ])("« %s » doit figurer dans la source", (word) => {
    const issues = withSource(`Chiffre d'affaires ${word} grâce au projet`, "Chiffre d'affaires du projet");
    expect(issues.some((i) => i.kind === "number" && normalize(word).includes(i.value))).toBe(true);
    expect(
      withSource(`Chiffre d'affaires ${word} grâce au projet`, `Chiffre d'affaires ${word} du projet`),
    ).toEqual([]);
  });

  it.each([
    "master",
    "licence",
    "bachelor",
    "doctorat",
    "phd",
    "mba",
    "bts",
    "dut",
    "diplômée",
    "ingénieure",
    "certifiée",
    "senior",
    "lead",
    "experte",
    "architecte",
    "manager",
    "directeur",
    "directrice",
    "cheffe",
    "responsable",
    "head",
    "cto",
  ])("titre ou diplôme « %s » ajouté sans source : signalé", (word) => {
    const issues = inEntry(`Poste de ${word} pour le suivi des projets`);
    expect(issues.some((i) => i.kind === "entity" && normalize(word).trim().startsWith(i.value))).toBe(true);
    expect(withSource(`Poste de ${word} pour le suivi`, `Poste de ${word} pour le suivi`)).toEqual([]);
  });

  it("un titre déclaré ailleurs dans le profil est admis pour l'accroche (sans entrée)", () => {
    const p = Profile.parse({ ...profile, basics: { ...profile.basics, label: "Développeuse senior" } });
    const line = { text: "Développeuse senior", sources: ["/work/0/highlights/0"] };
    expect(checkLine(line, lineContext(p, []))).toEqual([]);
    expect(checkLine(line, lineContext(p, []), "/work/0").map((i) => i.value)).toContain("senior");
  });
});

describe("unités : « 40 % » ne prouve pas « 40 mois »", () => {
  const GROUPS: [string, string[]][] = [
    ["%", ["%", "pourcent", "percent"]],
    ["an", ["ans", "an", "année", "années", "year", "years", "jahre"]],
    ["mois", ["mois", "month", "months"]],
    ["semaine", ["semaines", "semaine", "week", "weeks"]],
    ["jour", ["jours", "jour", "day", "days"]],
    ["heure", ["heures", "heure", "h", "hour", "hours"]],
    ["€", ["€", "eur", "euros"]],
    ["k", ["k", "k€"]],
    ["fois", ["fois", "x", "times"]],
  ];
  const cases = GROUPS.flatMap(([group, units]) => units.map((u) => [u, group, units[0]!] as const));

  it.each(cases)(
    "« 40 %s » (groupe %s) : admis par « 40 %s », refusé par une autre unité",
    (unit, group, first) => {
      expect(withSource(`Gain de 40 ${unit} sur le délai`, `Gain de 40 ${first} sur le délai`)).toEqual([]);
      const other = group === "jour" ? "mois" : "jours";
      expect(
        withSource(`Gain de 40 ${unit} sur le délai`, `Gain de 40 ${other} sur le délai`),
      ).toContainEqual({
        kind: "number",
        value: `40 ${group}`,
      });
    },
  );

  it("unité collée au nombre, décimales à virgule ou à point", () => {
    expect(withSource("Hausse de 40% des ventes", "Hausse de 40 % des ventes")).toEqual([]);
    expect(withSource("Hausse de 40ans des ventes", "Hausse de 40 % des ventes")).toContainEqual({
      kind: "number",
      value: "40 an",
    });
    expect(withSource("Budget de 2.45 k€ géré", "Budget de 2,45 k€ géré")).toEqual([]);
    expect(withSource("Budget de 2,46 k€ géré", "Budget de 2,45 k€ géré")).toContainEqual({
      kind: "number",
      value: "2.46",
    });
    expect(withSource("Budget de 2,4 k€ géré", "Budget de 2,45 k€ géré")).toContainEqual({
      kind: "number",
      value: "2.4",
    });
  });

  it("une année est une date ; un nombre à 5 chiffres n'en est pas une", () => {
    expect(withSource("Projet livré en 2022", "Projet livré")).toContainEqual({
      kind: "date",
      value: "2022",
    });
    expect(withSource("Référence 12022 traitée", "Référence traitée")).toContainEqual({
      kind: "number",
      value: "12022",
    });
    expect(withSource("Référence 20221 traitée", "Référence traitée")).toContainEqual({
      kind: "number",
      value: "20221",
    });
  });
});

describe("entités et mots-clés", () => {
  it.each([
    ["chiffre et lettre", "Stockage sur S3", "S3"],
    ["signe technique", "Développement en C#", "C#"],
    ["sigle", "Déploiement sur AWS", "AWS"],
    ["nom propre en milieu de phrase", "Diffusion par Kafka", "Kafka"],
  ])("%s : « %s » sans source → entité « %s »", (_cas, text, entity) => {
    expect(withSource(text, "Développement et déploiement, stockage et diffusion")).toContainEqual({
      kind: "entity",
      value: entity,
    });
  });

  it("une majuscule en début de ligne, ou une lettre isolée, n'est pas une entité", () => {
    expect(withSource("Stockage des fichiers", "stockage des fichiers")).toEqual([]);
    expect(withSource("Stockage plan a", "stockage plan a")).toEqual([]);
  });

  it("un mot-clé de l'offre vide ou réduit à de la ponctuation ne signale rien", () => {
    const blank = { ...ctx(), missingKeywords: ["", "  ", "!!!"] };
    expect(
      checkLine({ text: "Suivi des projets de l'équipe", sources: ["/work/0/highlights/0"] }, blank),
    ).toEqual([]);
  });

  it("source inconnue, ou d'une autre entrée, signalée comme telle", () => {
    expect(inEntry("Suivi des projets de l'équipe", "/work/9/highlights/0")).toContainEqual({
      kind: "unresolved-source",
      value: "/work/9/highlights/0",
    });
    expect(inEntry("Maintenance de sites PHP pour 20 clients", "/work/1/highlights/0")).toContainEqual({
      kind: "foreign-source",
      value: "/work/1/highlights/0",
    });
  });
});

describe("contrôle du CV complet", () => {
  const cv = (over: Partial<TailoredCv> = {}): TailoredCv => ({
    headline: { text: "Développeuse back-end", sources: ["/basics/label"] },
    summary: [
      {
        text: "Développeuse back-end, 5 ans d'expérience sur des API Node.js.",
        sources: ["/basics/summary"],
      },
    ],
    work: [
      {
        ref: "/work/0",
        highlights: [
          {
            text: "Réduction de 40 % du temps de réponse de l'API de réservation",
            sources: ["/work/0/highlights/2"],
          },
          // Source d'une autre expérience : signalée par l'entrée à laquelle appartient la ligne.
          { text: "Maintenance de sites PHP pour 20 clients", sources: ["/work/1/highlights/0"] },
        ],
      },
      {
        ref: "/work/1",
        highlights: [{ text: "Maintenance de sites PHP pour 20 clients", sources: ["/work/1/highlights/0"] }],
      },
    ],
    projects: [
      {
        ref: "/projects/0",
        highlights: [{ text: "Contrôle de fidélité en Rust", sources: ["/projects/0/highlights/0"] }],
      },
    ],
    education: [],
    skills: ["/skills/0", "/skills/1"],
    languages: [],
    certificates: [],
    missingKeywords: [],
    ...over,
  });

  it("contrôle titre, accroche, expériences et projets ; retire les lignes non prouvées", () => {
    const { report, cv: cleaned, removed } = checkFaithfulness(cv(), profile);
    expect(report.lines.map((l) => [l.path, l.status])).toEqual([
      ["/headline", "supported"],
      ["/summary/0", "supported"],
      ["/work/0/highlights/0", "supported"],
      ["/work/0/highlights/1", "unsupported"],
      ["/work/1/highlights/0", "supported"],
      ["/projects/0/highlights/0", "unsupported"],
    ]);
    expect(report).toMatchObject({ checkedLines: 6, supportedLines: 4, score: 4 / 6 });
    expect(report.lines[3]!.issues).toContainEqual({ kind: "foreign-source", value: "/work/1/highlights/0" });
    expect(removed.map((r) => r.path)).toEqual(["/work/0/highlights/1", "/projects/0/highlights/0"]);
    expect(cleaned.headline?.text).toBe("Développeuse back-end");
    expect(cleaned.work.map((w) => w.highlights.length)).toEqual([1, 1]);
    expect(cleaned.projects[0]!.highlights).toEqual([]);
    expect(cleaned.skills).toEqual(["/skills/0", "/skills/1"]);
  });

  it("retire l'accroche non prouvée, les entrées et compétences introuvables dans le profil", () => {
    const { cv: cleaned } = checkFaithfulness(
      cv({
        headline: { text: "Architecte cloud senior", sources: ["/basics/label"] },
        work: [{ ref: "/work/7", highlights: [] }, ...cv().work],
        projects: [{ ref: "/projects/4", highlights: [] }],
        skills: ["/skills/0", "/skills/9"],
      }),
      profile,
    );
    expect(cleaned.headline).toBeUndefined();
    expect(cleaned.work.map((w) => w.ref)).toEqual(["/work/0", "/work/1"]);
    expect(cleaned.projects).toEqual([]);
    expect(cleaned.skills).toEqual(["/skills/0"]);
  });

  it("CV sans ligne rédigée : score 1, rien à retirer", () => {
    const { report } = checkFaithfulness(
      cv({ headline: undefined, summary: [], work: [], projects: [] }),
      profile,
    );
    expect(report).toMatchObject({ score: 1, checkedLines: 0, supportedLines: 0 });
  });
});

describe("propriétés (fuzzing fast-check)", () => {
  it("normalize : idempotente, entourée d'espaces, sans majuscule, accent ni ponctuation (hors + et #)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (text) => {
        const once = normalize(text);
        expect(once).toMatch(/^ [a-z0-9+# ]* $/);
        expect(normalize(once)).toBe(once);
      }),
      { numRuns: 3000 },
    );
  });

  it("sanitizeText : plus aucun caractère de format invisible, idempotente", () => {
    const invisible = fc.constantFrom("​", "‍", "⁠", "‮", "﻿", "­");
    const text = fc
      .array(fc.oneof(fc.string({ maxLength: 4 }), invisible), { maxLength: 20 })
      .map((p) => p.join(""));
    fc.assert(
      fc.property(text, (t) => {
        const clean = sanitizeText(t);
        expect(clean).not.toMatch(/\p{Cf}/u);
        expect(sanitizeText(clean)).toBe(clean);
      }),
    );
  });

  const token = fc.constantFrom(
    "Node.js",
    "API",
    "40",
    "%",
    "ans",
    "Migration",
    "de",
    "services",
    "PostgreSQL",
    "équipe",
    "2021",
    "k8s",
    "C#",
    "S3",
    "dizaine",
    "senior",
    "deux",
    "1,5",
    "M€",
    "vers",
    "Kafka",
  );
  const sentence = fc.array(token, { minLength: 1, maxLength: 12 }).map((t) => t.join(" "));

  it("une ligne recopiée de sa source est toujours admise", () => {
    fc.assert(
      fc.property(sentence, (s) => {
        expect(withSource(s, s)).toEqual([]);
      }),
      { numRuns: 1000 },
    );
  });

  it("un nombre absent de la source est toujours signalé", () => {
    fc.assert(
      fc.property(sentence, fc.integer({ min: 3000, max: 999_999 }), (s, n) => {
        expect(withSource(`${s} ${n}`, s)).toContainEqual({ kind: "number", value: String(n) });
      }),
      { numRuns: 500 },
    );
  });

  it("le rapport est cohérent : score dans [0, 1], lignes retirées = lignes non prouvées", () => {
    const facts = [
      "/basics/label",
      "/basics/summary",
      "/work/0/highlights/0",
      "/work/0/highlights/2",
      "/work/1/highlights/0",
      "/projects/0/highlights/0",
      "/work/5/highlights/0",
    ];
    const line = fc.record({ text: sentence, sources: fc.subarray(facts, { minLength: 1, maxLength: 2 }) });
    fc.assert(
      fc.property(
        fc.array(line, { maxLength: 4 }),
        fc.array(line, { maxLength: 4 }),
        (summary, highlights) => {
          const tailored: TailoredCv = {
            summary,
            work: [{ ref: "/work/0", highlights }],
            projects: [],
            education: [],
            skills: [],
            languages: [],
            certificates: [],
            missingKeywords: [],
          };
          const { report, cv: cleaned, removed } = checkFaithfulness(tailored, profile);
          expect(report.score).toBeGreaterThanOrEqual(0);
          expect(report.score).toBeLessThanOrEqual(1);
          expect(report.checkedLines).toBe(summary.length + highlights.length);
          expect(removed).toHaveLength(report.checkedLines - report.supportedLines);
          expect(cleaned.summary.length + cleaned.work[0]!.highlights.length).toBe(report.supportedLines);
        },
      ),
      { numRuns: 500 },
    );
  });
});
