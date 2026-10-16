import { describe, expect, it } from "vitest";
import { Profile, TailoredCv } from "@attesta/schema";
import {
  assemble,
  checkFaithfulness,
  checkLine,
  lineContext,
  missingKeywords,
  normalize,
  offerTerms,
  sanitizeText,
} from "../src/index.js";
import { analysis, honestDraft, inventedDraft, lea } from "./fixtures.js";

const ctx = lineContext(lea, ["Kubernetes"]);
const check = (text: string, sources: string[]) => checkLine({ text, sources }, ctx);

describe("checkLine", () => {
  it("accepte une reformulation qui garde chiffres et entités des sources", () => {
    expect(
      check("Réduction de 40 % du temps de réponse d'une API de réservation", ["/work/0/highlights/1"]),
    ).toEqual([]);
  });

  it("signale un chiffre modifié", () => {
    expect(check("Réduction de 60 % du temps de réponse", ["/work/0/highlights/1"])).toContainEqual({
      kind: "number",
      value: "60",
    });
  });

  it("signale une année absente des sources", () => {
    expect(check("Migration de 12 services en 2022", ["/work/0/highlights/0"])).toContainEqual({
      kind: "date",
      value: "2022",
    });
  });

  it("signale un outil absent des sources et des compétences", () => {
    expect(check("Migration de 12 services sur AWS Lambda", ["/work/0/highlights/0"])).toEqual(
      expect.arrayContaining([
        { kind: "entity", value: "AWS" },
        { kind: "entity", value: "Lambda" },
      ]),
    );
  });

  it("signale une compétence de l'offre absente du profil, même en minuscules", () => {
    expect(check("Déploiement sur kubernetes", ["/work/0/highlights/0"])).toContainEqual({
      kind: "skill",
      value: "Kubernetes",
    });
  });

  it("admet une compétence déclarée ailleurs dans le profil pour le titre et l'accroche seulement", () => {
    const line = { text: "Développeuse Node.js et PostgreSQL", sources: ["/basics/label"] };
    expect(checkLine(line, ctx)).toEqual([]);
    expect(
      checkLine({ ...line, sources: ["/work/0/highlights/0"] }, ctx, "/work/0").map((i) => i.value),
    ).toContain("PostgreSQL");
  });

  describe("contournements relevés par la relecture indépendante", () => {
    it("une source prise dans une autre expérience est signalée", () => {
      expect(
        checkLine(
          { text: "Maintenance de sites PHP pour 20 clients", sources: ["/work/1/highlights/0"] },
          ctx,
          "/work/0",
        ),
      ).toContainEqual({ kind: "foreign-source", value: "/work/1/highlights/0" });
    });

    it("les nombres écrits en lettres et les ordres de grandeur doivent être prouvés", () => {
      const values = (text: string) => check(text, ["/work/0/highlights/0"]).map((i) => i.value);
      expect(values("Encadrement d'une équipe de dix développeurs")).toContain("dix");
      expect(values("Services utilisés par des millions de personnes")).toContain("million");
      expect(values("Migration de douze services Express")).toEqual([]);
    });

    it("un nombre doit garder son unité", () => {
      const ctxDuree = lineContext(
        Profile.parse({
          basics: { name: "X" },
          work: [{ name: "A", position: "B", startDate: "2020", highlights: ["Gain de 40 % en 2 mois"] }],
        }),
        [],
      );
      expect(
        checkLine({ text: "Gain de 2 % en 40 mois", sources: ["/work/0/highlights/0"] }, ctxDuree).length,
      ).toBeGreaterThan(0);
      expect(
        checkLine({ text: "Gain de 40 % en 2 mois", sources: ["/work/0/highlights/0"] }, ctxDuree),
      ).toEqual([]);
    });

    it("titres, niveaux et diplômes absents du profil sont signalés", () => {
      expect(check("Architecte logiciel senior", ["/basics/label"]).map((i) => i.value)).toEqual(
        expect.arrayContaining(["architect", "senior"]),
      );
      expect(
        check("Titulaire d'un master en informatique", ["/basics/summary"]).map((i) => i.value),
      ).toContain("master");
    });

    it("un caractère invisible ne masque pas une compétence absente", () => {
      const withGuard = lineContext(lea, [], "Poste Node.js avec Terraform et Ansible.");
      const text = "Terraform​ : déploiement des services";
      expect(checkLine({ text, sources: ["/work/0/highlights/0"] }, withGuard, "/work/0")).toContainEqual({
        kind: "skill",
        value: "Terraform",
      });
      expect(sanitizeText("Doc​ker")).toBe("Docker");
    });

    it("les termes de l'offre servent de garde-fou même si l'analyse LLM est vide", () => {
      const emptyAnalysisCtx = lineContext(lea, [], "Développeur. Une expérience de Kubernetes est un plus.");
      expect(
        checkLine(
          { text: "déploiement sur kubernetes", sources: ["/work/0/highlights/0"] },
          emptyAnalysisCtx,
        ),
      ).toContainEqual({ kind: "skill", value: "Kubernetes" });
      expect(offerTerms("Poste à Lyon.\nVous maîtrisez PostgreSQL et Kubernetes.")).toEqual([
        "Lyon",
        "PostgreSQL",
        "Kubernetes",
      ]);
    });
  });

  it("signale une source qui n'existe pas dans le profil", () => {
    expect(check("Mise en place de la CI", ["/work/0/highlights/9"])).toContainEqual({
      kind: "unresolved-source",
      value: "/work/0/highlights/9",
    });
  });

  it("rapproche les variantes d'écriture courantes", () => {
    expect(normalize("NodeJS")).toBe(normalize("Node.js"));
    expect(normalize("Postgres")).toBe(normalize("PostgreSQL"));
  });

  it("limite connue : un verbe gonflé sans entité nouvelle n'est pas détecté", () => {
    // « Participation » devient « Direction » : seule la relecture humaine l'attrape.
    expect(check("Direction des revues de code de l'équipe", ["/work/0/highlights/2"])).toEqual([]);
  });
});

