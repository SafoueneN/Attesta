import type { Profile } from "@attesta/shared-schemas";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyNorms, NORMS, personalLines, signatureLine, type CvNorms } from "../src/render/norms.js";
import type { CvView } from "../src/render/view.js";

/*
 * Usages du CV par pays (ADR 0036) : table de décision complète (pays × information × langue), en boîte
 * blanche, et propriétés (fast-check) sur des profils quelconques.
 */

const basics: Profile["basics"] = {
  name: "Amina Diallo",
  location: { city: "Lille", countryCode: "FR" },
  birthDate: "1990-04-12",
  nationality: "française",
  workPermit: "résidente permanente (Canada)",
  drivingLicence: "B",
} as Profile["basics"];
const view = (lang: CvView["lang"] = "fr"): CvView => ({
  lang,
  name: "Amina Diallo",
  contact: [],
  sections: [],
  personal: [],
});
const photo = { mimeType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) };

describe("table de décision : ce que chaque pays fait figurer", () => {
  it.each<[CvNorms, string[]]>([
    [
      "DE",
      [
        "Né(e) le 12/04/1990",
        "Nationalité : française",
        "Autorisation de travail : résidente permanente (Canada)",
        "Permis B",
      ],
    ],
    ["FR", ["Autorisation de travail : résidente permanente (Canada)", "Permis B"]],
    ["CA", ["Autorisation de travail : résidente permanente (Canada)", "Permis B"]],
    ["TN", ["Né(e) le 12/04/1990", "Nationalité : française", "Permis B"]],
  ])("%s (CV en français)", (norms, expected) => {
    expect(personalLines(basics, norms, "fr")).toEqual(expected);
  });

  it.each([
    ["fr", "Né(e) le 12/04/1990", "Nationalité : française", "Permis B"],
    ["de", "Geburtsdatum 12.04.1990", "Staatsangehörigkeit : française", "Führerschein B"],
    ["en", "Date of birth 1990-04-12", "Nationality : française", "Driving licence B"],
  ] as const)("libellés et format de date en %s", (lang, birth, nationality, licence) => {
    const lines = personalLines(basics, "DE", lang);
    expect(lines[0]).toBe(birth);
    expect(lines[1]).toBe(nationality);
    expect(lines.at(-1)).toBe(licence);
  });

  it("n'invente rien : une information absente du profil n'apparaît pas", () => {
    expect(personalLines({ name: "Amina Diallo" } as Profile["basics"], "DE", "fr")).toEqual([]);
  });

  it("photo : Allemagne, France et Tunisie seulement, et seulement si le candidat en a une", () => {
    for (const norms of ["DE", "FR", "TN"] as const) {
      expect(applyNorms(view(), basics, norms, photo).photo).toBe("data:image/jpeg;base64,AQID");
      expect(applyNorms(view(), basics, norms).photo).toBeUndefined();
    }
    expect(applyNorms(view(), basics, "CA", photo).photo).toBeUndefined();
  });

  it("signature « Ville, JJ.MM.AAAA » : Lebenslauf allemand seulement", () => {
    expect(signatureLine(basics, "DE", new Date(2026, 0, 5))).toBe("Lille, 05.01.2026");
    expect(signatureLine(basics, "DE", new Date(2026, 10, 24))).toBe("Lille, 24.11.2026");
    expect(signatureLine({ name: "A" } as Profile["basics"], "DE", new Date(2026, 10, 24))).toBe(
      "24.11.2026",
    );
    for (const norms of ["FR", "CA", "TN"] as const) expect(signatureLine(basics, norms)).toBeUndefined();
  });

  it("applyNorms garde la vue et ajoute informations et signature du pays", () => {
    const v = { ...view("de"), headline: "Projektleiterin" };
    const out = applyNorms(v, basics, "DE");
    expect(out).toMatchObject({ lang: "de", name: "Amina Diallo", headline: "Projektleiterin" });
    expect(out.personal).toEqual(personalLines(basics, "DE", "de"));
    expect(out.signature).toMatch(/^Lille, \d{2}\.\d{2}\.\d{4}$/);
    expect(applyNorms(v, basics, "FR").signature).toBeUndefined();
  });
});

describe("propriétés (fuzzing fast-check)", () => {
  const anyBasics = fc.record(
    {
      name: fc.string({ minLength: 1, maxLength: 20 }),
      birthDate: fc
        .date({ min: new Date(1950, 0, 1), max: new Date(2008, 0, 1), noInvalidDate: true })
        .map((d) => d.toISOString().slice(0, 10)),
      nationality: fc.string({ minLength: 1, maxLength: 20 }),
      workPermit: fc.string({ minLength: 1, maxLength: 20 }),
      drivingLicence: fc.string({ minLength: 1, maxLength: 5 }),
    },
    { requiredKeys: ["name"] },
  ) as fc.Arbitrary<Profile["basics"]>;
  const norms = fc.constantFrom<CvNorms>("DE", "FR", "CA", "TN");
  const lang = fc.constantFrom("fr", "de", "en" as const);

  it("Canada : jamais d'âge, de nationalité ni de photo, quel que soit le profil", () => {
    fc.assert(
      fc.property(anyBasics, lang, (b, l) => {
        const out = applyNorms(view(l), b, "CA", photo);
        expect(out.photo).toBeUndefined();
        expect(
          out.personal.filter((x) => /Né\(e\)|Geburts|Date of birth|Nationalit|Staatsang/.test(x)),
        ).toEqual([]);
      }),
    );
  });

  it("chaque ligne retenue est autorisée par le pays et recopie une valeur du profil", () => {
    fc.assert(
      fc.property(anyBasics, norms, lang, (b, n, l) => {
        const lines = personalLines(b, n, l);
        const allowed = Object.values(NORMS[n]).filter(Boolean).length;
        expect(lines.length).toBeLessThanOrEqual(allowed);
        const values = [b.nationality, b.workPermit, b.drivingLicence, b.birthDate?.slice(0, 4)].filter(
          Boolean,
        );
        for (const line of lines) expect(values.some((v) => line.includes(v!))).toBe(true);
      }),
    );
  });
});
