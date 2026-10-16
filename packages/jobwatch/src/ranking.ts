import { distanceKm } from "./geo.js";

/** Constante de lissage de la fusion RRF (Cormack et al., 2009). */
export const RRF_K = 60;

/**
 * Fusion par rangs réciproques : score(d) = Σ 1 / (k + rang de d dans la liste).
 * Ne compare que des rangs, jamais des scores d'échelles différentes (lexical, cosinus).
 */
export function reciprocalRankFusion(lists: string[][], k = RRF_K): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1)));
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** 1 au centre de la zone, 0 à sa limite ; inconnu si l'offre n'a pas de coordonnées. */
export function locationScore(
  center: { lat: number; lon: number },
  posting: { lat: number | null; lon: number | null },
  radiusKm: number,
): number | null {
  if (posting.lat === null || posting.lon === null) return null;
  const d = distanceKm(center, { lat: posting.lat, lon: posting.lon });
  return Math.max(0, Math.min(1, 1 - d / radiusKm));
}
