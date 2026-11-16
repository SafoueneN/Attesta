import {
  AssistUnavailableError,
  DemoProvider,
  LlmUnavailableError,
  ScriptedProvider,
} from "@attesta/llm-client";
import { describe, expect, it } from "vitest";
import {
  applicationDemoHandlers,
  factFree,
  fitLinkedIn,
  LINKEDIN_LIMIT,
  translateLetter,
} from "../src/applications.js";

/*
 * Campagne QA (A-08) : rédactrice de candidature. Formules sans fait, note LinkedIn de 300 caractères au
 * plus, garde-fou des nombres de la traduction, panne du fournisseur, mode démonstration.
 */

describe("factFree (campagne QA)", () => {
  it.each([
    ["formule sans fait", "Bien cordialement.", "Bien cordialement."],
    ["chiffre → remplacée", "Fort de 10 ans d'expérience, je vous salue.", "repli"],
    ["vide → remplacée", "   ", "repli"],
    ["300 caractères → gardée", "a".repeat(300), "a".repeat(300)],
    ["301 caractères → remplacée", "a".repeat(301), "repli"],
  ])("%s", (_cas, text, expected) => {
    expect(factFree(text, "repli")).toBe(expected);
  });
});

describe("fitLinkedIn (campagne QA)", () => {
  const p = (n: number) => ({ text: `Paragraphe ${n} : ${"x".repeat(90)}.` });

  it("garde un message déjà court tel quel", () => {
    const parts = { opening: "Bonjour,", kept: [p(1)], closing: "Bien à vous." };
    expect(fitLinkedIn(parts)).toEqual(parts);
  });

  it("raccourcit la politesse, retire les paragraphes par la fin, puis réduit l'accroche, sans dépasser 300", () => {
    const fitted = fitLinkedIn({
      opening: `Bonjour, ${"votre offre a retenu mon attention ".repeat(4)}`,
      kept: [p(1), p(2), p(3)],
      closing: "Je reste à votre disposition pour tout complément. Bien cordialement.",
    });
    expect(fitted.closing).toBe("Bien cordialement.");
    expect(fitted.kept.map((k) => k.text)).toEqual([p(1).text]);
    const total = [fitted.opening, ...fitted.kept.map((k) => k.text), fitted.closing].join("\n\n").length;
    expect(total).toBeLessThanOrEqual(LINKEDIN_LIMIT);
  });

  it("réduit l'accroche à « Bonjour, » quand aucun paragraphe ne suffit", () => {
    const fitted = fitLinkedIn({ opening: "B".repeat(400), kept: [p(1)], closing: "Merci." });
    expect(fitted).toEqual({ opening: "Bonjour,", kept: [], closing: "Bien cordialement." });
  });
});

describe("translateLetter (campagne QA)", () => {
  const letter = {
    greeting: "Madame, Monsieur,",
    paragraphs: [
      "J'ai réduit de 40 % le temps de réponse.",
      "J'ai encadré 3 développeurs.",
      "Je suis motivée.",
    ],
    closing: "Cordialement,",
  };

  it("écarte un paragraphe traduit dont les nombres diffèrent de l'original", async () => {
    const llm = new ScriptedProvider({
      "traduction-lettre": [
        {
          data: {
            greeting: "Dear Sir or Madam,",
            paragraphs: ["I cut response time by 40%.", "I managed 5 developers.", "I am motivated."],
            closing: "Yours faithfully,",
          },
        },
      ],
    });
    const out = await translateLetter(llm, letter, "en");
    expect(out.paragraphs).toEqual(["I cut response time by 40%.", "I am motivated."]);
    expect(out.rejected).toBe(1);
  });

  it("remplace une formule traduite qui contiendrait un chiffre (allemand)", async () => {
    const llm = new ScriptedProvider({
      "traduction-lettre": [{ data: { greeting: "Hallo 2026,", paragraphs: [], closing: "Mit 100 Grüßen" } }],
    });
    const out = await translateLetter(llm, { ...letter, paragraphs: [] }, "de");
    expect(out.greeting).toBe("Sehr geehrte Damen und Herren,");
    expect(out.closing).toBe("Mit freundlichen Grüßen");
  });

  it("signale l'assistant indisponible si le fournisseur est en panne", async () => {
    const llm = new ScriptedProvider({
      "traduction-lettre": [{ error: new LlmUnavailableError("délai", undefined, { reason: "timeout" }) }],
    });
    const error = await translateLetter(llm, letter, "en").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AssistUnavailableError);
    expect((error as AssistUnavailableError).reason).toBe("indisponible");
  });

  it("mode démonstration : traduit les formules et garde tous les paragraphes", async () => {
    const out = await translateLetter(new DemoProvider(applicationDemoHandlers), letter, "en");
    expect(out.greeting).toBe("Dear Sir or Madam,");
    expect(out.paragraphs).toHaveLength(3);
    expect(out.providerKind).toBe("demo");
  });
});

describe("mode démonstration : réponses et messages (campagne QA)", () => {
  const lines = [
    { text: "Réduction de 40 % du temps de réponse de l'API", sources: ["/work/0/highlights/1"] },
    { text: "Migration de 12 services vers Node.js 20", sources: ["/work/0/highlights/0"] },
    { text: "Encadrement de stagiaires", sources: ["/work/0/highlights/2"] },
  ];

  it("répond avec les lignes vérifiées les plus proches, chacune avec sa source", () => {
    const out = applicationDemoHandlers["reponse-formulaire"]!({
      question: "Parlez-nous d'une migration de services réussie",
      lignes_verifiees: lines,
      ton: "dynamique",
      longueur: "long",
    }) as { opening: string; paragraphs: { text: string; sources: string[] }[] };
    expect(out.opening).toBe("Voici ce que je peux vous apporter, concrètement.");
    expect(out.paragraphs).toHaveLength(3);
    expect(out.paragraphs[0]).toEqual({
      text: "Migration de 12 services vers Node.js 20.",
      sources: ["/work/0/highlights/0"],
    });
    expect(out.paragraphs[1]!.text).toMatch(/^Par exemple : /);
  });

  it.each(["linkedin", "relance", "remerciement"] as const)(
    "message « %s » : sans ligne vérifiée, aucun paragraphe",
    (kind) => {
      const out = applicationDemoHandlers["message-recruteur"]!({
        offre: { titre: "Développeuse back-end" },
        type_de_message: kind,
        lignes_verifiees: [],
      }) as { opening: string; paragraphs: unknown[] };
      expect(out.opening).toContain("« Développeuse back-end »");
      expect(out.paragraphs).toEqual([]);
    },
  );
});
