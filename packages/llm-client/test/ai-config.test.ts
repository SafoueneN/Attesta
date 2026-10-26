import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  aiChain,
  aiConfigProblems,
  aiEnv,
  aiProvider,
  AnthropicProvider,
  createAiProvider,
  DemoProvider,
  FallbackProvider,
  GeminiProvider,
  OpenAiCompatibleProvider,
} from "../src/index.js";

const env = (values: Record<string, string>) => z.object(aiEnv).parse(values);

/** Tous les fournisseurs configurés (valeurs factices, aucun appel réseau). */
const all = {
  VERTEX_PROJECT_ID: "projet-test",
  GROQ_API_KEY: "cle-groq-test",
  GEMINI_API_KEY: "cle-gemini-test",
  OLLAMA_BASE_URL: "http://ollama:11434",
};

describe("aiProvider", () => {
  it("lit AI_PROVIDER, à défaut l'ancien LLM_PROVIDER, à défaut la démonstration", () => {
    expect(aiProvider(env({ AI_PROVIDER: "groq", LLM_PROVIDER: "vertex" }))).toBe("groq");
    expect(aiProvider(env({ LLM_PROVIDER: "anthropic" }))).toBe("claude");
    expect(aiProvider(env({ LLM_PROVIDER: "vertex" }))).toBe("claude");
    expect(aiProvider(env({ LLM_PROVIDER: "none" }))).toBe("none");
    expect(aiProvider(env({}))).toBe("demo");
    // `${AI_PROVIDER:-}` de compose : variable vide, donc absente.
    expect(aiProvider(env({ AI_PROVIDER: "", LLM_PROVIDER: "demo" }))).toBe("demo");
  });
});

describe("aiChain", () => {
  it("suit l'ordre par défaut à partir du fournisseur choisi, en boucle", () => {
    expect(aiChain(env({ AI_PROVIDER: "claude", ...all }), "development")).toEqual([
      "claude",
      "groq",
      "gemini",
      "ollama",
    ]);
    expect(aiChain(env({ AI_PROVIDER: "gemini", ...all }), "development")).toEqual([
      "gemini",
      "ollama",
      "claude",
      "groq",
    ]);
  });

  it("écarte les fournisseurs non configurés de l'ordre par défaut", () => {
    expect(
      aiChain(
        env({ AI_PROVIDER: "claude", CLAUDE_TRANSPORT: "anthropic", OLLAMA_BASE_URL: all.OLLAMA_BASE_URL }),
        "test",
      ),
    ).toEqual(["claude", "ollama"]);
  });

  it("suit AI_FALLBACK_PROVIDERS, « none » désactivant le repli", () => {
    expect(
      aiChain(env({ AI_PROVIDER: "groq", AI_FALLBACK_PROVIDERS: "ollama, claude", ...all }), "test"),
    ).toEqual(["groq", "ollama", "claude"]);
    expect(aiChain(env({ AI_PROVIDER: "groq", AI_FALLBACK_PROVIDERS: "none", ...all }), "test")).toEqual([
      "groq",
    ]);
  });

  it("ne garde en production que les fournisseurs qui traitent les données dans l'UE", () => {
    expect(aiChain(env({ AI_PROVIDER: "claude", ...all }), "production")).toEqual(["claude", "ollama"]);
    expect(
      aiChain(
        env({ AI_PROVIDER: "ollama", CLAUDE_TRANSPORT: "anthropic", ANTHROPIC_API_KEY: "cle", ...all }),
        "production",
      ),
    ).toEqual(["ollama"]);
  });

  it("est vide en démonstration et sans IA", () => {
    expect(aiChain(env({ AI_PROVIDER: "demo", ...all }), "test")).toEqual([]);
    expect(aiChain(env({ AI_PROVIDER: "none", ...all }), "test")).toEqual([]);
  });
});

describe("aiConfigProblems", () => {
  it("exige ce qu'il faut au fournisseur choisi", () => {
    expect(aiConfigProblems(env({ AI_PROVIDER: "groq" }), "test")).toEqual([
      "GROQ_API_KEY : requis pour groq",
    ]);
    expect(aiConfigProblems(env({ AI_PROVIDER: "claude" }), "test")).toEqual([
      "VERTEX_PROJECT_ID : requis pour claude",
    ]);
    expect(aiConfigProblems(env({ LLM_PROVIDER: "anthropic" }), "test")).toEqual([
      "ANTHROPIC_API_KEY : requis pour claude",
    ]);
    expect(aiConfigProblems(env({ AI_PROVIDER: "ollama", ...all }), "test")).toEqual([]);
  });

  it("refuse en production la démonstration et les fournisseurs hors UE", () => {
    expect(aiConfigProblems(env({}), "production")).toEqual([
      "AI_PROVIDER : le mode démonstration est interdit en production",
    ]);
    expect(aiConfigProblems(env({ AI_PROVIDER: "groq", ...all }), "production")).toHaveLength(1);
    expect(
      aiConfigProblems(
        env({ AI_PROVIDER: "claude", CLAUDE_TRANSPORT: "anthropic", ANTHROPIC_API_KEY: "cle" }),
        "production",
      ),
    ).toHaveLength(1);
    expect(aiConfigProblems(env({ AI_PROVIDER: "claude", ...all }), "production")).toEqual([]);
  });

  it("vérifie la liste de repli explicite", () => {
    expect(
      aiConfigProblems(
        env({ AI_PROVIDER: "ollama", AI_FALLBACK_PROVIDERS: "mistral,groq", ...all }),
        "production",
      ),
    ).toEqual([
      "AI_FALLBACK_PROVIDERS : fournisseur inconnu « mistral »",
      "AI_FALLBACK_PROVIDERS : groq ne traite pas les données dans l'UE (décision Q5)",
    ]);
    expect(
      aiConfigProblems(
        env({ AI_PROVIDER: "ollama", AI_FALLBACK_PROVIDERS: "gemini", OLLAMA_BASE_URL: all.OLLAMA_BASE_URL }),
        "test",
      ),
    ).toEqual(["GEMINI_API_KEY : requis pour le repli vers gemini"]);
  });
});

describe("createAiProvider", () => {
  it("construit la démonstration, aucun fournisseur, ou un fournisseur seul", () => {
    expect(createAiProvider(env({}), "test")).toBeInstanceOf(DemoProvider);
    expect(createAiProvider(env({ AI_PROVIDER: "none" }), "test")).toBeUndefined();
    expect(
      createAiProvider(
        env({ AI_PROVIDER: "claude", CLAUDE_TRANSPORT: "anthropic", ANTHROPIC_API_KEY: "cle" }),
        "test",
      ),
    ).toBeInstanceOf(AnthropicProvider);
    expect(createAiProvider(env({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "cle" }), "test")).toBeInstanceOf(
      GeminiProvider,
    );
  });

  it("enchaîne les fournisseurs disponibles dans un FallbackProvider", () => {
    const provider = createAiProvider(
      env({
        AI_PROVIDER: "groq",
        GROQ_MODEL: "llama-3.1-8b-instant",
        OLLAMA_BASE_URL: "http://ollama:11434/",
      }),
      "test",
    );
    expect(provider).toBeInstanceOf(FallbackProvider);
    expect(provider?.model).toBe("llama-3.1-8b-instant");
    expect(
      createAiProvider(env({ AI_PROVIDER: "ollama", OLLAMA_BASE_URL: "http://ollama:11434" }), "test"),
    ).toBeInstanceOf(OpenAiCompatibleProvider);
  });
});
