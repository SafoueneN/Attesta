import { z } from "zod";
import { type LlmUsage } from "./provider.js";
/**
 * Schéma JSON transmis aux fournisseurs qui n'acceptent pas Zod (Groq, Ollama, Gemini). Il guide le modèle
 * sans rien garantir : la sortie est toujours revalidée par `parseStructuredOutput`.
 */
export declare function jsonSchemaOf(schema: z.ZodType): Record<string, unknown>;
/**
 * Sortie texte du modèle → donnée validée par le schéma. Les erreurs ne citent jamais la sortie (elle
 * pourrait contenir des données personnelles) : relance ou mode dégradé.
 */
export declare function parseStructuredOutput<T>(schema: z.ZodType<T>, text: string | null | undefined, usage: LlmUsage): T;
