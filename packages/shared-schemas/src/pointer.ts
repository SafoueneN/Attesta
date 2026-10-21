import type { TailoredCv } from "./cv.js";
import type { Profile } from "./profile.js";

/** Résout un pointeur JSON (RFC 6901, sans échappement ~0/~1) dans le profil. */
export function resolvePointer(profile: Profile, pointer: string): unknown {
  let node: unknown = profile;
  for (const token of pointer.split("/").slice(1)) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[token];
  }
  return node;
}

/**
 * Vérification croisée CV ↔ profil, indépendante du modèle : chaque source et
 * chaque référence doit désigner un élément existant du profil.
 * Retourne la liste des pointeurs introuvables (vide si tout est résolu).
 */
export function findUnresolvedRefs(cv: TailoredCv, profile: Profile): string[] {
  const pointers = [
    ...(cv.headline?.sources ?? []),
    ...cv.summary.flatMap((l) => l.sources),
    ...[...cv.work, ...cv.projects].flatMap((e) => [e.ref, ...e.highlights.flatMap((l) => l.sources)]),
    ...cv.education.map((e) => e.ref),
    ...cv.skills,
    ...cv.languages,
    ...cv.certificates,
  ];
  return [...new Set(pointers)].filter((p) => {
    const value = resolvePointer(profile, p);
    return value === undefined || value === "";
  });
}
