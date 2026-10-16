import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

/** Bornes de l'analyse d'un PDF, faite dans un processus enfant. */
export const PDF_ANALYSIS_LIMITS = {
  timeoutMs: 10_000,
  /** Mémoire de données du processus (RLIMIT_DATA, noyau) : contient une « bombe » de décompression. */
  maxDataBytes: 768 * 1024 * 1024,
  cpuSeconds: 15,
  /** Analyses simultanées par instance, et analyses en attente au-delà. */
  concurrency: 1,
  queue: 3,
};

/** Script enfant : .ts depuis les sources (tests), .js une fois compilé. */
const childScript = fileURLToPath(
  new URL(import.meta.url.endsWith(".ts") ? "./pdf-text-child.ts" : "./pdf-text-child.js", import.meta.url),
);

/**
 * prlimit (util-linux) applique les plafonds du noyau. Présent dans l'image de
 * production (Debian) ; absent sur un poste Windows ou macOS, où l'analyse tourne
 * sans plafond mémoire (développement seulement).
 */
const PRLIMIT = ["/usr/bin/prlimit", "/bin/prlimit"].find((p) => existsSync(p));

let running = 0;
const waiting: (() => void)[] = [];

async function acquireSlot(): Promise<() => void> {
  if (running >= PDF_ANALYSIS_LIMITS.concurrency) {
    if (waiting.length >= PDF_ANALYSIS_LIMITS.queue) {
      throw new PdfImportError("Trop d'imports sont en cours. Réessayez dans un instant.");
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running++;
  return () => {
    running--;
    waiting.shift()?.();
  };
}

function runChild(bytes: Uint8Array, timeoutMs: number): Promise<string> {
  const nodeArgs = [childScript, String(MAX_PAGES), String(MAX_CHARS)];
  const [command, args] = PRLIMIT
    ? [
        PRLIMIT,
        [
          `--data=${PDF_ANALYSIS_LIMITS.maxDataBytes}`,
          `--cpu=${PDF_ANALYSIS_LIMITS.cpuSeconds}`,
          process.execPath,
          ...nodeArgs,
        ],
      ]
    : [process.execPath, nodeArgs];
  return new Promise((resolve, reject) => {
    // Environnement vide : aucun secret (SESSION_SECRET, DATABASE_URL…) n'est transmis.
    const child = spawn(command, args, { env: {}, stdio: ["pipe", "pipe", "ignore"] });
    let output = "";
    let settled = false;
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      outcome();
    };
    const timer = setTimeout(
      () =>
        settle(() =>
          reject(new PdfImportError("Ce PDF est trop long à analyser. Saisissez votre profil à la main.")),
        ),
      timeoutMs,
    );
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > MAX_CHARS * 8)
        settle(() => reject(new PdfImportError("Ce PDF n'a pas pu être lu.")));
    });
    // Mémoire épuisée, limite CPU, plantage : le processus enfant meurt seul.
    child.on("close", () =>
      settle(() => {
        try {
          const message = JSON.parse(output) as { ok: boolean; text?: string };
          if (message.ok && typeof message.text === "string") return resolve(message.text);
        } catch {
          // sortie absente ou tronquée
        }
        reject(new PdfImportError("Ce PDF n'a pas pu être lu."));
      }),
    );
    child.on("error", () => settle(() => reject(new PdfImportError("Ce PDF n'a pas pu être lu."))));
    child.stdin.on("error", () => undefined);
    child.stdin.end(Buffer.from(bytes));
  });
}

/**
 * Texte d'un PDF, sans charger ses polices embarquées ni les polices système ;
 * 10 pages et 30 000 caractères au plus. L'analyse tourne dans un processus
 * enfant borné en mémoire (noyau), en CPU et en temps : un fichier piégé échoue
 * proprement sans mettre l'instance en danger.
 */
export async function extractPdfText(
  bytes: Uint8Array,
  limits: { timeoutMs: number } = PDF_ANALYSIS_LIMITS,
): Promise<string> {
  if (bytes.byteLength > MAX_PDF_BYTES) throw new PdfImportError("Le fichier dépasse 5 Mo.");
  if (!isPdf(bytes)) throw new PdfImportError("Le fichier n'est pas un PDF valide.");

  const release = await acquireSlot();
  let text: string;
  try {
    text = await runChild(bytes, limits.timeoutMs);
  } finally {
    release();
  }
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
