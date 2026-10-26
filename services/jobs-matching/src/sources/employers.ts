import { readFileSync } from "node:fs";
import { z } from "zod";
import { distanceKm, findCity } from "../geo.js";
import { htmlToText } from "../postings-text.js";
import { normalize } from "../text.js";
import type { JobSource, Posting, SearchOptions, SourceQuery } from "../types.js";
import { getJson, type Fetch } from "./http.js";
import { langOf, placeOf, words } from "./places.js";

/**
 * Sites carrière des employeurs (DE, FR, CA, TN), par les API publiques et sans clé de leur logiciel de recrutement :
 * Greenhouse (boards-api), Lever (postings) et SmartRecruiters (postings). Ces API sont faites pour être
 * lues par des tiers ; ce n'est pas du scraping (ADR 0031). Liste des employeurs : data/employeurs.json.
 *
 * Greenhouse et Lever renvoient tout le tableau d'offres : il est lu une fois par exécution (cache de
 * 30 min) puis filtré ici par métier, ville et rayon. SmartRecruiters cherche côté serveur (métier, pays).
 * Une offre d'employeur reste ouverte des semaines : la période retenue est celle de la fraîcheur du
 * matching (14 jours), et non les 3 jours des agrégateurs.
 */
const CACHE_MS = 30 * 60 * 1000;
const WINDOW_DAYS = 14;

export interface Employer {
  ats: "greenhouse" | "lever" | "smartrecruiters";
  id: string;
  name: string;
}

export const EMPLOYERS: Employer[] = JSON.parse(
  readFileSync(new URL("../../data/employeurs.json", import.meta.url), "utf8"),
);

const GreenhouseJob = z.object({
  id: z.number(),
  title: z.string().min(1),
  absolute_url: z.url({ protocol: /^https?$/ }),
  location: z.object({ name: z.string().default("") }).default({ name: "" }),
  first_published: z.string().nullish(),
  updated_at: z.string(),
  language: z.string().nullish(),
  content: z.string().default(""),
  departments: z.array(z.object({ name: z.string() })).default([]),
});

const LeverJob = z.object({
  id: z.string(),
  text: z.string().min(1),
  hostedUrl: z.url({ protocol: /^https?$/ }),
  createdAt: z.number(),
  country: z.string().nullish(),
  descriptionPlain: z.string().default(""),
  categories: z
    .object({
      location: z.string().default(""),
      allLocations: z.array(z.string()).default([]),
      commitment: z.string().default(""),
      team: z.string().default(""),
      department: z.string().default(""),
    })
    .partial()
    .default({}),
});

const SrJob = z.object({
  id: z.string(),
  name: z.string().min(1),
  releasedDate: z.string(),
  location: z
    .object({
      city: z.string().default(""),
      country: z.string().default(""),
      latitude: z.coerce.number().optional(),
      longitude: z.coerce.number().optional(),
    })
    .default({ city: "", country: "" }),
  company: z.object({ name: z.string().default("") }).default({ name: "" }),
  function: z.object({ label: z.string() }).nullish(),
  department: z.object({ label: z.string().optional() }).nullish(),
  typeOfEmployment: z.object({ label: z.string() }).nullish(),
  experienceLevel: z.object({ label: z.string() }).nullish(),
});

