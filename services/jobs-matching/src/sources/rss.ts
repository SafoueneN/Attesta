import { distanceKm, findCity } from "../geo.js";
import { plainText } from "../postings-text.js";
import { normalize } from "../text.js";
import type { JobSource, Posting, SearchOptions, SourceQuery } from "../types.js";
import { SourceError } from "./http.js";
import { langOf, words } from "./places.js";

/*
 * Flux RSS publics de sites d'emploi tunisiens (ADR 0035) : un flux est publié pour être repris ; aucune
 * page n'est lue au-delà du flux. Le flux est lu une fois par exécution (cache de 30 min), puis filtré ici
 * par métier et rayon. Lecture du XML sans dépendance : titre, lien, date, description et catégories.
 */

const CACHE_MS = 30 * 60 * 1000;
/** Offres plus anciennes écartées (alignées sur la fraîcheur du matching). */
const WINDOW_DAYS = 14;

/** Mentions d'un poste à l'étranger : ces annonces ne sont pas en Tunisie. */
const ABROAD =
  /\b(canada|quebec|france|allemagne|germany|qatar|arabie|emirats|dubai|italie|belgique|suisse|etranger|europe|libye)\b/;

interface FeedItem {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  description: string;
  categories: string[];
}

export interface RssFeed {
  id: string;
  name: string;
  url: string;
  /** Annonce d'emploi plutôt qu'article (concours, conseils) ; toutes par défaut. */
  isOffer?: (item: FeedItem) => boolean;
  /** Ville et employeur tirés de l'annonce. */
  parse: (item: FeedItem) => { city?: string; company?: string; body: string };
}

const unwrap = (raw = "") =>
  raw
    .replace(/^\s*<!\[CDATA\[/, "")
    .replace(/\]\]>\s*$/, "")
    .trim();
const tag = (xml: string, name: string) =>
  unwrap(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)?.[1]);

export function parseRss(xml: string): FeedItem[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].map(([, item = ""]) => ({
    title: plainText(tag(item, "title")),
    link: tag(item, "link"),
    guid: tag(item, "guid"),
    pubDate: tag(item, "pubDate"),
    description: tag(item, "content:encoded") || tag(item, "description"),
    categories: [...item.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/g)].map(([, c = ""]) => unwrap(c)),
  }));
}

export const TUNISIAN_FEEDS: RssFeed[] = [
  {
    id: "tanitjobs",
    name: "Tanitjobs",
    url: "https://www.tanitjobs.com/rss/",
    // « Sousse, Sousse, Tunisie\n Best Time Travel<br/> <p>… » : ville, puis employeur, puis l'annonce.
    parse: (item) => {
      const [head = "", company = ""] = item.description.split(/<br\s*\/?>/i)[0]!.split("\n");
      return {
        city: head.split(",")[0]?.trim(),
        company: company.trim(),
        body: plainText(item.description.replace(/^[^<]*<br\s*\/?>/i, "")),
      };
    },
  },
  {
    id: "tunisietravail",
    name: "Tunisie Travail",
    url: "https://www.tunisietravail.net/feed/",
    // Le site publie aussi des concours et des articles : seules les annonces « … recrute … » sont reprises.
    isOffer: (item) => /\brecrute/i.test(item.title),
    // Ville dans les catégories ; employeur au début du titre (« Armatis recrute des Chargé.es… »).
    parse: (item) => ({
      city: item.categories.find((c) => findCity(c, "TN")),
      company: item.title.split(/\s+recrute/i)[0]?.trim(),
      body: plainText(item.description).replace(/\s*\.\.\.\s*$/, ""),
    }),
  },
];

export class RssSource implements JobSource {
  readonly id: string;
  readonly countries = ["TN"] as const;
  readonly attribution: { text: string; url: string };
  private cache: { at: number; postings: Posting[] } | undefined;

  constructor(
    private readonly feed: RssFeed,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.id = feed.id;
    this.attribution = { text: `Offres via ${feed.name}`, url: new URL(feed.url).origin };
  }

  /** Annonces du flux, lues au plus une fois par exécution. */
  private async postings(options: SearchOptions): Promise<Posting[] | undefined> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.postings;
    if (!options.budget.take()) return undefined;
    let xml: string;
    try {
      const res = await this.fetchFn(this.feed.url, {
        headers: { Accept: "application/rss+xml, application/xml" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new SourceError(this.id, res.status, `réponse ${res.status}`);
      xml = await res.text();
    } catch (error) {
      if (error instanceof SourceError) throw error;
      throw new SourceError(this.id, undefined, `requête impossible (${(error as Error).name})`);
    }
    const postings: Posting[] = [];
    for (const item of parseRss(xml)) {
      const date = new Date(item.pubDate);
      if (!item.title || !/^https?:\/\//.test(item.link) || Number.isNaN(date.getTime())) {
        options.onSkip?.();
        continue;
      }
      if (this.feed.isOffer && !this.feed.isOffer(item)) continue;
      if (ABROAD.test(normalize(`${item.title} ${item.categories.join(" ")}`))) continue;
      const { city, company, body } = this.feed.parse(item);
      // Ville non reconnue : rattachée à Tunis, où se trouve l'essentiel des offres.
      const place = (city && findCity(city, "TN")) || findCity("Tunis", "TN")!;
      postings.push({
        source: this.id,
        externalId: item.guid || item.link,
        title: item.title,
        company: company || null,
        city: place.nom,
        country: "TN",
        lat: place.lat,
        lon: place.lon,
        lang: langOf(body) === "en" ? "en" : "fr",
        workingTime: null,
        postedAt: date.toISOString().slice(0, 10),
        url: item.link,
        body,
        salaryMinEur: null,
        salaryMaxEur: null,
      });
    }
    this.cache = { at: Date.now(), postings };
    return postings;
  }

  async *search(query: SourceQuery, options: SearchOptions): AsyncIterable<Posting> {
    if (query.country !== "TN") return;
    const center = findCity(query.city, "TN");
    if (!center) return;
    const wanted = words(query.occupation);
    const since = new Date(Date.now() - Math.max(query.sinceDays, WINDOW_DAYS) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    for (const p of (await this.postings(options)) ?? []) {
      if (p.postedAt < since) continue;
      if (distanceKm(center, { lat: p.lat!, lon: p.lon! }) > query.radiusKm) continue;
      // Métier vide (synchronisation du catalogue) : toutes les annonces ; sinon, les mots du métier dans le titre.
      if (wanted.length && !wanted.some((w) => normalize(p.title).includes(w))) continue;
      if (!(await options.isKnown(p.externalId))) yield p;
    }
  }
}
