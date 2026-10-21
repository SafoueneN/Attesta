import { describe, expect, it } from "vitest";
import {
  comparePartialDates,
  findUnresolvedRefs,
  Profile,
  resolvePointer,
  TailoredCv,
  toJsonSchemas,
} from "../src/index.js";
import { leaProfile } from "./fixtures.js";

const validCv = {
  summary: [{ text: "5 ans d'expérience sur des API Node.js", sources: ["/basics/summary"] }],
  work: [
    {
      ref: "/work/0",
      highlights: [{ text: "API de réservation 40 % plus rapide", sources: ["/work/0/highlights/1"] }],
    },
  ],
  projects: [],
  education: [{ ref: "/education/0" }],
  skills: ["/skills/0"],
  languages: [],
  certificates: [],
  missingKeywords: ["Kubernetes"],
};

describe("Profile", () => {
  it("accepte un profil complet conforme à JSON Resume", () => {
    // Arrange / Act
    const result = Profile.safeParse(leaProfile);
    // Assert
    expect(result.success).toBe(true);
  });

  it("rejette une date mal formée", () => {
    const input = { ...leaProfile, work: [{ ...leaProfile.work![0]!, startDate: "03/2021" }] };
    const result = Profile.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejette une date de fin antérieure à la date de début", () => {
    const input = { ...leaProfile, work: [{ ...leaProfile.work![0]!, endDate: "2020-12" }] };
    const result = Profile.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["work", 0, "endDate"]);
  });
});

describe("comparePartialDates", () => {
  it("compare des dates de précisions différentes", () => {
    expect(comparePartialDates("2020", "2020-01-01")).toBe(0);
    expect(comparePartialDates("2019-12", "2020")).toBeLessThan(0);
  });
});

describe("TailoredCv", () => {
  it("accepte un CV dont chaque ligne cite une source", () => {
    expect(TailoredCv.safeParse(validCv).success).toBe(true);
  });

  it("rejette une ligne sans source", () => {
    const input = { ...validCv, summary: [{ text: "Experte Kubernetes", sources: [] }] };
    expect(TailoredCv.safeParse(input).success).toBe(false);
  });

  it("rejette une référence vers la mauvaise section", () => {
    const input = { ...validCv, skills: ["/work/0"] };
    expect(TailoredCv.safeParse(input).success).toBe(false);
  });
});

describe("findUnresolvedRefs", () => {
  const profile = Profile.parse(leaProfile);

  it("résout un pointeur vers un fait du profil", () => {
    expect(resolvePointer(profile, "/work/0/highlights/0")).toBe(
      "Migration de 12 services Express vers Node.js 20",
    );
  });

  it("ne signale rien quand toutes les sources existent", () => {
    expect(findUnresolvedRefs(TailoredCv.parse(validCv), profile)).toEqual([]);
  });

  it("signale une source inventée", () => {
    const cv = TailoredCv.parse({
      ...validCv,
      work: [{ ref: "/work/0", highlights: [{ text: "Lead technique", sources: ["/work/0/highlights/7"] }] }],
    });
    expect(findUnresolvedRefs(cv, profile)).toEqual(["/work/0/highlights/7"]);
  });
});

describe("toJsonSchemas", () => {
  it("exporte un JSON Schema par contrat", () => {
    const schemas = toJsonSchemas();
    expect(Object.keys(schemas)).toEqual([
      "Profile",
      "JobOfferInput",
      "OfferAnalysis",
      "TailoredCv",
      "FaithfulnessReport",
    ]);
    expect(schemas.TailoredCv).toMatchObject({ type: "object" });
  });
});
