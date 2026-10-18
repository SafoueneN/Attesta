import { z } from "zod";
export interface Operation {
    method: "get" | "post" | "put" | "patch" | "delete";
    /** Chemin au format OpenAPI : `/v1/profiles/{id}`. */
    path: string;
    operationId: string;
    summary: string;
    tags?: string[];
    /** Jeton d'accès exigé (Bearer JWT, ADR 0014). */
    auth?: boolean;
    body?: z.ZodType;
    responses: Record<number, {
        description: string;
        schema?: z.ZodType;
    }>;
}
export interface OpenApiInfo {
    title: string;
    version: string;
    description: string;
}
/** Opérations communes à tous les services (ADR 0020). */
export declare const healthOperations: Operation[];
/** Document OpenAPI 3.1 construit depuis les schémas Zod (ADR 0017), sans dépendance. */
export declare function buildOpenApi(info: OpenApiInfo, operations: Operation[]): {
    openapi: string;
    info: OpenApiInfo;
    paths: Record<string, Record<string, unknown>>;
    components: {
        securitySchemes: {
            bearer: {
                type: string;
                scheme: string;
                bearerFormat: string;
            };
        };
    };
};
