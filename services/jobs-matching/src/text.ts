/**
 * Normalisation de texte commune à l'analyse d'offre et au classement, reprise du contrôle de fidélité du
 * monolithe (`packages/llm/src/faithfulness.ts`) : les termes d'une offre et d'un profil se comparent à
 * l'identique dans les deux services.
 */

/** Variantes d'écriture ramenées à une forme unique (liste courte, à enrichir sur mesure). */
const ALIASES: [RegExp, string][] = [
  [/\bnodejs\b/g, "node js"],
  [/\bpostgres\b/g, "postgresql"],
  [/\bk8s\b/g, "kubernetes"],
  [/\bjs\b(?<!node js)/g, "javascript"],
  [/\bts\b/g, "typescript"],
  // Variantes et acronymes courants (ADR 0029) : « PowerBI » = « Power BI », « GCP » = « Google Cloud ».
  [/\bpowerbi\b/g, "power bi"],
  [/\bms excel\b/g, "excel"],
  [/\bgcp\b/g, "google cloud"],
  [/\breactjs\b/g, "react"],
  [/\bvuejs\b/g, "vue"],
  [/\bnextjs\b/g, "next js"],
  [/\bgolang\b/g, "go"],
  [/\bsklearn\b/g, "scikit learn"],
  [/\bml\b/g, "machine learning"],
];

/** Minuscules, sans accents, ponctuation réduite à des espaces (sauf + et #). */
export function normalize(text: string): string {
  let s = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
  for (const [pattern, replacement] of ALIASES) s = s.replace(pattern, replacement);
  return ` ${s} `;
}

/** Retire les caractères de format invisibles, qui pourraient couper un mot pour échapper au contrôle. */
export const sanitizeText = (text: string) => text.replace(/\p{Cf}/gu, "");

/**
 * Termes techniques d'une offre, extraits sans modèle : sigles, termes à points, chiffres ou majuscules
 * internes, noms propres en milieu de phrase.
 */
export function offerTerms(offerText: string): string[] {
  const text = sanitizeText(offerText);
  const terms = [...text.matchAll(/[\p{L}][\p{L}\p{N}.+#-]*[\p{L}\p{N}+#]/gu)]
    .filter(({ 0: term, index }) => {
      if (/[.+#\d]/.test(term) || /\p{Lu}.*\p{Lu}/u.test(term)) return true;
      const before = text.slice(0, index);
      return before.trim().length > 0 && !/[.!?:;\n(«"“-]\s*$/.test(before) && /^\p{Lu}/u.test(term);
    })
    .map((m) => m[0]);
  return [...new Map(terms.map((t) => [normalize(t), t])).values()];
}
