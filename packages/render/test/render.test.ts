import { Profile } from "@attesta/schema";
import { describe, expect, it } from "vitest";
import { formatPartialDate, formatPeriod, renderCvHtml, viewFromProfile } from "../src/index.js";
import { lea } from "./fixtures.js";

describe("dates", () => {
  it("formate toutes les précisions au format MM/AAAA", () => {
    expect(formatPartialDate("2021-03-15")).toBe("03/2021");
    expect(formatPartialDate("2021-03")).toBe("03/2021");
    expect(formatPartialDate("2021")).toBe("2021");
  });

  it("formate les périodes ouvertes, fermées et ponctuelles", () => {
    expect(formatPeriod("2021-03", "2023-12", "aujourd'hui")).toBe("03/2021 – 12/2023");
    expect(formatPeriod("2021-03", undefined, "aujourd'hui")).toBe("03/2021 – aujourd'hui");
    expect(formatPeriod(undefined, "2019", "aujourd'hui")).toBe("2019");
    expect(formatPeriod("2019", "2019", "aujourd'hui")).toBe("2019");
    expect(formatPeriod(undefined, undefined, "aujourd'hui")).toBe("");
  });
});

describe("viewFromProfile", () => {
  it("ordonne les sections et rattache chaque ligne à sa source", () => {
    const view = viewFromProfile(lea);

    expect(view.sections.map((s) => s.id)).toEqual([
      "summary",
      "work",
      "education",
      "skills",
      "languages",
      "certificates",
    ]);
    const work = view.sections.find((s) => s.id === "work");
    expect(work?.entries[0]?.lines[1]).toEqual({
      text: "Réduction de 40 % du temps de réponse de l'API de réservation",
      source: "/work/0/highlights/1",
    });
  });

  it("omet les sections vides et compose les contacts", () => {
    const view = viewFromProfile(Profile.parse({ basics: { name: "Sam" } }));
    expect(view.sections).toEqual([]);
    expect(view.contact).toEqual([]);
  });
});

describe("renderCvHtml", () => {
  it("produit un document à un seul h1 et des titres de section standards", () => {
    const html = renderCvHtml(viewFromProfile(lea), { variant: "ats" });

    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toContain('<h2 id="cv-work">Expérience professionnelle</h2>');
    expect(html).toContain('data-source="/work/0/highlights/1"');
    expect(html).toContain("03/2021 – aujourd&#39;hui");
  });

  it("échappe le contenu saisi par le candidat", () => {
    const profile = Profile.parse({ basics: { name: '<script>alert("x")</script>' } });
    const html = renderCvHtml(viewFromProfile(profile), { variant: "ats" });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("interdit scripts et ressources externes par CSP, et embarque les polices", () => {
    const html = renderCvHtml(viewFromProfile(lea), { variant: "design" });

    expect(html).toContain("default-src 'none'");
    expect(html).toContain("url(data:font/woff2;base64,");
    expect(html).not.toMatch(/url\(\.\/files/);
    expect(html).toContain('class="cv cv--design"');
  });

  it("pose le nonce CSP de l'aperçu sur la feuille de style", () => {
    const html = renderCvHtml(viewFromProfile(lea), { variant: "ats", styleNonce: "abc123" });
    expect(html).toContain('<style nonce="abc123">');
  });
});
