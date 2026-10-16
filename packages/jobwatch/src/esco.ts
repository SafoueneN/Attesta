import { normalize } from "@attesta/llm";
import { z } from "zod";
import { getJson, type Fetch } from "./sources/http.js";

/**
 * Classification européenne ESCO (https://esco.ec.europa.eu, API publique) :
 * pivot entre le français, l'allemand et l'anglais pour les intitulés de métier.
 * Un intitulé saisi en français est rapproché des métiers ESCO les plus proches
 * (le premier et ses voisins), dont on reprend les libellés dans la langue de
 * chaque source.
 */
const API = "https://ec.europa.eu/esco/api/search";
const NEIGHBOURS = 3;
export const ESCO_LANGS = ["fr", "de", "en"] as const;

const SearchResponse = z.object({
  _embedded: z
    .object({
      results: z
        .array(z.object({ uri: z.string(), preferredLabel: z.record(z.string(), z.string()).default({}) }))
        .default([]),
    })
    .default({ results: [] }),
});

export interface Occupation {
  uri: string;
  labels: Partial<Record<(typeof ESCO_LANGS)[number], string>>;
}

export interface EscoCache {
  get(key: string): Promise<Occupation[] | undefined>;
  set(key: string, value: Occupation[]): Promise<void>;
}

/**
 * Mot principal d'un intitulé : le premier mot de 4 lettres ou plus (« développeur »
 * dans « développeur back-end »). Heuristique adaptée aux intitulés français et
 * allemands, où le nom de métier vient en tête.
 */
export function headWord(title: string): string | undefined {
  const word = normalize(title)
    .trim()
    .split(" ")
    .find((w) => w.length >= 4);
  return word ? ` ${word}` : undefined;
}

/** « Web-Designer/Web-Designerin » → « Web-Designer » : la forme masculine/féminine n'aide pas la recherche. */
const firstVariant = (label: string) => label.split("/")[0]!.trim();

export class EscoClient {
  constructor(
    private readonly cache: EscoCache,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  /** Métiers ESCO les plus proches d'un intitulé, du plus proche au plus éloigné. */
  async occupations(title: string, lang: "fr" | "de" | "en"): Promise<Occupation[]> {
    const key = `${lang}:${normalize(title).trim()}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const params = new URLSearchParams({
      text: title,
      type: "occupation",
      language: lang,
      limit: String(NEIGHBOURS),
      full: "false",
    });
    const body = SearchResponse.parse(await getJson(this.fetchFn, "esco", `${API}?${params}`));
    const head = headWord(title);
    const occupations = body._embedded.results
      // La recherche d'ESCO rapproche aussi sur un mot secondaire (« développeur
      // back-end » → « agent de back-office ») : on exige le mot principal.
      .filter((r) => !head || normalize(r.preferredLabel[lang] ?? "").includes(head))
      .map((r) => ({
        uri: r.uri,
        labels: Object.fromEntries(
          ESCO_LANGS.flatMap((l) => {
            const label = r.preferredLabel[l] ?? (l === "en" ? r.preferredLabel["en-us"] : undefined);
            return label ? [[l, firstVariant(label)]] : [];
          }),
        ),
      }));
    await this.cache.set(key, occupations);
    return occupations;
  }
}

/**
 * Intitulés à chercher dans la langue d'une source : ceux saisis par l'abonné,
 * puis les libellés ESCO des métiers rapprochés dans cette langue, sans doublon.
 */
export function searchTitles(own: string[], occupations: Occupation[], lang: "fr" | "de", max = 4): string[] {
  const esco = occupations.map((o) => o.labels[lang]).filter((l): l is string => Boolean(l));
  // La saisie est toujours cherchée : les sources comprennent souvent les
  // intitulés anglais ou empruntés (« Backend Developer »), quelle que soit leur langue.
  const titles = [...own, ...esco];
  const unique = new Map<string, string>();
  for (const t of titles) if (!unique.has(normalize(t))) unique.set(normalize(t), t);
  return [...unique.values()].slice(0, max);
}
