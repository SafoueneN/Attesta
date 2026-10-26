import { describe, expect, it } from "vitest";
import { Arbeitnow } from "../src/sources/arbeitnow.js";
import { SourceError, type Fetch } from "../src/sources/http.js";
import { RssSource, TUNISIAN_FEEDS, parseRss } from "../src/sources/rss.js";
import { RequestBudget, type Posting, type SourceQuery } from "../src/types.js";

/*
 * Sources sans clé (ADR 0034, 0035) testées sur des API simulées : réponses enregistrées, aucun réseau.
 */

const now = Math.floor(Date.now() / 1000);

async function collect(it: AsyncIterable<Posting>): Promise<Posting[]> {
  const out: Posting[] = [];
  for await (const p of it) out.push(p);
  return out;
}

const options = (budget = new RequestBudget(10), known: string[] = [], skipped = { n: 0 }) => ({
  budget,
  isKnown: async (id: string) => known.includes(id),
  onSkip: () => skipped.n++,
});

describe("Arbeitnow (API simulée)", () => {
  const item = (slug: string, extra: Record<string, unknown> = {}) => ({
    slug,
    company_name: "Beispiel GmbH",
    title: "Backend Developer (m/w/d)",
    description: "<p>Wir suchen Verstärkung für unser Team mit Node.js und für die Cloud.</p>",
    remote: false,
    url: `https://www.arbeitnow.com/jobs/${slug}`,
    tags: ["Node.js"],
    job_types: ["Vollzeit"],
    location: "Berlin",
    created_at: now - 3600,
    ...extra,
  });
  const fetchPages =
    (pages: unknown[][], calls: string[] = []): Fetch =>
    async (url) => {
      calls.push(url);
      const n = Number(new URL(url).searchParams.get("page"));
      const data = pages[n - 1];
      if (!data) return { ok: false, status: 503, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ data, links: { next: n < pages.length ? "next" : null } }),
      };
    };
  const query: SourceQuery = {
    country: "DE",
    occupation: "Backend-Entwickler",
    city: "Berlin",
    radiusKm: 25,
    sinceDays: 3,
  };

  it("filtre par métier (équivalents), rayon et fraîcheur ; normalise l'offre", async () => {
    const source = new Arbeitnow(
      fetchPages([
        [
          item("a"),
          item("loin", { location: "München" }),
          item("ancienne", { created_at: now - 10 * 86_400 }),
          item("autre-metier", { title: "Buchhalter", tags: [] }),
        ],
      ]),
    );
    const found = await collect(source.search(query, options()));
    expect(found.map((p) => p.externalId)).toEqual(["a"]);
    expect(found[0]).toMatchObject({
      source: "arbeitnow",
      city: "Berlin",
      country: "DE",
      lang: "de",
      workingTime: "plein",
      company: "Beispiel GmbH",
      body: expect.not.stringContaining("<p>"),
    });
  });

  it("saute les offres connues et les éléments mal formés (comptés), sans interrompre la page", async () => {
    const skipped = { n: 0 };
    const source = new Arbeitnow(
      fetchPages([[item("a"), { slug: "sans-titre" }, item("b"), item("c", { url: "ftp://x" })]]),
    );
    const found = await collect(source.search(query, options(new RequestBudget(10), ["a"], skipped)));
    expect(found.map((p) => p.externalId)).toEqual(["b"]);
    expect(skipped.n).toBe(2);
  });

  it("lit les pages suivantes, une seule fois par exécution, dans la limite du budget", async () => {
    const calls: string[] = [];
    const source = new Arbeitnow(fetchPages([[item("a")], [item("b")], [item("c")]], calls));
    const budget = new RequestBudget(2);
    expect((await collect(source.search(query, options(budget)))).map((p) => p.externalId)).toEqual([
      "a",
      "b",
    ]);
    expect(budget.spent).toBe(2);
    // Deuxième recherche : pages en cache, aucune requête de plus.
    await collect(source.search({ ...query, occupation: "" }, options(new RequestBudget(0))));
    expect(calls).toHaveLength(2);
  });

  it("ne cherche qu'en Allemagne, dans une ville connue", async () => {
    const calls: string[] = [];
    const source = new Arbeitnow(fetchPages([[item("a")]], calls));
    expect(await collect(source.search({ ...query, country: "FR", city: "Paris" }, options()))).toEqual([]);
    expect(await collect(source.search({ ...query, city: "Atlantis" }, options()))).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("source en panne : SourceError avec le statut", async () => {
    const source = new Arbeitnow(fetchPages([]));
    await expect(collect(source.search(query, options()))).rejects.toMatchObject({
      name: "SourceError",
      status: 503,
    });
  });
});

