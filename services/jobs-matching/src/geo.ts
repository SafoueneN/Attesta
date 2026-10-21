import { readFileSync } from "node:fs";
import { normalize } from "./text.js";
import type { Country } from "./types.js";

/**
 * Villes de plus de 15 000 habitants (DE, FR), d'après GeoNames (CC BY 4.0,
 * https://www.geonames.org). Fichier généré par scripts/build-villes.mjs.
 */
export interface City {
  nom: string;
  pays: Country;
  lat: number;
  lon: number;
  population: number;
  alias: string[];
}

const cities: City[] = JSON.parse(readFileSync(new URL("../data/villes.json", import.meta.url), "utf8"));

const byName = new Map<string, City>();
// Fichier trié par population décroissante : en cas d'homonymie, la plus peuplée l'emporte.
for (const city of cities) {
  for (const name of [city.nom, ...city.alias]) {
    const key = `${city.pays}:${normalize(name).trim()}`;
    if (!byName.has(key)) byName.set(key, city);
  }
}

/** Ville connue du référentiel, dans le pays demandé (nom local ou exonyme : « Munich »). */
export function findCity(name: string, country: Country): City | undefined {
  return byName.get(`${country}:${normalize(name).trim()}`);
}

/** Distance orthodromique en kilomètres (formule de haversine). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Villes dont le nom (ou un exonyme) commence par la saisie, les plus peuplées d'abord : autocomplétion. */
export function suggestCities(query: string, country: Country, limit = 8): City[] {
  const prefix = normalize(query).trim();
  if (prefix.length < 2) return [];
  return cities
    .filter(
      (c) => c.pays === country && [c.nom, ...c.alias].some((n) => normalize(n).trim().startsWith(prefix)),
    )
    .slice(0, limit);
}
