import type { TailoredCv } from "./cv.js";
import type { Profile } from "./profile.js";
/** Résout un pointeur JSON (RFC 6901, sans échappement ~0/~1) dans le profil. */
export declare function resolvePointer(profile: Profile, pointer: string): unknown;
/**
 * Vérification croisée CV ↔ profil, indépendante du modèle : chaque source et
 * chaque référence doit désigner un élément existant du profil.
 * Retourne la liste des pointeurs introuvables (vide si tout est résolu).
 */
export declare function findUnresolvedRefs(cv: TailoredCv, profile: Profile): string[];
