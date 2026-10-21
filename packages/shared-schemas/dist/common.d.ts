import { z } from "zod";
/** Date partielle ISO 8601, comme dans JSON Resume : AAAA, AAAA-MM ou AAAA-MM-JJ. */
export declare const PartialDate: z.ZodString;
/**
 * Compare deux dates partielles. Une date moins précise est complétée vers le
 * début de période (« 2020 » vaut « 2020-01-01 »).
 */
export declare function comparePartialDates(a: string, b: string): number;
/**
 * Pointeur JSON (RFC 6901) vers un fait du profil d'origine,
 * ex. "/work/0/highlights/2" ou "/basics/summary".
 */
export declare const FactPointer: z.ZodString;
/** Pointeur vers une entrée entière d'une section, ex. "/work/1". */
export declare const entryRef: (section: string) => z.ZodString;
export declare const ShortText: z.ZodString;
export declare const LongText: z.ZodString;
export declare const Highlight: z.ZodString;
export declare const Email: z.ZodEmail;
export declare const WebUrl: z.ZodURL;
