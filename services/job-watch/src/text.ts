/** Minuscules, sans accents, ponctuation réduite à des espaces (sauf + et #) : comparaison des compétences. */
export function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()} `;
}
