import {
  AssistUnavailableError,
  DemoProvider,
  LlmSchemaError,
  LlmUnavailableError,
  ScriptedProvider,
} from "@attesta/llm-client";
import { Profile } from "@attesta/shared-schemas";
import { describe, expect, it } from "vitest";
import { assistantDemoHandlers, factProposals, interviewQuestions, numbers } from "../src/assistant.js";
import { leaProfile } from "./fixtures.js";

/*
 * Campagne QA (A-06) : intervieweuse de profil avec un fournisseur scripté. Réponse valide, réponse non
 * conforme (sortie JSON cassée), panne et délai dépassé ; garde-fou des chiffres absents de la réponse.
 */

const profile = Profile.parse({
  ...leaProfile,
  work: [
    {
      ...leaProfile.work![0]!,
      highlights: ["Migration des services vers Node.js 20", "Réduction de 40 % du temps de réponse"],
    },
  ],
  projects: [{ name: "Outil de veille interne", highlights: ["Prototype livré"] }],
});

describe("interviewQuestions (campagne QA)", () => {
  it("ne garde que les questions qui visent un élément du profil, au plus 8, numérotées", async () => {
    const questions = [
      { target: "/work/0", question: "Combien de services ?", why: "chiffrer" },
      { target: "/work/9", question: "Élément inventé ?", why: "hors profil" },
      ...Array.from({ length: 9 }, (_, i) => ({ target: "/projects/0", question: `Q${i}`, why: "w" })),
    ];
    const llm = new ScriptedProvider({ "entretien-profil": [{ data: { questions } }] });
    const out = await interviewQuestions(llm, profile, "Kubernetes");
    expect(out.providerKind).toBe("ia");
    expect(out.questions).toHaveLength(8);
    expect(out.questions.every((q) => q.target !== "/work/9")).toBe(true);
    expect(out.questions[0]).toMatchObject({ id: "q1", target: "/work/0" });
    // Le modèle reçoit les éléments les moins riches d'abord, et le sujet demandé.
    const input = llm.requests[0]!.input as { parcours: { target: string }[]; sujet: string };
    expect(input.parcours[0]!.target).toBe("/projects/0");
    expect(input.sujet).toBe("Kubernetes");
  });

  it("réessaie une sortie non conforme, puis abandonne : « non-conforme » après 3 essais", async () => {
    const broken = () => ({ error: new LlmSchemaError("JSON cassé : Unexpected token") });
    const llm = new ScriptedProvider({ "entretien-profil": [broken(), broken(), broken()] });
    const error = await interviewQuestions(llm, profile).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AssistUnavailableError);
    expect((error as AssistUnavailableError).reason).toBe("non-conforme");
    expect(llm.requests).toHaveLength(3);
  });

  it("récupère d'une sortie non conforme si le deuxième essai est valide", async () => {
    const llm = new ScriptedProvider({
      "entretien-profil": [
        { error: new LlmSchemaError("tronqué") },
        { data: { questions: [{ target: "/work/0", question: "Combien ?", why: "chiffrer" }] } },
      ],
    });
    expect((await interviewQuestions(llm, profile)).questions).toHaveLength(1);
  });

  it.each([
    ["panne du fournisseur", new LlmUnavailableError("503", 503, { reason: "autre" })],
    ["délai dépassé", new LlmUnavailableError("délai", undefined, { reason: "timeout" })],
  ])("signale « indisponible » sans réessayer (%s)", async (_cas, failure) => {
    const llm = new ScriptedProvider({ "entretien-profil": [{ error: failure }] });
    const error = await interviewQuestions(llm, profile).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AssistUnavailableError);
    expect((error as AssistUnavailableError).reason).toBe("indisponible");
    expect(llm.requests).toHaveLength(1);
  });
});

describe("factProposals (campagne QA)", () => {
  const input = {
    target: "/work/0",
    question: "Combien de services ?",
    answer: "J'ai migré 12 services en 6 mois, avec 1 200 tests automatisés.",
  };

  it("écarte toute proposition dont un chiffre n'est pas dans la réponse du candidat", async () => {
    const llm = new ScriptedProvider({
      "faits-reponse": [
        {
          data: {
            proposals: [
              { text: "Migration de 12 services en 6 mois" },
              { text: "1200 tests automatisés écrits" },
              { text: "Migration de 15 services" },
              { text: "Gain de 30 % de performance" },
            ],
            followUp: "Avec quels outils ?",
          },
        },
      ],
    });
    const out = await factProposals(llm, profile, input);
    expect(out.proposals.map((p) => p.text)).toEqual([
      "Migration de 12 services en 6 mois",
      "1200 tests automatisés écrits",
    ]);
    expect(out.dropped).toBe(2);
    expect(out.followUp).toBe("Avec quels outils ?");
  });

  it("supprime une relance qui soufflerait un chiffre, et tronque les textes trop longs", async () => {
    const llm = new ScriptedProvider({
      "faits-reponse": [
        {
          data: {
            proposals: [{ text: `  ${"Réalisation ".repeat(60)}  ` }, { text: "   " }],
            followUp: "Plutôt 20 services ?",
          },
        },
      ],
    });
    const out = await factProposals(llm, profile, input);
    expect(out.followUp).toBeNull();
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0]!.text.length).toBe(500);
  });

  it("normalise les nombres : « 1 200 », « 1200 » et « 1.200 » sont le même", () => {
    expect(numbers("1 200 et 1.200 et 1200, puis 3,5")).toEqual(["1200", "1200", "1200", "3.5"]);
  });

  it("mode démonstration : propositions tirées de la réponse, relance si aucun chiffre", async () => {
    const demo = new DemoProvider(assistantDemoHandlers);
    const out = await factProposals(demo, profile, {
      ...input,
      answer: "J'ai repris le service de paiement. J'ai formé toute l'équipe au nouvel outil.",
    });
    expect(out.providerKind).toBe("demo");
    expect(out.proposals[0]!.text).toBe("J'ai repris le service de paiement");
    expect(out.followUp).toMatch(/^Pouvez-vous chiffrer/);
  });
});
