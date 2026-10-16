import { z } from "zod";
import { htmlToText } from "../text.js";
import type { JobSource, Posting, SearchOptions, SourceQuery } from "../types.js";
import { getJson, SourceError, type Fetch } from "./http.js";

/**
 * Bundesagentur für Arbeit, « Jobsuche » (pilote DE). API publique mais **non
 * officielle** (documentée par https://github.com/bundesAPI/jobsuche-api) : son
 * format peut changer sans préavis. Chaque réponse est validée par Zod ; un
 * changement de format fait échouer l'ingestion de façon visible (journal et
 * alerte), jamais en silence.
 */
const BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
const CLIENT_ID = "jobboerse-jobsuche";
const PAGE_SIZE = 50;
const MAX_PAGES = 4;

const Location = z.object({
  adresse: z.object({ ort: z.string().optional() }).partial().optional(),
  breite: z.number().optional(),
  laenge: z.number().optional(),
});

const SearchResponse = z.object({
  ergebnisliste: z.array(z.object({ referenznummer: z.string() })).default([]),
  maxErgebnisse: z.number().optional(),
});

const Detail = z.object({
  referenznummer: z.string(),
  stellenangebotsTitel: z.string(),
  stellenangebotsBeschreibung: z.string().default(""),
  firma: z.string().optional(),
  stellenlokationen: z.array(Location).default([]),
  datumErsteVeroeffentlichung: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  /** Publication en cours : une offre ancienne peut être republiée, et rester ouverte. */
  veroeffentlichungszeitraum: z
    .object({
      von: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}/)
        .optional(),
    })
    .optional(),
  arbeitszeitVollzeit: z.boolean().optional(),
  arbeitszeitTeilzeitFlexibel: z.boolean().optional(),
  arbeitszeitTeilzeitVormittag: z.boolean().optional(),
  arbeitszeitTeilzeitNachmittag: z.boolean().optional(),
  arbeitszeitTeilzeitAbend: z.boolean().optional(),
  verguetungsangabe: z.string().optional(),
  festgehalt: z.number().optional(),
});
type Detail = z.infer<typeof Detail>;

/** Salaire annuel publié tel quel. Taux horaire : non converti (le nombre d'heures est inconnu). */
function annualSalary(d: Detail): number | null {
  if (d.festgehalt === undefined || !d.verguetungsangabe) return null;
  if (/JAHR/i.test(d.verguetungsangabe)) return Math.round(d.festgehalt);
  if (/MONAT/i.test(d.verguetungsangabe)) return Math.round(d.festgehalt * 12);
  return null;
}

export function baPosting(d: Detail): Posting {
  const place = d.stellenlokationen[0];
  const partTime =
    d.arbeitszeitTeilzeitFlexibel ||
    d.arbeitszeitTeilzeitVormittag ||
    d.arbeitszeitTeilzeitNachmittag ||
    d.arbeitszeitTeilzeitAbend;
  const salary = annualSalary(d);
  return {
    source: "ba",
    externalId: d.referenznummer,
    title: htmlToText(d.stellenangebotsTitel),
    company: d.firma?.trim() || null,
    city: place?.adresse?.ort ?? null,
    country: "DE",
    lat: place?.breite ?? null,
    lon: place?.laenge ?? null,
    lang: "de",
    // Offre ouverte aux deux (fréquent) : non classée, elle passe les deux filtres.
    workingTime:
      d.arbeitszeitVollzeit && !partTime ? "plein" : partTime && !d.arbeitszeitVollzeit ? "partiel" : null,
    postedAt: (d.veroeffentlichungszeitraum?.von ?? d.datumErsteVeroeffentlichung).slice(0, 10),
    url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(d.referenznummer)}`,
    body: htmlToText(d.stellenangebotsBeschreibung),
    salaryMinEur: salary,
    salaryMaxEur: salary,
  };
}

export class BaJobsuche implements JobSource {
  readonly id = "ba";
  readonly countries = ["DE"] as const;

  constructor(private readonly fetchFn: Fetch = fetch) {}

  private get(path: string) {
    return getJson(this.fetchFn, this.id, `${BASE}${path}`, { "X-API-Key": CLIENT_ID });
  }

  async *search(query: SourceQuery, { isKnown, budget, onSkip }: SearchOptions): AsyncIterable<Posting> {
    if (query.country !== "DE") return;
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (!budget.take()) return;
      const params = new URLSearchParams({
        was: query.occupation,
        wo: query.city,
        umkreis: String(query.radiusKm),
        veroeffentlichtseit: String(query.sinceDays),
        angebotsart: "1",
        size: String(PAGE_SIZE),
        page: String(page),
      });
      const { ergebnisliste } = SearchResponse.parse(await this.get(`/pc/v6/jobs?${params}`));
      for (const { referenznummer } of ergebnisliste) {
        if (await isKnown(referenznummer)) continue;
        if (!budget.take()) return;
        const id = Buffer.from(referenznummer).toString("base64");
        let detail;
        try {
          detail = Detail.parse(await this.get(`/pc/v4/jobdetails/${id}`));
        } catch (error) {
          // Offre retirée (404, 410) ou détail mal formé : seule cette offre est perdue.
          // Une panne de la source (5xx, réseau) interrompt la recherche, qui sera relancée.
          const gone = error instanceof SourceError && (error.status === 404 || error.status === 410);
          if (!gone && !(error instanceof z.ZodError)) throw error;
          onSkip?.();
          continue;
        }
        yield baPosting(detail);
      }
      if (ergebnisliste.length < PAGE_SIZE) return;
    }
  }
}
