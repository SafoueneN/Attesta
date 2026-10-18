import { randomUUID } from "node:crypto";
import { runWithContext } from "@attesta/logger";
export const REQUEST_ID_HEADER = "x-request-id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Reprend le `X-Request-Id` reçu s'il est bien formé (UUID), sinon en crée un ; le renvoie dans la
 * réponse et l'attache à tous les journaux de la requête (ADR 0020).
 */
export function requestId(req, res, next) {
    const received = req.get(REQUEST_ID_HEADER);
    const id = received && UUID.test(received) ? received.toLowerCase() : randomUUID();
    res.locals.requestId = id;
    res.setHeader("X-Request-Id", id);
    runWithContext({ requestId: id }, next);
}
