import { AppError } from "./errors.js";
import { problem } from "./problem.js";
export function notFoundHandler(_req, _res, next) {
    next(new AppError("introuvable", 404, "Ressource introuvable."));
}
/** Erreurs levées par express.json : corps illisible ou trop volumineux. */
function bodyParserError(err) {
    const type = err?.type;
    if (type === "entity.parse.failed")
        return new AppError("json_invalide", 400, "Le corps de la requête n'est pas un JSON valide.");
    if (type === "entity.too.large")
        return new AppError("trop_volumineux", 413, "La requête est trop volumineuse.");
    return undefined;
}
/**
 * Gestionnaire central : message public au format commun pour le client, détail technique au journal
 * seulement. Une erreur inattendue ne divulgue jamais son message (il peut contenir des données).
 */
export function errorHandler(logger) {
    return (err, _req, res, _next) => {
        const known = err instanceof AppError ? err : bodyParserError(err);
        const status = known?.status ?? 500;
        if (status >= 500)
            logger.error({ err, event: "erreur_serveur" }, "erreur serveur");
        else
            logger.warn({ code: known?.code, status, event: "requete_refusee" }, "requête refusée");
        if (res.headersSent)
            return;
        res
            .status(status)
            .type("application/problem+json")
            .json(problem(known?.code ?? "erreur_interne", status, known?.publicMessage ?? "Une erreur inattendue est survenue. Réessayez dans un instant.", known?.fieldErrors, res.locals.requestId));
    };
}
