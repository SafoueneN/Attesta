import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ExtractedProfileOutput } from "./llm-schemas.js";
import { dataBlock, systemPrompt } from "./prompts.js";
import type { LlmProvider, LlmUsage } from "./provider.js";

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 10;
const MAX_CHARS = 30_000;

export class PdfImportError extends Error {
  constructor(readonly publicMessage: string) {
    super(publicMessage);
    this.name = "PdfImportError";
  }
}

/** Le fichier commence-t-il par la signature d'un PDF ? (le type MIME annoncé ne suffit pas) */
export const isPdf = (bytes: Uint8Array) => new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";

/**
 * Texte d'un PDF, sans charger ses polices embarquées ni les polices système ;
 * 10 pages et 30 000 caractères au plus.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength > MAX_PDF_BYTES) throw new PdfImportError("Le fichier dépasse 5 Mo.");
  if (!isPdf(bytes)) throw new PdfImportError("Le fichier n'est pas un PDF valide.");
  const task = getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    disableFontFace: true,
  });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(
        content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join(""),
      );
    }
    const text = pages
      .join("\n")
      .replace(/[ \t]+/g, " ")
      .trim()
      .slice(0, MAX_CHARS);
    if (text.length < 50) {
      throw new PdfImportError(
        "Aucun texte lisible dans ce PDF (document scanné ?). Saisissez votre profil à la main.",
      );
    }
    return text;
  } catch (error) {
    if (error instanceof PdfImportError) throw error;
    throw new PdfImportError("Ce PDF n'a pas pu être lu.");
  } finally {
    await task.destroy();
  }
}

/** Étape 1 du pipeline : le CV importé devient un brouillon de profil, à relire par le candidat. */
export async function extractProfile(
  provider: LlmProvider,
  cvText: string,
  signal?: AbortSignal,
): Promise<{ profile: ExtractedProfileOutput; usage: LlmUsage }> {
  const { data, usage } = await provider.generate({
    step: "extraction-cv",
    system: systemPrompt("extraction-cv"),
    messages: [{ role: "user", content: dataBlock("cv", { texte: cvText }) }],
    schema: ExtractedProfileOutput,
    effort: "low",
    maxTokens: 16000,
    input: { cvText },
    signal,
  });
  return { profile: data, usage };
}
