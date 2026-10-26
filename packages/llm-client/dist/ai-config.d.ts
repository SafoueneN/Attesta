import { z } from "zod";
import { DemoProvider } from "./demo-provider.js";
import { type FallbackEvent } from "./fallback-provider.js";
import type { LlmProvider } from "./provider.js";
/** Fournisseurs réels, dans l'ordre de repli par défaut (ADR 0047). */
export declare const AI_PROVIDERS: readonly ["claude", "groq", "gemini", "ollama"];
export type AiProviderName = (typeof AI_PROVIDERS)[number];
/**
 * Variables d'environnement communes aux services qui appellent un modèle, à ajouter au schéma du
 * service (`serviceEnv(...).extend(aiEnv)`). Documentées dans le `.env.example` de chaque service.
 */
export declare const aiEnv: {
    /** claude | groq | gemini | ollama ; demo : contenu recopié, sans modèle ; none : aucun. */
    AI_PROVIDER: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
        claude: "claude";
        groq: "groq";
        gemini: "gemini";
        ollama: "ollama";
        demo: "demo";
        none: "none";
    }>>, unknown>;
    /** Ancien nom, lu quand AI_PROVIDER est absent : anthropic et vertex valent claude. */
    LLM_PROVIDER: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
        demo: "demo";
        none: "none";
        anthropic: "anthropic";
        vertex: "vertex";
    }>>, unknown>;
    /** Accès à Claude : vertex (région UE, seul admis en production) ou anthropic (API directe). */
    CLAUDE_TRANSPORT: z.ZodPreprocess<z.ZodOptional<z.ZodEnum<{
        anthropic: "anthropic";
        vertex: "vertex";
    }>>, unknown>;
    /** Ordre de repli explicite (« groq,ollama »), « none » pour aucun ; vide : ordre par défaut. */
    AI_FALLBACK_PROVIDERS: z.ZodDefault<z.ZodString>;
    /** Modèle Claude ; LLM_STEP_MODELS (ADR 0029) ne s'applique qu'à Claude. */
    LLM_MODEL: z.ZodPreprocess<z.ZodDefault<z.ZodString>, unknown>;
    LLM_STEP_MODELS: z.ZodDefault<z.ZodString>;
    LLM_TIMEOUT_MS: z.ZodPreprocess<z.ZodDefault<z.ZodCoercedNumber<unknown>>, unknown>;
    VERTEX_PROJECT_ID: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    VERTEX_REGION: z.ZodPreprocess<z.ZodDefault<z.ZodString>, unknown>;
    /** Lue par le SDK Anthropic ; vérifiée ici pour savoir si l'API directe est configurée. */
    ANTHROPIC_API_KEY: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    GROQ_API_KEY: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    GROQ_MODEL: z.ZodPreprocess<z.ZodDefault<z.ZodString>, unknown>;
    GROQ_BASE_URL: z.ZodPreprocess<z.ZodDefault<z.ZodURL>, unknown>;
    GEMINI_API_KEY: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    GEMINI_MODEL: z.ZodPreprocess<z.ZodDefault<z.ZodString>, unknown>;
    /** Serveur Ollama (`http://ollama:11434`) ; absent : Ollama n'est pas configuré. */
    OLLAMA_BASE_URL: z.ZodPreprocess<z.ZodOptional<z.ZodURL>, unknown>;
    OLLAMA_MODEL: z.ZodPreprocess<z.ZodDefault<z.ZodString>, unknown>;
};
export type AiEnv = z.infer<z.ZodObject<typeof aiEnv>>;
type NodeEnv = string | undefined;
/** Fournisseur choisi : AI_PROVIDER, à défaut l'ancien LLM_PROVIDER, à défaut la démonstration. */
export declare function aiProvider(env: AiEnv): AiProviderName | "demo" | "none";
export declare function claudeTransport(env: AiEnv): "vertex" | "anthropic";
/**
 * Fournisseurs essayés, dans l'ordre : le fournisseur choisi, puis les suivants de l'ordre par défaut
 * (circulaire) qui sont configurés, ou la liste AI_FALLBACK_PROVIDERS. En production, seuls les
 * fournisseurs qui traitent les données dans l'UE restent. Vide en démonstration ou sans IA.
 */
export declare function aiChain(env: AiEnv, nodeEnv: NodeEnv): AiProviderName[];
/** Problèmes de configuration, à ajouter à ceux du service avant le démarrage. */
export declare function aiConfigProblems(env: AiEnv, nodeEnv: NodeEnv): string[];
/**
 * Fournisseur configuré d'un service : chaîne de repli (`FallbackProvider`) quand plusieurs fournisseurs
 * sont disponibles ; « none » : aucun. En démonstration, `demo` donne les réponses recopiées du service.
 */
export declare function createAiProvider(env: AiEnv, nodeEnv: NodeEnv, demo?: ConstructorParameters<typeof DemoProvider>[0], onFallback?: (event: FallbackEvent) => void): LlmProvider | undefined;
export {};
