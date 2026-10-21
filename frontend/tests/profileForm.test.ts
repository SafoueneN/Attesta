import { Profile } from "@attesta/shared-schemas";
import { describe, expect, it } from "vitest";
import { describeIssue, describePointer, factText } from "../src/lib/describe";
import {
  draftFromImported,
  draftFromProfile,
  emptyDraft,
  validateStep,
  validProfile,
  type Draft,
} from "../src/lib/profileForm";

const filled = (): Draft => ({
  ...emptyDraft(),
  basics: {
    ...emptyDraft().basics,
    name: "Léa Martin",
    label: "Développeuse back-end",
    city: "Lyon",
    countryCode: "fr",
  },
  work: [
    {
      name: "Transports Rhône",
      position: "Développeuse back-end",
      location: "",
      startDate: "2021-03",
      endDate: "",
      summary: "",
      highlights: "Migration de 12 services Express\n\nRéduction de 40 % du temps de réponse",
    },
  ],
  skills: "Node.js : Express, PostgreSQL\nDocker",
  languages: "Anglais : C1",
});

describe("formulaire de profil", () => {
  it("convertit la saisie brute vers le contrat Profile", () => {
    const profile = validProfile(filled())!;
    expect(profile.basics.location).toEqual({ city: "Lyon", countryCode: "FR" });
    expect(profile.work[0]!.highlights).toEqual([
      "Migration de 12 services Express",
      "Réduction de 40 % du temps de réponse",
    ]);
    expect(profile.skills).toEqual([
      { name: "Node.js", keywords: ["Express", "PostgreSQL"] },
      { name: "Docker", keywords: [] },
    ]);
    expect(profile.languages).toEqual([{ language: "Anglais", fluency: "C1" }]);
    expect(profile.education).toEqual([]);
  });

  it("rattache les erreurs aux champs du formulaire, en français", () => {
    const draft = filled();
    draft.basics.name = "";
    draft.basics.email = "pas-une-adresse";
    expect(
      validateStep(draft, 1)
        .map((e) => e.field)
        .sort(),
    ).toEqual(["basics-email", "basics-name"]);
    draft.work[0]!.startDate = "mars 2021";
    const errors = validateStep(draft, 2);
    expect(errors[0]).toMatchObject({ field: "work-0-startDate", message: expect.stringMatching(/AAAA/) });
  });

  it("exige une expérience ou une formation", () => {
    const draft = {
      ...filled(),
      work: [{ ...filled().work[0]!, name: "", position: "", startDate: "", highlights: "" }],
    };
    expect(validateStep(draft, 2)).toEqual([
      { field: "work-0-position", message: "Ajoutez au moins une expérience ou une formation." },
    ]);
  });

  it("refuse une offre trop courte", () => {
    const draft = { ...filled(), offer: { rawText: "Dév", sourceUrl: "" } };
    expect(validateStep(draft, 3)[0]!.field).toBe("offer-rawText");
  });

  it("relit un profil enregistré sans perte (aller-retour)", () => {
    const profile = validProfile(filled())!;
    expect(validProfile(draftFromProfile(profile))).toEqual(profile);
  });

  it("pré-remplit depuis un CV importé, en gardant l'offre en cours", () => {
    const current = { ...emptyDraft(), offer: { rawText: "offre en cours", sourceUrl: "" } };
    const draft = draftFromImported(
      {
        basics: {
          name: "Sam Durand",
          label: null,
          email: null,
          phone: null,
          city: "Paris",
          countryCode: "FRA",
          url: null,
          summary: null,
        },
        work: [
          {
            name: "ACME",
            position: "Dév",
            location: null,
            startDate: "2020",
            endDate: null,
            summary: null,
            highlights: [" Refonte ", ""],
          },
        ],
        education: [],
        skills: [{ name: "PHP", keywords: ["Symfony"] }],
        languages: [{ language: "Anglais", fluency: null }],
      },
      current,
    );
    expect(draft.basics).toMatchObject({ name: "Sam Durand", countryCode: "FR" });
    expect(draft.work[0]!.highlights).toBe("Refonte");
    expect(draft.education).toHaveLength(1);
    expect(draft.skills).toBe("PHP : Symfony");
    expect(draft.offer.rawText).toBe("offre en cours");
  });
});

describe("libellés de traçabilité", () => {
  const profile = Profile.parse(validProfile(filled()));
  it("décrit une source et en donne le texte", () => {
    expect(describePointer(profile, "/work/0/highlights/1")).toBe(
      "Expérience 1 (Développeuse back-end) – réalisation 2",
    );
    expect(describePointer(profile, "/skills/0")).toBe("Compétence : Node.js");
    expect(factText(profile, "/work/0/highlights/1")).toBe("Réduction de 40 % du temps de réponse");
    expect(factText(profile, "/skills/0")).toBe("Node.js : Express, PostgreSQL");
    expect(factText(profile, "/work/9/highlights/0")).toBeUndefined();
  });

  it("explique chaque écart en français", () => {
    expect(describeIssue({ kind: "number", value: "60" })).toBe(
      "le chiffre « 60 » ne figure pas dans la source",
    );
    expect(describeIssue({ kind: "skill", value: "Kubernetes" })).toMatch(/absent de votre profil/);
  });
});
