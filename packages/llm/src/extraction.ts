import { Worker } from "node:worker_threads";
import { normalize } from "./faithfulness.js";
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

/** Délai et mémoire maximaux de l'analyse d'un PDF, dans son propre thread. */
export const PDF_ANALYSIS_LIMITS = {
  timeoutMs: 10_000,
  maxOldGenerationSizeMb: 256,
  maxYoungGenerationSizeMb: 32,
};

/** Le worker est en .ts quand ce module est exécuté depuis les sources (tests), en .js une fois compilé. */
const workerUrl = new URL(
  import.meta.url.endsWith(".ts") ? "./pdf-text-worker.ts" : "./pdf-text-worker.js",
  import.meta.url,
);

/**
 * Texte d'un PDF, sans charger ses polices embarquées ni les polices système ;
 * 10 pages et 30 000 caractères au plus. L'analyse tourne dans un worker_thread
 * borné en temps et en mémoire : un fichier piégé échoue proprement sans bloquer
 * le serveur.
 */
export async function extractPdfText(
  bytes: Uint8Array,
  limits: { timeoutMs: number } = PDF_ANALYSIS_LIMITS,
): Promise<string> {
  if (bytes.byteLength > MAX_PDF_BYTES) throw new PdfImportError("Le fichier dépasse 5 Mo.");
  if (!isPdf(bytes)) throw new PdfImportError("Le fichier n'est pas un PDF valide.");

  const text = await new Promise<string>((resolve, reject) => {
    const worker = new Worker(workerUrl, {
      workerData: { bytes, maxPages: MAX_PAGES, maxChars: MAX_CHARS },
      resourceLimits: {
        maxOldGenerationSizeMb: PDF_ANALYSIS_LIMITS.maxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: PDF_ANALYSIS_LIMITS.maxYoungGenerationSizeMb,
      },
    });
    const finish = (outcome: () => void) => {
      clearTimeout(timer);
      void worker.terminate();
      outcome();
    };
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(new PdfImportError("Ce PDF est trop long à analyser. Saisissez votre profil à la main.")),
        ),
      limits.timeoutMs,
    );
    worker.once("message", (message: { ok: boolean; text?: string }) =>
      finish(() =>
        message.ok && message.text !== undefined
          ? resolve(message.text)
          : reject(new PdfImportError("Ce PDF n'a pas pu être lu.")),
      ),
    );
    // Erreur ou dépassement mémoire (ERR_WORKER_OUT_OF_MEMORY) : refus propre.
    worker.once("error", () => finish(() => reject(new PdfImportError("Ce PDF n'a pas pu être lu."))));
  });

  if (text.length < 50) {
    throw new PdfImportError(
      "Aucun texte lisible dans ce PDF (document scanné ?). Saisissez votre profil à la main.",
    );
  }
  return text;
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

/**
 * Ne garde de l'extraction que ce qui figure dans le texte du PDF : chaque
 * réalisation (80 % de ses mots, tous ses nombres), chaque compétence et chaque
 * mot-clé doivent s'y retrouver. Écarte les inventions de l'étape d'extraction.
 * Limite : un texte caché dans le PDF (blanc sur blanc) est bien « dans » le PDF ;
 * seule la relecture du candidat l'écarte.
 */
export function groundExtraction(
  profile: ExtractedProfileOutput,
  pdfText: string,
): { profile: ExtractedProfileOutput; dropped: number } {
  const corpus = normalize(pdfText);
  const vocabulary = new Set(corpus.trim().split(" "));
  const sourceNumbers = new Set(pdfText.match(/\d+(?:[.,]\d+)?/g) ?? []);
  let dropped = 0;
  const grounded = (text: string) => {
    const tokens = normalize(text)
      .trim()
      .split(" ")
      .filter((w) => w.length >= 3);
    const found = tokens.filter((w) => vocabulary.has(w)).length;
    const numbersOk = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).every((n) => sourceNumbers.has(n));
    const ok = numbersOk && (tokens.length === 0 || found / tokens.length >= 0.8);
    if (!ok) dropped++;
    return ok;
  };
  const present = (term: string) => {
    const ok = corpus.includes(normalize(term));
    if (!ok) dropped++;
    return ok;
  };
  return {
    profile: {
      ...profile,
      work: profile.work.map((w) => ({ ...w, highlights: w.highlights.filter(grounded) })),
      skills: profile.skills
        .filter((s) => present(s.name))
        .map((s) => ({ ...s, keywords: s.keywords.filter(present) })),
    },
    dropped,
  };
}
