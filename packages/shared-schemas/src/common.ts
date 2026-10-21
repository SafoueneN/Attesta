import { z } from "zod";

/** Date partielle ISO 8601, comme dans JSON Resume : AAAA, AAAA-MM ou AAAA-MM-JJ. */
export const PartialDate = z
  .string()
  .regex(
    /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/,
    "Date attendue au format AAAA, AAAA-MM ou AAAA-MM-JJ",
  );

/**
 * Compare deux dates partielles. Une date moins précise est complétée vers le
 * début de période (« 2020 » vaut « 2020-01-01 »).
 */
export function comparePartialDates(a: string, b: string): number {
  const pad = (d: string) => (d + "-01-01").slice(0, 10);
  return pad(a).localeCompare(pad(b));
}

/**
 * Pointeur JSON (RFC 6901) vers un fait du profil d'origine,
 * ex. "/work/0/highlights/2" ou "/basics/summary".
 */
export const FactPointer = z.string().regex(/^(\/[a-zA-Z]+(\/\d+)?)+$/, "Pointeur de fait invalide");

/** Pointeur vers une entrée entière d'une section, ex. "/work/1". */
export const entryRef = (section: string) =>
  z.string().regex(new RegExp(`^/${section}/\\d+$`), `Référence attendue : /${section}/<index>`);

const REQUIRED = "Ce champ est obligatoire";
const maxLength = (n: number) => `${n} caractères maximum`;

export const ShortText = z.string().trim().min(1, REQUIRED).max(200, maxLength(200));
export const LongText = z.string().trim().min(1, REQUIRED).max(2000, maxLength(2000));
export const Highlight = z.string().trim().min(1, REQUIRED).max(500, maxLength(500));
export const Email = z.email("Adresse e-mail invalide");
export const WebUrl = z.url({
  protocol: /^https?$/,
  error: "Adresse web invalide (exemple : https://exemple.fr)",
});
