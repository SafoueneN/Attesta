import type { Server } from "node:http";
import type { Logger } from "@attesta/logger";
import type { Express } from "express";
export interface StartOptions {
    app: Express;
    port: number;
    logger: Logger;
    /** Libère les ressources (pool PostgreSQL, pg-boss…) après la fermeture du serveur. */
    onClose?: () => Promise<void>;
}
/** Démarre le serveur et l'arrête proprement sur SIGTERM et SIGINT (compose, Ctrl+C). */
export declare function startServer({ app, port, logger, onClose }: StartOptions): Promise<Server>;
