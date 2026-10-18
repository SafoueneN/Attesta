import { AppError } from "./errors.js";
/**
 * Valide une entrée (corps, paramètres, requête) ; en cas d'échec, erreur 400 au format commun avec la
 * liste des champs en cause. Les messages viennent des schémas, en français.
 */
export function parseInput(schema, value) {
    const result = schema.safeParse(value);
    if (result.success)
        return result.data;
    const errors = result.error.issues.map((issue) => ({
        champ: issue.path.join(".") || "(corps)",
        message: issue.message,
    }));
    throw new AppError("entree_invalide", 400, "Certaines informations sont invalides.", errors);
}
