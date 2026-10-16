import { z } from "zod";
import { htmlToText } from "../text.js";
import type { Country, JobSource, Posting, SearchOptions, SourceQuery } from "../types.js";
import { getJson, type Fetch } from "./http.js";

/**
 * Adzuna (DE, FR), API sous clé (https://developer.adzuna.com). Conditions :
 * 250 requêtes par jour au plus, attribution « Jobs by Adzuna » dans les rapports.
 * La description renvoyée est un extrait (quelques centaines de caractères) :
 * le matching porte donc sur moins de texte que pour BA.
 */
const PAGE_SIZE = 50;
const MAX_PAGES = 2;

const Result = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string(),
  description: z.string().default(""),
  created: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  redirect_url: z.url({ protocol: /^https?$/ }),
  company: z.object({ display_name: z.string().optional() }).optional(),
  location: z
    .object({ display_name: z.string().optional(), area: z.array(z.string()).optional() })
    .optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  salary_min: z.number().optional(),
  salary_max: z.number().optional(),
  /** « 1 » : salaire estimé par Adzuna, et non publié par l'employeur. */
  salary_is_predicted: z.union([z.string(), z.number()]).transform(String).optional(),
  contract_time: z.string().optional(),
});
type Result = z.infer<typeof Result>;

const Response = z.object({ results: z.array(z.unknown()).default([]) });

export function adzunaPosting(r: Result, country: Country): Posting {
  const published = r.salary_is_predicted !== "1";
  return {
    source: "adzuna",
    externalId: r.id,
    title: htmlToText(r.title),
    company: r.company?.display_name?.trim() || null,
    city: r.location?.area?.at(-1) ?? r.location?.display_name ?? null,
    country,
    lat: r.latitude ?? null,
    lon: r.longitude ?? null,
    lang: country === "DE" ? "de" : "fr",
    workingTime:
      r.contract_time === "full_time" ? "plein" : r.contract_time === "part_time" ? "partiel" : null,
    postedAt: r.created.slice(0, 10),
    url: r.redirect_url,
    body: htmlToText(r.description),
    salaryMinEur: published && r.salary_min !== undefined ? Math.round(r.salary_min) : null,
    salaryMaxEur: published && r.salary_max !== undefined ? Math.round(r.salary_max) : null,
  };
}

export class Adzuna implements JobSource {
  readonly id = "adzuna";
  readonly countries = ["DE", "FR"] as const;
  readonly attribution = { text: "Jobs by Adzuna", url: "https://www.adzuna.fr" };

  constructor(
    private readonly credentials: { appId: string; appKey: string },
    private readonly fetchFn: Fetch = fetch,
  ) {}

  async *search(query: SourceQuery, { isKnown, budget, onSkip }: SearchOptions): AsyncIterable<Posting> {
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (!budget.take()) return;
      const params = new URLSearchParams({
        app_id: this.credentials.appId,
        app_key: this.credentials.appKey,
        what: query.occupation,
        where: query.city,
        distance: String(query.radiusKm),
        max_days_old: String(query.sinceDays),
        results_per_page: String(PAGE_SIZE),
        "content-type": "application/json",
      });
      const url = `https://api.adzuna.com/v1/api/jobs/${query.country.toLowerCase()}/search/${page}?${params}`;
      const { results } = Response.parse(await getJson(this.fetchFn, this.id, url));
      for (const raw of results) {
        // Un résultat mal formé (lien non http(s), date absente) est écarté seul.
        const result = Result.safeParse(raw);
        if (!result.success) {
          onSkip?.();
          continue;
        }
        if (!(await isKnown(result.data.id))) yield adzunaPosting(result.data, query.country);
      }
      if (results.length < PAGE_SIZE) return;
    }
  }
}
