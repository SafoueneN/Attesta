/**
 * Chargeur des prompts versionnés d'un service (ADR 0016, point 8) : `<dossier>/<étape>/<version>.md`.
 * Une nouvelle version est un nouveau fichier ; l'ancienne reste rejouable.
 */
export declare function createPromptLoader(dir: URL, versions: Record<string, string>): {
    versions: Record<string, string>;
    /** Prompt système en vigueur pour l'étape. */
    system(step: string): string;
    /** `etape@v1+autre@v2`, enregistré avec chaque contenu produit. */
    signature(...steps: string[]): string;
};
/**
 * Bloc de données balisé (ADR 0016, point 5). Le contenu est sérialisé en JSON et chaque « < » est échappé :
 * un texte d'offre ou de CV ne peut pas fermer la balise pour se faire passer pour une consigne.
 */
export declare function dataBlock(tag: string, value: unknown): string;
