import { createHash } from "node:crypto";
import { normalize } from "@attesta/llm";

/** Dimension de BGE-M3, imposée par la colonne vector(1024). */
export const EMBEDDING_DIMENSIONS = 1024;
/** Texte d'une offre ou d'un profil vectorisé au plus (au-delà, le CPU paie sans gain net). */
export const EMBEDDING_MAX_CHARS = 2000;

export interface EmbeddingProvider {
  readonly model: string;
  /**
   * Similarité cosinus en dessous de laquelle une offre trouvée par les seuls
   * vecteurs n'est pas retenue : sans ce seuil, toute offre du périmètre entre
   * dans la fusion quand il y en a peu. Valeur propre à chaque modèle.
   */
  readonly minSimilarity: number;
  /** Vecteurs normalisés (norme 1), dans l'ordre des textes. */
  embed(texts: string[]): Promise<number[][]>;
}

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * BGE-M3 servi par Hugging Face Text Embeddings Inference (décision Q15),
 * autohébergé dans l'UE : les textes ne quittent pas l'infrastructure.
 */
export class TeiEmbeddings implements EmbeddingProvider {
  readonly model = "BAAI/bge-m3";
  /** Valeur provisoire, à calibrer sur le jeu annoté (décision Q17). */
  readonly minSimilarity = 0.45;

  constructor(
    private readonly baseUrl: string,
    private readonly options: {
      batchSize?: number;
      timeoutMs?: number;
      /**
       * Service Cloud Run privé : jeton d'identité Google demandé au serveur de
       * métadonnées, pour l'audience de TEI. Aucune clé à gérer.
       */
      googleIdToken?: boolean;
    } = {},
  ) {}

  private async authorization(): Promise<Record<string, string>> {
    if (!this.options.googleIdToken) return {};
    const audience = new URL(this.baseUrl).origin;
    const response = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5000) },
    ).catch(() => undefined);
    if (!response?.ok) throw new EmbeddingError("jeton d'identité Google indisponible");
    return { Authorization: `Bearer ${await response.text()}` };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const size = this.options.batchSize ?? 16;
    const vectors: number[][] = [];
    const auth = await this.authorization();
    for (let i = 0; i < texts.length; i += size) {
      const inputs = texts.slice(i, i + size).map((t) => t.slice(0, EMBEDDING_MAX_CHARS));
      let response: Response;
      try {
        response = await fetch(new URL("/embed", this.baseUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify({ inputs, truncate: true, normalize: true }),
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 120_000),
        });
      } catch (error) {
        throw new EmbeddingError(`TEI injoignable (${(error as Error).name})`);
      }
      if (!response.ok) throw new EmbeddingError(`TEI : réponse ${response.status}`);
      const batch = (await response.json()) as number[][];
      if (
        !Array.isArray(batch) ||
        batch.length !== inputs.length ||
        batch[0]?.length !== EMBEDDING_DIMENSIONS
      )
        throw new EmbeddingError("TEI : réponse inattendue (nombre ou dimension des vecteurs)");
      vectors.push(...batch);
    }
    return vectors;
  }
}

/**
 * Vecteurs par hachage de mots et de paires de mots : **aucune** sémantique,
 * seulement du recouvrement lexical. Sert aux tests et au développement sans
 * TEI ; interdit en production (configuration).
 */
export class HashEmbeddings implements EmbeddingProvider {
  readonly model = "hash-v1";
  readonly minSimilarity = 0.2;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
      const words = normalize(text.slice(0, EMBEDDING_MAX_CHARS)).trim().split(" ").filter(Boolean);
      const features = [...words, ...words.slice(1).map((w, i) => `${words[i]} ${w}`)];
      for (const feature of features) {
        const digest = createHash("sha256").update(feature).digest();
        vector[digest.readUInt16BE(0) % EMBEDDING_DIMENSIONS]! += digest[2]! & 1 ? 1 : -1;
      }
      const norm = Math.hypot(...vector) || 1;
      return vector.map((v) => v / norm);
    });
  }
}

/** Littéral pgvector : « [0.1,0.2,…] ». */
export const toPgVector = (vector: number[]) => `[${vector.join(",")}]`;
