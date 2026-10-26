import { z } from "zod";
import { AnthropicProvider, createClaudeClient, parseStepModels } from "./anthropic-provider.js";
import { DemoProvider } from "./demo-provider.js";
import { FallbackProvider } from "./fallback-provider.js";
import { createGeminiClient, GeminiProvider } from "./gemini-provider.js";
import { createOpenAiCompatibleClient, OpenAiCompatibleProvider } from "./openai-compatible-provider.js";
/** Fournisseurs réels, dans l'ordre de repli par défaut (ADR 0047). */
export const AI_PROVIDERS = ["claude", "groq", "gemini", "ollama"];
/** Variable vide (`${VAR:-}` de compose) : absente. */
const blank = (schema) => z.preprocess((v) => (v === "" ? undefined : v), schema);
/**
 * Variables d'environnement communes aux services qui appellent un modèle, à ajouter au schéma du
 * service (`serviceEnv(...).extend(aiEnv)`). Documentées dans le `.env.example` de chaque service.
 */
export const aiEnv = {
    /** claude | groq | gemini | ollama ; demo : contenu recopié, sans modèle ; none : aucun. */
    AI_PROVIDER: blank(z.enum([...AI_PROVIDERS, "demo", "none"]).optional()),
    /** Ancien nom, lu quand AI_PROVIDER est absent : anthropic et vertex valent claude. */
    LLM_PROVIDER: blank(z.enum(["demo", "anthropic", "vertex", "none"]).optional()),
    /** Accès à Claude : vertex (région UE, seul admis en production) ou anthropic (API directe). */
    CLAUDE_TRANSPORT: blank(z.enum(["vertex", "anthropic"]).optional()),
    /** Ordre de repli explicite (« groq,ollama »), « none » pour aucun ; vide : ordre par défaut. */
    AI_FALLBACK_PROVIDERS: z.string().default(""),
    /** Modèle Claude ; LLM_STEP_MODELS (ADR 0029) ne s'applique qu'à Claude. */
    LLM_MODEL: blank(z.string().default("claude-opus-5-5")),
    LLM_STEP_MODELS: z.string().default(""),
    LLM_TIMEOUT_MS: blank(z.coerce.number().int().min(1000).default(90_000)),
    VERTEX_PROJECT_ID: blank(z.string().optional()),
    VERTEX_REGION: blank(z.string().default("eu")),
    /** Lue par le SDK Anthropic ; vérifiée ici pour savoir si l'API directe est configurée. */
    ANTHROPIC_API_KEY: blank(z.string().optional()),
    GROQ_API_KEY: blank(z.string().optional()),
    GROQ_MODEL: blank(z.string().default("openai/gpt-oss-120b")),
    GROQ_BASE_URL: blank(z.url().default("https://api.groq.com/openai/v1")),
    GEMINI_API_KEY: blank(z.string().optional()),
    GEMINI_MODEL: blank(z.string().default("gemini-2.5-flash")),
    /** Serveur Ollama (`http://ollama:11434`) ; absent : Ollama n'est pas configuré. */
    OLLAMA_BASE_URL: blank(z.url().optional()),
    OLLAMA_MODEL: blank(z.string().default("qwen3:8b")),
};
/** Fournisseur choisi : AI_PROVIDER, à défaut l'ancien LLM_PROVIDER, à défaut la démonstration. */
export function aiProvider(env) {
    if (env.AI_PROVIDER)
        return env.AI_PROVIDER;
    if (env.LLM_PROVIDER === "anthropic" || env.LLM_PROVIDER === "vertex")
        return "claude";
    return env.LLM_PROVIDER ?? "demo";
}
export function claudeTransport(env) {
    return env.CLAUDE_TRANSPORT ?? (env.LLM_PROVIDER === "anthropic" ? "anthropic" : "vertex");
}
/** Le fournisseur a ce qu'il faut pour être appelé (clé, projet, adresse). */
function configured(name, env) {
    switch (name) {
        case "claude":
            return claudeTransport(env) === "vertex" ? !!env.VERTEX_PROJECT_ID : !!env.ANTHROPIC_API_KEY;
        case "groq":
            return !!env.GROQ_API_KEY;
        case "gemini":
            return !!env.GEMINI_API_KEY;
        case "ollama":
            return !!env.OLLAMA_BASE_URL;
    }
}
/** Traitement dans l'Union européenne (décision Q5) : seuls fournisseurs admis en production. */
function inEu(name, env) {
    return name === "ollama" || (name === "claude" && claudeTransport(env) === "vertex");
}
const isProviderName = (v) => AI_PROVIDERS.includes(v);
function explicitFallbacks(env) {
    const value = env.AI_FALLBACK_PROVIDERS.trim();
    if (!value)
        return undefined;
    if (value === "none")
        return [];
    return value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
}
/**
 * Fournisseurs essayés, dans l'ordre : le fournisseur choisi, puis les suivants de l'ordre par défaut
 * (circulaire) qui sont configurés, ou la liste AI_FALLBACK_PROVIDERS. En production, seuls les
 * fournisseurs qui traitent les données dans l'UE restent. Vide en démonstration ou sans IA.
 */
