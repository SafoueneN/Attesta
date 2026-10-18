import { z } from "zod";
const ProblemSchema = z.object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    errors: z.array(z.object({ champ: z.string(), message: z.string() })).optional(),
    requestId: z.string().optional(),
});
/** Opérations communes à tous les services (ADR 0020). */
export const healthOperations = [
    {
        method: "get",
        path: "/health",
        operationId: "health",
        summary: "Vivacité : le processus répond",
        tags: ["santé"],
        responses: { 200: { description: "Le processus répond" } },
    },
    {
        method: "get",
        path: "/ready",
        operationId: "ready",
        summary: "Disponibilité : les dépendances répondent",
        tags: ["santé"],
        responses: { 200: { description: "Prêt" }, 503: { description: "Une dépendance ne répond pas" } },
    },
];
/** Document OpenAPI 3.1 construit depuis les schémas Zod (ADR 0017), sans dépendance. */
export function buildOpenApi(info, operations) {
    const paths = {};
    for (const op of [...healthOperations, ...operations]) {
        const responses = {};
        for (const [status, response] of Object.entries(op.responses)) {
            const isError = Number(status) >= 400;
            const schema = response.schema ?? (isError ? ProblemSchema : undefined);
            const mediaType = isError ? "application/problem+json" : "application/json";
            responses[status] = {
                description: response.description,
                ...(schema && { content: { [mediaType]: { schema: z.toJSONSchema(schema) } } }),
            };
        }
        (paths[op.path] ??= {})[op.method] = {
            operationId: op.operationId,
            summary: op.summary,
            ...(op.tags && { tags: op.tags }),
            ...(op.auth && { security: [{ bearer: [] }] }),
            ...(op.body && {
                requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(op.body) } } },
            }),
            responses,
        };
    }
    return {
        openapi: "3.1.0",
        info,
        paths,
        components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
    };
}
