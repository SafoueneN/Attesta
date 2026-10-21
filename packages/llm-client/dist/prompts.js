import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
/**
 * Chargeur des prompts versionnés d'un service (ADR 0016, point 8) : `<dossier>/<étape>/<version>.md`.
 * Une nouvelle version est un nouveau fichier ; l'ancienne reste rejouable.
 */
export function createPromptLoader(dir, versions) {
    const cache = new Map();
    return {
        versions,
        /** Prompt système en vigueur pour l'étape. */
        system(step) {
            const version = versions[step];
            if (!version)
                throw new Error(`Aucune version de prompt déclarée pour ${step}`);
            let text = cache.get(step);
            if (!text) {
                text = readFileSync(fileURLToPath(new URL(`${step}/${version}.md`, dir)), "utf8");
                cache.set(step, text);
            }
            return text;
        },
        /** `etape@v1+autre@v2`, enregistré avec chaque contenu produit. */
        signature(...steps) {
            return steps.map((s) => `${s}@${versions[s]}`).join("+");
        },
    };
}
/**
 * Bloc de données balisé (ADR 0016, point 5). Le contenu est sérialisé en JSON et chaque « < » est échappé :
 * un texte d'offre ou de CV ne peut pas fermer la balise pour se faire passer pour une consigne.
 */
export function dataBlock(tag, value) {
    const json = JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
    return `<${tag}>\n${json}\n</${tag}>`;
}