describe("missingKeywords", () => {
  it("signale les termes de l'offre sans trace dans le profil, sans doublon", () => {
    expect(missingKeywords(analysis, lea)).toEqual(["Kubernetes"]);
  });
});

describe("checkFaithfulness", () => {
  const tailored = (draft: typeof honestDraft) =>
    TailoredCv.parse(assemble(draft, lea, missingKeywords(analysis, lea)));

  it("donne 100 % à une rédaction fidèle", () => {
    const { report, removed } = checkFaithfulness(tailored(honestDraft), lea);

    expect(report.score).toBe(1);
    expect(report.checkedLines).toBe(5);
    expect(removed).toEqual([]);
  });

  it("retire chaque invention et explique pourquoi", () => {
    const { report, cv, removed } = checkFaithfulness(tailored(inventedDraft), lea);

    expect(removed.map((r) => r.text)).toEqual([
      "Experte Kubernetes avec 5 ans d'expérience",
      "Réduction de 60 % du temps de réponse de l'API de réservation",
      "Migration de 12 services vers Node.js 20 sur AWS Lambda",
      "Mise en place de la CI",
    ]);
    expect(cv.summary).toEqual([]);
    expect(cv.work[0]?.highlights.map((h) => h.text)).toEqual([
      "Migration de 12 services Express vers Node.js 20",
    ]);
    expect(report.supportedLines).toBe(3);
    expect(report.checkedLines).toBe(7);
  });
});

describe("assemble", () => {
  it("ne perd aucune entrée du profil et recopie à l'identique celles que le modèle omet", () => {
    const cv = TailoredCv.parse(assemble(honestDraft, lea, []));

    expect(cv.work.map((e) => e.ref)).toEqual(["/work/0", "/work/1"]);
    expect(cv.work[1]?.highlights).toEqual([
      { text: "Maintenance de sites PHP pour 20 clients", sources: ["/work/1/highlights/0"] },
    ]);
    expect(cv.education).toEqual([{ ref: "/education/0" }]);
    expect(cv.languages).toEqual(["/languages/0"]);
  });

  it("dédoublonne une expérience citée deux fois et écarte les compétences inconnues", () => {
    const draft = {
      ...honestDraft,
      work: [...honestDraft.work, ...honestDraft.work],
      skills: ["/skills/7", "/skills/1"],
    };
    const cv = TailoredCv.parse(assemble(draft, lea, []));

    expect(cv.work.map((e) => e.ref)).toEqual(["/work/0", "/work/1"]);
    expect(cv.skills).toEqual(["/skills/1", "/skills/0"]);
  });
});
