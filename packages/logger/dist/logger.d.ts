import { type DestinationStream, type Logger } from "pino";
/**
 * Champs jamais journalisés. Règle de base : on ne passe pas de contenu de CV, de profil ou
 * d'offre au logger ; cette liste est un filet de sécurité, pas une autorisation.
 */
export declare const REDACTED_PATHS: string[];
export interface LoggerOptions {
    /** Nom du service, présent sur chaque ligne (`profiles`, `gateway`…). */
    service: string;
    level?: string;
    destination?: DestinationStream;
}
export declare function createLogger({ service, level, destination }: LoggerOptions): Logger;
export type { Logger };
