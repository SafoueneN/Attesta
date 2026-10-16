import { createHash } from "node:crypto";
import { normalize, offerTerms, sanitizeText } from "@attesta/llm";
import type { Posting } from "./types.js";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Texte brut d'un fragment HTML de source : balises retirées, entités décodées, espaces réduits. */
export function htmlToText(html: string): string {
  return sanitizeText(
    html
      .replace(/<(br|\/p|\/li|\/div|\/h\d)\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
        if (code.startsWith("#")) {
          const point = code.startsWith("#x") ? parseInt(code.slice(2), 16) : Number(code.slice(1));
          // Point de code invalide dans une offre : caractère de remplacement, jamais d'exception.
          return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "\ufffd";
        }
        return ENTITIES[code.toLowerCase()] ?? entity;
      })
      .replace(/[ \t\f\v\u00a0]+/g, " ")
      .replace(/ *\n[\s]*/g, "\n")
      .trim(),
  );
}

/** Mentions d'intitulé sans valeur de recherche : (m/w/d), (H/F), « /in ». */
const TITLE_NOISE = /\((?:[mwdfhx]\s*\/\s*)+[mwdfhx]\)|\b(?:[mwdfhx]\/)+[mwdfhx]\b|\/(?:in|innen|e)\b/gi;

/**
 * Empreinte de déduplication entre sources : intitulé, employeur et ville
 * normalisés, date de publication. Deux sources qui relaient la même offre le
 * même jour produisent la même empreinte.
 */
export function postingFingerprint(p: Pick<Posting, "title" | "company" | "city" | "postedAt">): Buffer {
  const key = [p.title.replace(TITLE_NOISE, " "), p.company ?? "", p.city ?? "", p.postedAt]
    .map((part) => normalize(part).trim())
    .join("|");
  return createHash("sha256").update(key).digest();
}

/** Formes juridiques et sigles sans valeur de compétence. */
const NOT_SKILLS = new Set(
  [
    "gmbh",
    "ag",
    "kg",
    "se",
    "ug",
    "co",
    "mbh",
    "sarl",
    "sas",
    "sa",
    "cdi",
    "cdd",
    "h f",
    "m w d",
    "it",
    "z b",
    "u a",
    "d h",
    "bzw",
    "inkl",
    "ca",
  ].map((t) => normalize(t)),
);

/**
 * Termes techniques d'une offre (sigles, termes à points ou à chiffres, majuscules
 * internes). En allemand, où tous les noms prennent une majuscule, seuls ces
 * signes forts comptent ; en français, on reprend l'extraction du contrôle de
 * fidélité, qui retient aussi les noms propres en milieu de phrase.
 */
export function technicalTerms(text: string, lang: string): string[] {
  const clean = sanitizeText(text);
  const candidates =
    lang === "de"
      ? [...clean.matchAll(/[\p{L}][\p{L}\p{N}.+#-]*[\p{L}\p{N}+#]/gu)]
          .map((m) => m[0])
          .filter(
            (t) => /^\p{Lu}{2,}[\p{Lu}\d]*$/u.test(t) || /\p{Ll}\p{Lu}/u.test(t) || /[.+#]|\p{L}\d/u.test(t),
          )
      : offerTerms(clean);
  const seen = new Map<string, string>();
  for (const term of candidates) {
    const key = normalize(term);
    if (!NOT_SKILLS.has(key) && key.trim().length > 1 && !seen.has(key)) seen.set(key, term);
  }
  return [...seen.values()];
}

/** Vrai si le terme apparaît dans le texte, à la normalisation près. */
export function mentions(text: string, term: string): boolean {
  const needle = normalize(term);
  return needle.trim().length > 0 && normalize(text).includes(needle);
}