describe("flux RSS tunisiens (API simulée)", () => {
  const date = new Date(Date.now() - 86_400_000).toUTCString();
  const tanit = `<?xml version="1.0"?><rss><channel>
    <item><title>Développeur Full Stack</title><link>https://www.tanitjobs.com/job/1</link><guid>t1</guid>
      <pubDate>${date}</pubDate><description><![CDATA[Sousse, Sousse, Tunisie
 Best Time Travel<br/> <p>Nous recherchons un développeur pour une équipe et des projets web.</p>]]></description></item>
    <item><title>Développeur PHP - Canada</title><link>https://www.tanitjobs.com/job/2</link><guid>t2</guid>
      <pubDate>${date}</pubDate><description>Montréal</description></item>
    <item><title>Sans lien</title><link>javascript:alert(1)</link><pubDate>${date}</pubDate></item>
    <item><title>Date invalide</title><link>https://www.tanitjobs.com/job/3</link><pubDate>hier</pubDate></item>
  </channel></rss>`;
  const travail = `<rss><channel>
    <item><title>Armatis recrute des Chargés de clientèle</title><link>https://www.tunisietravail.net/a</link>
      <pubDate>${date}</pubDate><category>Tunis</category><description>Pour une équipe et des clients ...</description></item>
    <item><title>Concours de la fonction publique 2026</title><link>https://www.tunisietravail.net/b</link>
      <pubDate>${date}</pubDate><description>Article</description></item>
  </channel></rss>`;
  const fetchXml = (xml: string, status = 200, calls: string[] = []) =>
    (async (url: string) => {
      calls.push(url);
      return new Response(xml, { status });
    }) as unknown as typeof fetch;
  const tn: SourceQuery = { country: "TN", occupation: "", city: "Tunis", radiusKm: 200, sinceDays: 3 };

  it("lit titre, lien, date, description (CDATA) et catégories", () => {
    const items = parseRss(travail);
    expect(items[0]).toMatchObject({
      title: "Armatis recrute des Chargés de clientèle",
      categories: ["Tunis"],
    });
  });

  it("Tanitjobs : ville et employeur tirés de l'annonce ; étranger, lien ou date invalides écartés", async () => {
    const skipped = { n: 0 };
    const source = new RssSource(TUNISIAN_FEEDS[0]!, fetchXml(tanit));
    const found = await collect(source.search(tn, options(new RequestBudget(5), [], skipped)));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      externalId: "t1",
      city: "Sousse",
      company: "Best Time Travel",
      country: "TN",
      lang: "fr",
    });
    expect(skipped.n).toBe(2);
  });

  it("Tunisie Travail : seules les annonces « … recrute … », employeur au début du titre", async () => {
    const source = new RssSource(TUNISIAN_FEEDS[1]!, fetchXml(travail));
    const found = await collect(source.search(tn, options()));
    expect(found.map((p) => [p.company, p.city])).toEqual([["Armatis", "Tunis"]]);
  });

  it("filtre par métier et rayon ; flux lu une seule fois (cache)", async () => {
    const calls: string[] = [];
    const source = new RssSource(TUNISIAN_FEEDS[0]!, fetchXml(tanit, 200, calls));
    expect(await collect(source.search({ ...tn, occupation: "Comptable" }, options()))).toEqual([]);
    expect(await collect(source.search({ ...tn, radiusKm: 50 }, options()))).toEqual([]);
    expect(await collect(source.search({ ...tn, occupation: "Développeur" }, options()))).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("hors Tunisie : aucune requête ; flux en erreur : SourceError", async () => {
    const calls: string[] = [];
    const quiet = new RssSource(TUNISIAN_FEEDS[0]!, fetchXml(tanit, 200, calls));
    expect(await collect(quiet.search({ ...tn, country: "FR", city: "Paris" }, options()))).toEqual([]);
    expect(calls).toHaveLength(0);
    const broken = new RssSource(TUNISIAN_FEEDS[0]!, fetchXml("", 502));
    await expect(collect(broken.search(tn, options()))).rejects.toBeInstanceOf(SourceError);
    const offline = new RssSource(TUNISIAN_FEEDS[0]!, (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    await expect(collect(offline.search(tn, options()))).rejects.toThrow(/requête impossible \(TypeError\)/);
  });
});
