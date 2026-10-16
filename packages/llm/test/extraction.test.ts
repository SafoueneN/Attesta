import { afterAll, describe, expect, it } from "vitest";
import { PuppeteerPdfRenderer, renderCvHtml, viewFromProfile } from "@attesta/render";
import { extractPdfText, extractProfile, isPdf, PdfImportError, ScriptedProvider } from "../src/index.js";
import { lea } from "./fixtures.js";

describe("import de CV PDF", () => {
  const renderer = new PuppeteerPdfRenderer({ maxConcurrency: 1, timeoutMs: 30_000 });
  afterAll(() => renderer.close());

  it("reconnaît un PDF à sa signature, pas à son extension", () => {
    expect(isPdf(new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(isPdf(new TextEncoder().encode("<html>"))).toBe(false);
  });

  it("refuse un fichier qui n'est pas un PDF", async () => {
    await expect(extractPdfText(new TextEncoder().encode("MZ exécutable"))).rejects.toBeInstanceOf(
      PdfImportError,
    );
  });

  it("refuse un fichier de plus de 5 Mo", async () => {
    await expect(extractPdfText(new Uint8Array(5 * 1024 * 1024 + 1))).rejects.toThrow("5 Mo");
  });

  it("extrait le texte d'un vrai CV PDF", async () => {
    const pdf = await renderer.render(renderCvHtml(viewFromProfile(lea), { variant: "ats" }));

    const text = await extractPdfText(pdf);

    expect(text).toContain("Léa Martin");
    expect(text).toContain("Réduction de 40 % du temps de réponse");
  });

  it("confie le texte au modèle comme donnée balisée", async () => {
    const extracted = {
      basics: {
        name: "Léa Martin",
        label: null,
        email: null,
        phone: null,
        city: null,
        countryCode: null,
        url: null,
        summary: null,
      },
      work: [],
      education: [],
      skills: [],
      languages: [],
    };
    const provider = new ScriptedProvider({ "extraction-cv": [{ data: extracted }] });

    const { profile } = await extractProfile(provider, "Léa Martin\nDéveloppeuse");

    expect(profile.basics.name).toBe("Léa Martin");
    expect(provider.requests[0]!.messages[0]!.content).toMatch(/^<cv>\n/);
  });
});

describe("ancrage de l'extraction dans le PDF", () => {
  it("écarte ce que le modèle a ajouté et qui ne figure pas dans le PDF", async () => {
    const { groundExtraction } = await import("../src/index.js");
    const pdfText =
      "Sam Durand\nDéveloppeur chez ACME\nRefonte du site vitrine en 2021\nCompétences : PHP, Symfony";
    const extracted = {
      basics: {
        name: "Sam Durand",
        label: null,
        email: null,
        phone: null,
        city: null,
        countryCode: null,
        url: null,
        summary: null,
      },
      work: [
        {
          name: "ACME",
          position: "Développeur",
          location: null,
          startDate: null,
          endDate: null,
          summary: null,
          highlights: ["Refonte du site vitrine en 2021", "Pilotage d'une équipe de 8 personnes"],
        },
      ],
      education: [],
      skills: [
        { name: "PHP", keywords: ["Symfony", "Laravel"] },
        { name: "Kubernetes", keywords: [] },
      ],
      languages: [],
    };

    const { profile, dropped } = groundExtraction(extracted, pdfText);

    expect(profile.work[0]!.highlights).toEqual(["Refonte du site vitrine en 2021"]);
    expect(profile.skills).toEqual([{ name: "PHP", keywords: ["Symfony"] }]);
    expect(dropped).toBe(3);
  });
});
