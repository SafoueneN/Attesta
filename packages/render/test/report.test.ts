import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  PuppeteerPdfRenderer,
  renderGapsReportHtml,
  renderOffersReportHtml,
  type GapsReportView,
  type OffersReportView,
} from "../src/index.js";

/** Texte et liens d'un PDF, espaces normalisés. */
async function extract(pdf: Uint8Array) {
  const task = getDocument({ data: pdf.slice(), useSystemFonts: false });
  const doc = await task.promise;
  const text: string[] = [];
  const links: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    text.push((await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" "));
    for (const a of await page.getAnnotations()) if (a.url) links.push(a.url);
  }
  await task.destroy();
  return { text: text.join(" ").replace(/\s+/g, " "), links };
}

const offers: OffersReportView = {
  date: "16/10/2026",
  criteria: "Développeur back-end · Berlin (25 km)",
  degraded: false,
  offers: [
    {
      title: "Backend-Entwickler (m/w/d)",
      company: "Beispiel GmbH",
      city: "Berlin",
      postedAt: "15/10/2026",
      url: "https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-0000000001-S",
      source: "Bundesagentur für Arbeit",
      attribution: null,
      pertinence: 82,
      similarity: 71,
      coverage: 67,
      location: null,
      missingSkills: ["Kubernetes", "Terraform"],
    },
    {
      title: "Développeur <script>alert(1)</script>",
      company: null,
      city: "Lyon",
      postedAt: "14/10/2026",
      url: "https://www.adzuna.fr/details/42",
      source: "adzuna",
      attribution: { text: "Jobs by Adzuna", url: "https://www.adzuna.fr" },
      pertinence: null,
      similarity: null,
      coverage: null,
      location: 90,
      missingSkills: [],
    },
  ],
};

const gaps: GapsReportView = {
  date: "16/10/2026",
  criteria: offers.criteria,
  basis: 12,
  gaps: [
    {
      skill: "Kubernetes",
      count: 6,
      frequency: 50,
      salary:
        "offres qui la demandent associées à 60 k€–70 k€ brut/an (médiane 65 k€, autres offres 46 k€ ; 8 offres avec salaire)",
      effort: "moyen",
      priority: 0.45,
    },
    {
      skill: "Terraform",
      count: 2,
      frequency: 17,
      salary: "données insuffisantes",
      effort: "faible",
      priority: 0.03,
    },
  ],
};

describe("rapports de veille", () => {
  const renderer = new PuppeteerPdfRenderer({ maxConcurrency: 2, timeoutMs: 30_000 });
  let offersPdf: Awaited<ReturnType<typeof extract>>;
  let gapsPdf: Awaited<ReturnType<typeof extract>>;

  beforeAll(async () => {
    offersPdf = await extract(await renderer.render(renderOffersReportHtml(offers)));
    gapsPdf = await extract(await renderer.render(renderGapsReportHtml(gaps)));
  });
  afterAll(() => renderer.close());

  it("rapport 1 : offres classées, lien vers la source, attribution, compétences manquantes", () => {
    expect(offersPdf.text).toContain("Backend-Entwickler (m/w/d)");
    expect(offersPdf.text).toContain("Il vous manque, d'après l'offre : Kubernetes, Terraform.");
    expect(offersPdf.text).toContain("Pertinence : 82/100");
    expect(offersPdf.text).toContain("Lieu : non précisé");
    expect(offersPdf.text).toContain("Jobs by Adzuna");
    expect(offersPdf.links).toEqual(
      expect.arrayContaining([
        offers.offers[0]!.url,
        "https://www.adzuna.fr/details/42",
        "https://www.adzuna.fr/",
      ]),
    );
  });

  it("le texte des offres est échappé (aucun script)", () => {
    const html = renderOffersReportHtml(offers);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("default-src 'none'");
  });

  it("rapport 2 : « associé à », jamais « cause » ; formule et limites affichées", () => {
    expect(gapsPdf.text).toContain("associées à 60 k€–70 k€");
    expect(gapsPdf.text).toContain("données insuffisantes");
    expect(gapsPdf.text).toContain("hypothèse de travail");
    expect(gapsPdf.text).toContain("Aucune donnée d'âge, de sexe ou d'origine");
    expect(gapsPdf.text.toLowerCase()).not.toMatch(/\bcaus/);
  });

  it("mode dégradé signalé dans le rapport 1", () => {
    expect(renderOffersReportHtml({ ...offers, degraded: true })).toContain(
      "classées par la recherche seule",
    );
  });
});
