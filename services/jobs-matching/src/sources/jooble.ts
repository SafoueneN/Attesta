import { z } from "zod";
import { findCity } from "../geo.js";
import { htmlToText } from "../postings-text.js";
import type { Country, JobSource, Posting, SearchOptions, SourceQuery } from "../types.js";
import { getJson, type Fetch } from "./http.js";

/**
 * Jooble (DE, FR, CA, TN), agrégateur d'offres, API sous clé gratuite (https://jooble.org/api/about), appelée en
 * POST sur le site du pays. La description est un extrait ; aucun salaire n'est repris (texte libre,
 * jamais converti). Mention « Jobs by Jooble » dans les rapports.
 */
const PAGE_SIZE = 50;
const MAX_PAGES = 2;

const Job = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string().min(1),
  location: z.string().default(""),
  snippet: z.string().default(""),
  type: z.string().default(""),
  link: z.url({ protocol: /^https?$/ }),
  company: z.string().default(""),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
});
type Job = z.infer<typeof Job>;

const Response = z.object({ jobs: z.array(z.unknown()).default([]) });

export function jooblePosting(job: Job, country: Country): Posting {
  const city = findCity(job.location.split(/[,(]/)[0]!.trim(), country);
  const type = job.type.toLowerCase();
  return {
    source: "jooble",
    externalId: job.id,
    title: htmlToText(job.title),
    company: job.company.trim() || null,
    city: city?.nom ?? (job.location.trim() || null),
    country,
    lat: city?.lat ?? null,
    lon: city?.lon ?? null,
    lang: country === "DE" ? "de" : country === "CA" ? "en" : "fr",
    workingTime: /teilzeit|part|partiel/.test(type)
      ? "partiel"
      : /vollzeit|full|plein/.test(type)
        ? "plein"
        : null,
    postedAt: job.updated.slice(0, 10),
    url: job.link,
    body: htmlToText(job.snippet),
    salaryMinEur: null,
    salaryMaxEur: null,
  };
}

export class Jooble implements JobSource {
  readonly id = "jooble";
  readonly countries = ["DE", "FR", "CA", "TN"] as const;
  readonly attribution = { text: "Jobs by Jooble", url: "https://jooble.org" };

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  async *search(query: SourceQuery, { isKnown, budget, onSkip }: SearchOptions): AsyncIterable<Posting> {
    const since = new Date(Date.now() - query.sinceDays * 86_400_000).toISOString().slice(0, 10);
    const url = `https://${query.country.toLowerCase()}.jooble.org/api/${encodeURIComponent(this.apiKey)}`;
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (!budget.take()) return;
      const { jobs } = Response.parse(
        await getJson(this.fetchFn, this.id, url, {}, 15_000, {
          keywords: query.occupation,
          location: query.city,
          radius: String(query.radiusKm),
          page: String(page),
          ResultOnPage: String(PAGE_SIZE),
          datecreatedfrom: since,
        }),
      );
      for (const raw of jobs) {
        const job = Job.safeParse(raw);
        if (!job.success) {
          onSkip?.();
          continue;
        }
        if (!(await isKnown(job.data.id))) yield jooblePosting(job.data, query.country);
      }
      if (jobs.length < PAGE_SIZE) return;
    }
  }
}
