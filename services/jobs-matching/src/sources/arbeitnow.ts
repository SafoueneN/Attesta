import { z } from "zod";
import { findCity, distanceKm } from "../geo.js";
import { htmlToText, plainText } from "../postings-text.js";
import { normalize } from "../text.js";
import type { JobSource, Posting, SearchOptions, SourceQuery } from "../types.js";
import { getJson, type Fetch } from "./http.js";
import { langOf, placeOf, words } from "./places.js";

/**
 * Arbeitnow (DE), API publique gratuite et sans clé (https://www.arbeitnow.com/api/job-board-api) :
 * « free public API for jobs, please do not abuse », lien vers le site apprécié (attribution). L'API ne
 * cherche pas : elle liste les offres les plus récentes, 300 par page. Les pages sont donc lues une fois
 * par exécution (cache de 30 min), puis filtrées ici par métier, ville et rayon. Coordonnées tirées du
 * référentiel des villes (l'API n'en donne pas).
 */
const BASE = "https://www.arbeitnow.com/api/job-board-api";
const MAX_PAGES = 5;
const CACHE_MS = 30 * 60 * 1000;

const Item = z.object({
  slug: z.string().min(1).max(300),
  company_name: z.string().default(""),
  title: z.string().min(1),
  description: z.string().default(""),
  remote: z.boolean().default(false),
  url: z.url({ protocol: /^https?$/ }),
  tags: z.array(z.string()).default([]),
  job_types: z.array(z.string()).default([]),
  location: z.string().default(""),
  created_at: z.number().int(),
});
type Item = z.infer<typeof Item>;

const Page = z.object({
  data: z.array(z.unknown()).default([]),
  links: z.object({ next: z.string().nullable() }),
});

export function arbeitnowPosting(item: Item): Posting {
  const city = placeOf(item.location);
  const body = plainText(item.description);
  const types = item.job_types.join(" ").toLowerCase();
  return {
    source: "arbeitnow",
    externalId: item.slug,
    title: htmlToText(item.title),
    company: item.company_name.trim() || null,
    city: city?.nom ?? (item.location.trim() || null),
    country: "DE",
    lat: city?.lat ?? null,
    lon: city?.lon ?? null,
    lang: langOf(body),
    workingTime: /teilzeit|part.?time/.test(types)
      ? "partiel"
      : /vollzeit|full.?time/.test(types)
        ? "plein"
        : null,
    postedAt: new Date(item.created_at * 1000).toISOString().slice(0, 10),
    url: item.url,
    body,
    salaryMinEur: null,
    salaryMaxEur: null,
  };
}

export class Arbeitnow implements JobSource {
  readonly id = "arbeitnow";
  readonly countries = ["DE"] as const;
  readonly attribution = { text: "Offres via Arbeitnow", url: "https://www.arbeitnow.com" };
  private pages = new Map<number, { at: number; items: Item[]; last: boolean }>();

  constructor(private readonly fetchFn: Fetch = fetch) {}

  /** Page lue au plus une fois par exécution, quel que soit le nombre de recherches. */
  private async page(n: number, options: SearchOptions) {
    const cached = this.pages.get(n);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached;
    if (!options.budget.take()) return undefined;
    const raw = Page.parse(await getJson(this.fetchFn, this.id, `${BASE}?page=${n}`));
    const items: Item[] = [];
    for (const r of raw.data) {
      const item = Item.safeParse(r);
      if (item.success) items.push(item.data);
      else options.onSkip?.();
    }
    const page = { at: Date.now(), items, last: raw.links.next === null };
    this.pages.set(n, page);
    return page;
  }

  async *search(query: SourceQuery, options: SearchOptions): AsyncIterable<Posting> {
    if (query.country !== "DE") return;
    const center = findCity(query.city, "DE");
    const wanted = words(query.occupation);
    // Métier vide : synchronisation du catalogue, toutes les offres de la zone.
    if (!center) return;
    const since = Date.now() / 1000 - query.sinceDays * 86_400;
    for (let n = 1; n <= MAX_PAGES; n++) {
      const page = await this.page(n, options);
      if (!page) return;
      for (const item of page.items) {
        if (item.created_at < since) continue;
        const place = placeOf(item.location);
        if (!place || distanceKm(center, place) > query.radiusKm) continue;
        const text = normalize(`${item.title} ${item.tags.join(" ")}`);
        if (wanted.length && !wanted.some((w) => text.includes(w))) continue;
        if (!(await options.isKnown(item.slug))) yield arbeitnowPosting(item);
      }
      // Pages triées de la plus récente à la plus ancienne : inutile d'aller au-delà de la période.
      if (page.last || page.items.every((i) => i.created_at < since)) return;
    }
  }
}