/** Contenu Greenhouse : HTML échappé (« &lt;p&gt; »), décodé une fois avant la conversion en texte. */
const unescape = (s: string) =>
  s.replace(
    /&(lt|gt|quot|#39|amp);/g,
    (_, e: string) => ({ lt: "<", gt: ">", quot: '"', "#39": "'", amp: "&" })[e]!,
  );

const timeOf = (t: string) => {
  const lower = t.toLowerCase();
  return /teilzeit|part.?time/.test(lower)
    ? "partiel"
    : /vollzeit|full.?time|permanent/.test(lower)
      ? "plein"
      : null;
};

/** Lit tout un itérable asynchrone (les erreurs de la source surviennent ainsi avant le tri). */
async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

/** Offre lue sur un site carrière, avant de savoir dans quel pays elle est cherchée. */
interface Candidate {
  /** Intitulé et service, où chercher les mots du métier (la description, trop générale, est exclue). */
  haystack: string;
  /** Lieux publiés (« Toronto, Ontario, Canada »), résolus dans le pays de la recherche. */
  locations: string[];
  /** Coordonnées publiées par la source (SmartRecruiters), déjà filtrée par pays côté serveur. */
  coords?: { city: string; lat: number; lon: number };
  posting: Omit<Posting, "city" | "country" | "lat" | "lon">;
}

export class EmployerBoards implements JobSource {
  readonly id = "employeurs";
  readonly countries = ["DE", "FR", "CA", "TN"] as const;
  private boards = new Map<string, { at: number; items: Candidate[] }>();

  constructor(
    private readonly employers: Employer[] = EMPLOYERS,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  /** Tableau complet d'un employeur (Greenhouse, Lever), lu au plus une fois par exécution. */
  private async board(e: Employer, options: SearchOptions): Promise<Candidate[] | undefined> {
    const key = `${e.ats}:${e.id}`;
    const cached = this.boards.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.items;
    if (!options.budget.take()) return undefined;
    const items: Candidate[] = [];
    if (e.ats === "greenhouse") {
      const raw = z
        .object({ jobs: z.array(z.unknown()).default([]) })
        .parse(
          await getJson(
            this.fetchFn,
            this.id,
            `https://boards-api.greenhouse.io/v1/boards/${e.id}/jobs?content=true`,
            {},
            30_000,
          ),
        );
      for (const r of raw.jobs) {
        const j = GreenhouseJob.safeParse(r);
        if (!j.success) {
          options.onSkip?.();
          continue;
        }
        const body = htmlToText(unescape(j.data.content));
        const department = j.data.departments.map((d) => d.name).join(" ");
        const language = j.data.language;
        items.push({
          haystack: `${j.data.title} ${department}`,
          locations: [j.data.location.name],
          posting: {
            source: this.id,
            externalId: `greenhouse:${e.id}:${j.data.id}`,
            title: htmlToText(j.data.title),
            company: e.name,
            lang: language === "de" || language === "fr" || language === "en" ? language : langOf(body),
            workingTime: null,
            postedAt: (j.data.first_published ?? j.data.updated_at).slice(0, 10),
            url: j.data.absolute_url,
            body,
            salaryMinEur: null,
            salaryMaxEur: null,
          },
        });
      }
    } else if (e.ats === "lever") {
      const raw = z
        .array(z.unknown())
        .parse(
          await getJson(
            this.fetchFn,
            this.id,
            `https://api.lever.co/v0/postings/${e.id}?mode=json`,
            {},
            30_000,
          ),
        );
      for (const r of raw) {
        const j = LeverJob.safeParse(r);
        if (!j.success) {
          options.onSkip?.();
          continue;
        }
        const c = j.data.categories;
        const body = j.data.descriptionPlain.trim();
        items.push({
          haystack: `${j.data.text} ${c.team ?? ""} ${c.department ?? ""}`,
          locations: [c.location ?? "", ...(c.allLocations ?? [])],
          posting: {
            source: this.id,
            externalId: `lever:${e.id}:${j.data.id}`,
            title: j.data.text.trim(),
            company: e.name,
            lang: langOf(body),
            workingTime: timeOf(c.commitment ?? ""),
            postedAt: new Date(j.data.createdAt).toISOString().slice(0, 10),
            url: j.data.hostedUrl,
            body,
            salaryMinEur: null,
            salaryMaxEur: null,
          },
        });
      }
    }
    this.boards.set(key, { at: Date.now(), items });
    return items;
  }

  /** SmartRecruiters : recherche côté serveur par métier et pays, puis filtre du rayon ici. */
  private async *smartRecruiters(e: Employer, query: SourceQuery, options: SearchOptions) {
    if (!options.budget.take()) return;
    const params = new URLSearchParams({
      q: query.occupation,
      country: query.country.toLowerCase(),
      limit: "100",
    });
    const raw = z
      .object({ content: z.array(z.unknown()).default([]) })
      .parse(
        await getJson(
          this.fetchFn,
          this.id,
          `https://api.smartrecruiters.com/v1/companies/${e.id}/postings?${params}`,
        ),
      );
    for (const r of raw.content) {
      const j = SrJob.safeParse(r);
      if (!j.success) {
        options.onSkip?.();
        continue;
      }
      const loc = j.data.location;
      const facts = [
        j.data.function?.label,
        j.data.department?.label,
        j.data.experienceLevel?.label,
        j.data.typeOfEmployment?.label,
      ]
        .filter(Boolean)
        .join(" · ");
      yield {
        haystack: j.data.name,
        locations: [loc.city],
        coords:
          loc.latitude !== undefined && loc.longitude !== undefined
            ? { city: loc.city, lat: loc.latitude, lon: loc.longitude }
            : undefined,
        posting: {
          source: this.id,
          externalId: `smartrecruiters:${e.id}:${j.data.id}`,
          title: j.data.name.trim(),
          company: j.data.company.name || e.name,
          lang: langOf(j.data.name),
          workingTime: timeOf(j.data.typeOfEmployment?.label ?? ""),
          postedAt: j.data.releasedDate.slice(0, 10),
          url: `https://jobs.smartrecruiters.com/${encodeURIComponent(e.id)}/${encodeURIComponent(j.data.id)}`,
          body: `${j.data.name}\n${facts}`,
          salaryMinEur: null,
          salaryMaxEur: null,
        },
      } satisfies Candidate;
    }
  }

  async *search(query: SourceQuery, options: SearchOptions): AsyncIterable<Posting> {
    const center = findCity(query.city, query.country);
    const wanted = words(query.occupation);
    // Métier vide : synchronisation du catalogue, toutes les offres de la zone.
    if (!center) return;
    const since = new Date(Date.now() - Math.max(query.sinceDays, WINDOW_DAYS) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    for (const e of this.employers) {
      let candidates: Candidate[] | undefined;
      try {
        candidates =
          e.ats === "smartrecruiters"
            ? await collect(this.smartRecruiters(e, query, options))
            : await this.board(e, options);
      } catch {
        // Un site carrière injoignable ou mal formé n'arrête pas les autres : il compte comme une erreur.
        options.onSkip?.();
        continue;
      }
      if (!candidates) return;
      for (const c of candidates) {
        if (c.posting.postedAt < since) continue;
        const text = normalize(c.haystack);
        if (wanted.length && !wanted.some((w) => text.includes(w))) continue;
        const city = c.locations.map((l) => placeOf(l, query.country)).find(Boolean);
        const place = c.coords
          ? { nom: city?.nom ?? c.coords.city, lat: c.coords.lat, lon: c.coords.lon }
          : city;
        if (!place || distanceKm(center, place) > query.radiusKm) continue;
        if (await options.isKnown(c.posting.externalId)) continue;
        yield {
          ...c.posting,
          city: place.nom || null,
          country: query.country,
          lat: place.lat,
          lon: place.lon,
        };
      }
    }
  }
}
