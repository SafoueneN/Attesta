import { findCity } from "../geo.js";
import { normalize } from "../text.js";
import type { Country } from "../types.js";

/*
 * Outils communs aux sources qui ne cherchent pas côté serveur (Arbeitnow, sites d'employeurs) : le
 * filtrage par métier, ville et langue se fait alors dans le connecteur.
 */

/**
 * Équivalents allemand, français ↔ anglais des intitulés courants : beaucoup d'offres sont rédigées en
 * anglais (« Projektmanager » ↔ « Project Manager », « développeur » ↔ « developer »). Clés sans accent.
 */
const EQUIVALENTS: Record<string, string[]> = {
  entwickler: ["developer", "engineer"],
  softwareentwickler: ["software", "developer", "engineer"],
  developpeur: ["developer", "engineer"],
  developpeuse: ["developer", "engineer"],
  developer: ["entwickler", "developpeur"],
  projektmanager: ["project manager", "projektleiter", "program manager"],
  projektleiter: ["project manager", "projektmanager"],
  projet: ["project"],
  ingenieur: ["engineer"],
  engineer: ["ingenieur"],
  berater: ["consultant"],
  consultant: ["berater"],
  buchhalter: ["accountant", "accounting"],
  comptable: ["accountant", "accounting"],
  vertrieb: ["sales"],
  commercial: ["sales"],
  analyste: ["analyst"],
  analyst: ["analyste"],
};

/**
 * Mots significatifs du métier recherché (« Backend-Entwickler » → backend, entwickler, developer,
 * engineer), avec leurs équivalents ; un équivalent de deux mots se cherche tel quel.
 */
export const words = (text: string) => {
  const base = normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  return [...new Set(base.flatMap((w) => [w, ...(EQUIVALENTS[w] ?? [])]))];
};

/**
 * Première ville du pays reconnue dans un lieu d'offre : « Munich, Bavaria », « Berlin; Munich »,
 * « Hub - Berlin », « Düsseldorf 🇩🇪 », « Toronto, Ontario, Canada », « Tunis, Tunisia ».
 */
export function placeOf(location: string, country: Country = "DE") {
  const text = normalize(location);
  // Un lieu qui nomme un autre pays (« London, United Kingdom », « EMEA ») n'est pas dans ce pays.
  const named = Object.entries(COUNTRY_WORDS).filter(([, re]) => re.test(text));
  if (named.length && !named.some(([code]) => code === country)) return undefined;
  for (const part of location.split(/[;,/|]|\s-\s/)) {
    const name = part
      .replace(/\b(office|headquarters?|headquater|hub|hybrid|remote)\b/gi, "")
      .replace(/[^\p{L}\p{N}\s.-]/gu, "")
      .trim();
    const city = name && findCity(name, country);
    // Homonyme d'une grande ville étrangère : il faut une mention du pays (« London, ON », « Canada »).
    if (city && AMBIGUOUS[country]?.has(normalize(name).trim()) && !named.length) continue;
    if (city) return city;
  }
  return undefined;
}

/** Noms de pays repérés dans un lieu (texte normalisé, sans accents) ; « OTHER » : hors des quatre pays. */
const COUNTRY_WORDS: Record<Country | "OTHER", RegExp> = {
  DE: /\b(germany|deutschland|allemagne|bayern|bavaria|berlin brandenburg)\b/,
  FR: /\b(france|ile de france)\b/,
  CA: /\b(canada|ontario|quebec|british columbia|alberta|manitoba|nova scotia|on|qc|bc|ab)\b/,
  TN: /\b(tunisia|tunisie)\b/,
  OTHER:
    /\b(united kingdom|uk|england|scotland|ireland|united states|usa|us|emea|apac|latam|spain|netherlands|poland|portugal|italy|switzerland|austria|belgium|sweden|india|singapore|japan|australia|brazil|mexico)\b/,
};

/** Villes des quatre pays homonymes d'une grande ville étrangère : acceptées seulement avec le pays. */
const AMBIGUOUS: Partial<Record<Country, Set<string>>> = {
  CA: new Set(["london", "cambridge", "hamilton", "windsor", "richmond", "kingston", "victoria", "perth"]),
  DE: new Set(["paris"]),
};

/** Langue d'une offre d'après ses mots les plus courants : allemand, français, sinon anglais. */
export const langOf = (text: string) => {
  const count = (re: RegExp) => text.match(re)?.length ?? 0;
  const de = count(/\b(und|wir|die|der|mit|für|sie)\b/gi);
  const fr = count(/\b(et|nous|vous|les|des|pour|une)\b/gi);
  if (de >= 5 && de >= fr) return "de";
  if (fr >= 5) return "fr";
  return "en";
};
