import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterAll, describe, expect, it } from "vitest";
import { longFrenchDate, PuppeteerPdfRenderer, renderLetterHtml } from "../src/render/index.js";
import { httpUpstreams } from "../src/upstreams.js";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("services amont (jeton relayé)", () => {
  it("n'accepte qu'un CV vérifié, relaie le jeton et valide les contrats", async () => {
    const calls: { url: string; auth: string; method: string }[] = [];
    const up = httpUpstreams({ cvGeneration: "http://cv", profiles: "http://profiles" }, (async (
      url: string,
      init: RequestInit,
    ) => {
      calls.push({
        url,
        method: String(init.method),
        auth: (init.headers as Record<string, string>).authorization!,
      });
      if (url.endsWith("/check")) return json(200, { lines: [{ status: "supported", issues: [] }] });
      if (url.includes("/generations/")) return json(409, { status: 409 });
      return json(404, { status: 404 });
    }) as unknown as typeof fetch);
    expect(await up.generation("t", "g")).toBeUndefined();
    expect(await up.profile("t")).toBeUndefined();
    expect((await up.check("t", "g", [{ text: "x", sources: [] }])).lines[0]!.status).toBe("supported");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET http://cv/internal/v1/generations/g",
      "GET http://profiles/internal/v1/profiles/me",
      "POST http://cv/internal/v1/generations/g/check",
    ]);
    expect(calls.every((c) => c.auth === "Bearer t")).toBe(true);
  });
});

describe("rendu d'une lettre (Chromium réel)", () => {
  const renderer = new PuppeteerPdfRenderer({ maxConcurrency: 1, timeoutMs: 30_000 });
  afterAll(() => renderer.close());

  it("imprime une lettre lisible par extraction de texte, accents compris", async () => {
    const pdf = await renderer.render(
      renderLetterHtml({
        name: "Léa Martin",
        contact: ["lea.martin@example.org"],
        date: longFrenchDate(new Date("2026-10-21T12:00:00Z")),
        city: "Lyon",
        company: "Transports Lyonnais",
        subject: "Candidature au poste de Développeur back-end",
        greeting: "Madame, Monsieur,",
        paragraphs: ["J'ai réduit de 40 % le temps de réponse de l'API de réservation."],
        closing: "Veuillez agréer mes salutations distinguées.",
      }),
    );
    const doc = await getDocument({ data: pdf.slice(), useSystemFonts: false }).promise;
    const text = (await (await doc.getPage(1)).getTextContent()).items
      .map((i) => ("str" in i ? i.str : ""))
      .join(" ");
    expect(text).toContain("Léa Martin");
    expect(text).toContain("21 octobre 2026");
    expect(text).toContain("réduit de 40 %");
  });
});