export function aiChain(env, nodeEnv) {
    const primary = aiProvider(env);
    if (primary === "demo" || primary === "none")
        return [];
    const i = AI_PROVIDERS.indexOf(primary);
    const rest = explicitFallbacks(env)?.filter(isProviderName) ??
        [...AI_PROVIDERS.slice(i + 1), ...AI_PROVIDERS.slice(0, i)].filter((n) => configured(n, env));
    const allowed = rest.filter((n) => n !== primary && (nodeEnv !== "production" || inEu(n, env)));
    return [primary, ...new Set(allowed)];
}
const REQUIRED = {
    claude: (env) => (claudeTransport(env) === "vertex" ? "VERTEX_PROJECT_ID" : "ANTHROPIC_API_KEY"),
    groq: () => "GROQ_API_KEY",
    gemini: () => "GEMINI_API_KEY",
    ollama: () => "OLLAMA_BASE_URL",
};
/** Problèmes de configuration, à ajouter à ceux du service avant le démarrage. */
export function aiConfigProblems(env, nodeEnv) {
    const problems = [];
    const prod = nodeEnv === "production";
    const primary = aiProvider(env);
    if (primary === "none")
        return problems;
    if (primary === "demo") {
        if (prod)
            problems.push("AI_PROVIDER : le mode démonstration est interdit en production");
        return problems;
    }
    if (!configured(primary, env))
        problems.push(`${REQUIRED[primary](env)} : requis pour ${primary}`);
    if (prod && !inEu(primary, env)) {
        problems.push("AI_PROVIDER : en production, seuls Claude sur Vertex AI (UE) et Ollama sont admis (décision Q5)");
    }
    for (const name of explicitFallbacks(env) ?? []) {
        if (!isProviderName(name)) {
            problems.push(`AI_FALLBACK_PROVIDERS : fournisseur inconnu « ${name} »`);
        }
        else if (prod && !inEu(name, env)) {
            problems.push(`AI_FALLBACK_PROVIDERS : ${name} ne traite pas les données dans l'UE (décision Q5)`);
        }
        else if (!configured(name, env)) {
            problems.push(`${REQUIRED[name](env)} : requis pour le repli vers ${name}`);
        }
    }
    return problems;
}
/** `maxRetries` : relances du SDK, 0 quand un fournisseur suivant prend le relais. */
function buildProvider(name, env, maxRetries) {
    const timeoutMs = env.LLM_TIMEOUT_MS;
    switch (name) {
        case "claude":
            return new AnthropicProvider(createClaudeClient({
                provider: claudeTransport(env),
                timeoutMs,
                vertexProjectId: env.VERTEX_PROJECT_ID,
                vertexRegion: env.VERTEX_REGION,
                maxRetries,
            }), { model: env.LLM_MODEL, timeoutMs, stepModels: parseStepModels(env.LLM_STEP_MODELS) });
        case "groq":
            return new OpenAiCompatibleProvider(createOpenAiCompatibleClient({
                baseURL: env.GROQ_BASE_URL,
                apiKey: env.GROQ_API_KEY,
                timeoutMs,
                maxRetries,
            }), { name, model: env.GROQ_MODEL, timeoutMs });
        case "gemini":
            return new GeminiProvider(createGeminiClient({ apiKey: env.GEMINI_API_KEY, maxRetries }), {
                model: env.GEMINI_MODEL,
                timeoutMs,
            });
        case "ollama":
            return new OpenAiCompatibleProvider(createOpenAiCompatibleClient({
                baseURL: `${(env.OLLAMA_BASE_URL ?? "").replace(/\/+$/, "")}/v1`,
                timeoutMs,
                maxRetries,
            }), { name, model: env.OLLAMA_MODEL, timeoutMs, free: true });
    }
}
/**
 * Fournisseur configuré d'un service : chaîne de repli (`FallbackProvider`) quand plusieurs fournisseurs
 * sont disponibles ; « none » : aucun. En démonstration, `demo` donne les réponses recopiées du service.
 */
export function createAiProvider(env, nodeEnv, demo = {}, onFallback) {
    const primary = aiProvider(env);
    if (primary === "none")
        return undefined;
    if (primary === "demo")
        return new DemoProvider(demo);
    const chain = aiChain(env, nodeEnv);
    const providers = chain.map((name, i) => buildProvider(name, env, i < chain.length - 1 ? 0 : 2));
    return providers.length === 1 ? providers[0] : new FallbackProvider(providers, onFallback);
}
