import { z } from "zod";
import { LlmSchemaError } from "./provider.js";
/**
 * Schéma JSON transmis aux fournisseurs qui n'acceptent pas Zod (Groq, Ollama, Gemini). Il guide le modèle
 * sans rien garantir : la sortie est toujours revalidée par `parseStructuredOutput`.
 */
export function jsonSchemaOf(schema) {
    return z.toJSONSchema(schema);
}
/**
 * Sortie texte du modèle → donnée validée par le schéma. Les erreurs ne citent jamais la sortie (elle
 * pourrait contenir des données personnelles) : relance ou mode dégradé.
 */
export function parseStructuredOutput(schema, text, usage) {
    if (!text)
        throw new LlmSchemaError("Sortie vide", usage);
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        throw new LlmSchemaError("Sortie du modèle non analysable", usage);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success)
        throw new LlmSchemaError("Sortie non conforme au schéma", usage);
    return parsed.data;
}
