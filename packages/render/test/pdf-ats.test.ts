import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  PdfTimeoutError,
  PuppeteerPdfRenderer,
  renderCvHtml,
  viewFromProfile,
  type CvView,
} from "../src/index.js";
import { lea } from "./fixtures.js";

/** Texte d'un PDF tel qu'un ATS l'extrait, espaces normalisés. */
async function extractText(pdf: Uint8Array): Promise<string> {
  const task = getDocument({ data: pdf.slice(), useSystemFonts: false });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await task.destroy();
  return normalize(pages.join(" "));
}

/** Espaces normalisés, casse ignorée (les titres de section sont en capitales à l'affichage). */
const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("fr");

/** Toutes les chaînes visibles du CV, dans l'ordre du DOM. */
function expectedSequence(view: CvView): string[] {
  return [
    view.name,
    ...(view.headline ? [view.headline] : []),
    ...view.sections.flatMap((s) => [
      s.title,
      ...s.entries.flatMap((e) => [e.title, ...(e.period ? [e.period] : []), ...e.lines.map((l) => l.text)]),
      ...s.items.map((i) => i.text),
    ]),
  ].map(normalize);
}

describe("PDF : compatibilité ATS", () => {
  const renderer = new PuppeteerPdfRenderer({ maxConcurrency: 2, timeoutMs: 30_000 });
  const view = viewFromProfile(lea);
  const texts: Record<string, string> = {};

  beforeAll(async () => {
    for (const variant of ["ats", "design"] as const) {
      const pdf = await renderer.render(renderCvHtml(view, { variant }));
      expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
      texts[variant] = await extractText(pdf);
    }
  });

  afterAll(() => renderer.close());

  for (const variant of ["ats", "design"]) {
    it(`${variant} : tout le texte est extractible, dans l'ordre de l'aperçu (une colonne)`, () => {
      const text = texts[variant]!;
      let cursor = 0;
      for (const expected of expectedSequence(view)) {
        const found = text.indexOf(expected, cursor);
        expect(found, `« ${expected} » absent ou hors ordre`).toBeGreaterThanOrEqual(cursor);
        cursor = found + expected.length;
      }
    });

    it(`${variant} : les dates suivent un format unique`, () => {
      const dates = texts[variant]!.match(/\b\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}(-\d{2})?\b/g) ?? [];
      expect(dates.length).toBeGreaterThan(0);
      for (const date of dates) expect(date).toMatch(/^\d{2}\/\d{4}$/);
    });
  }

  it("interrompt un rendu qui dépasse le délai", async () => {
    const slow = new PuppeteerPdfRenderer({ maxConcurrency: 1, timeoutMs: 1 });
    try {
      await expect(slow.render(renderCvHtml(view, { variant: "ats" }))).rejects.toBeInstanceOf(
        PdfTimeoutError,
      );
    } finally {
      await slow.close();
    }
  });
});
