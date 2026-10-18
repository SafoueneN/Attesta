import type { z } from "zod";
import { AppError, type FieldError } from "./errors.js";

/**
 * Valide une entrée (corps, paramètres, requête) ; en cas d'échec, erreur 400 au format commun avec la
 * liste des champs en cause. Les messages viennent des schémas, en français.
 */
export function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const errors: FieldError[] = result.error.issues.map((issue) => ({
    champ: issue.path.join(".") || "(corps)",
    message: issue.message,
  }));
  throw new AppError("entree_invalide", 400, "Certaines informations sont invalides.", errors);
}
