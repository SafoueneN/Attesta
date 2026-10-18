import type { z } from "zod";
/**
 * Valide une entrée (corps, paramètres, requête) ; en cas d'échec, erreur 400 au format commun avec la
 * liste des champs en cause. Les messages viennent des schémas, en français.
 */
export declare function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.infer<T>;
