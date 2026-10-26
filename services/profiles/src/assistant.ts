import { assist, createPromptLoader, type DemoHandler, type LlmProvider } from "@attesta/llm-client";
import type { Profile } from "@attesta/shared-schemas";
import { z } from "zod";

/*
 * Intervieweuse de profil (ADR 0028, rôle 1) : l'IA pose des questions pour préciser les expériences et
 * projets, puis propose des réalisations tirées de la réponse du candidat. Rien n'entre au profil sans sa
 * validation ; une proposition dont un chiffre n'apparaît pas dans sa réponse est écartée par le code.
 */

export const assistantPrompts = createPromptLoader(new URL("../prompts/", import.meta.url), {
  "entretien-profil": "v2",
  "faits-reponse": "v2",
});

const Questions = z.object({
  questions: z.array(z.object({ target: z.string(), question: z.string(), why: z.string() })),
});
const Proposals = z.object({
  proposals: z.array(z.object({ text: z.string() })),
  followUp: z.string().nullable(),
});

interface Item {
  target: string;
  title: string;
  highlights: string[];
  /** Part de réalisations chiffrées (0 à 1) : les éléments pauvres sont interrogés d'abord. */
  richesse: number;
}

const hasNumber = (text: string) => /\d/.test(text);

/** Richesse d'un élément : part de réalisations chiffrées, pondérée par leur nombre (3 attendues). */
const richness = (highlights: string[]) =>
  Math.round((highlights.filter(hasNumber).length / 3 + Math.min(highlights.length, 3) / 3) * 50) / 100;

/** Expériences et projets du profil, tels que le modèle les reçoit : les moins riches d'abord. */
function items(profile: Profile): Item[] {
  return [
    ...profile.work.map((w, i) => ({
      target: `/work/${i}`,
      title: `${w.position} – ${w.name}`,
      highlights: w.highlights,
      richesse: richness(w.highlights),
    })),
    ...profile.projects.map((p, i) => ({
      target: `/projects/${i}`,
      title: p.name,
      highlights: p.highlights,
      richesse: richness(p.highlights),
    })),
  ].sort((a, b) => a.richesse - b.richesse);
}

export async function interviewQuestions(provider: LlmProvider, profile: Profile, topic?: string) {
  const parcours = items(profile);
  const { data, kind } = await assist({
    provider,
    step: "entretien-profil",
    system: assistantPrompts.system("entretien-profil"),
    data: topic ? { parcours, sujet: topic } : { parcours },
    schema: Questions,
    effort: "medium",
  });
  const known = new Set(parcours.map((p) => p.target));
  return {
    questions: data.questions
      .filter((q) => known.has(q.target))
      .slice(0, 8)
      .map((q, i) => ({ id: `q${i + 1}`, ...q })),
    providerKind: kind,
  };
}

/** Nombres d'un texte, normalisés (« 1 200 », « 1200 » et « 1.200 » sont le même nombre). */
export function numbers(text: string): string[] {
  return (text.match(/\d[\d\s.,]*\d|\d/g) ?? []).map((n) => n.replace(/[\s.]/g, "").replace(",", "."));
}

export async function factProposals(
  provider: LlmProvider,
  profile: Profile,
  input: { target: string; question: string; answer: string },
) {
  const element = items(profile).find((p) => p.target === input.target);
  const { data, kind } = await assist({
    provider,
    step: "faits-reponse",
    system: assistantPrompts.system("faits-reponse"),
    data: {
      element: element ?? { target: input.target },
      question: input.question,
      reponse_du_candidat: input.answer,
    },
    schema: Proposals,
  });
  // Garde-fou : chaque chiffre proposé doit figurer dans la réponse du candidat.
  const allowed = new Set(numbers(input.answer));
  const grounded = data.proposals.filter((p) => numbers(p.text).every((n) => allowed.has(n)));
  // Une relance ne doit pas souffler de chiffre au candidat.
  const followUp = data.followUp?.trim().slice(0, 300);
  return {
    proposals: grounded
      .map((p) => ({ target: input.target, text: p.text.trim().slice(0, 500) }))
      .filter((p) => p.text)
      .slice(0, 4),
    dropped: data.proposals.length - grounded.length,
    followUp: followUp && !hasNumber(followUp) ? followUp : null,
    providerKind: kind,
  };
}

/* --- Mode démonstration : réponses construites à partir des vraies données, sans modèle ------------- */

export const assistantDemoHandlers: Record<string, DemoHandler> = {
  "entretien-profil": (input) => {
    const { parcours, sujet } = input as { parcours: Item[]; sujet?: string };
    const topical =
      sujet && parcours[0]
        ? [
            {
              target: (parcours.find((p) => p.target.startsWith("/projects/")) ?? parcours[0]).target,
              question: `Vous avez progressé sur « ${sujet} » : quel projet avez-vous mené, et qu'a-t-il produit ?`,
              why: "Une compétence acquise n'entre au CV qu'avec une réalisation qui la prouve.",
            },
          ]
        : [];
    const questions = parcours.flatMap((p) => {
      const vague = p.highlights.find((h) => !hasNumber(h));
      const list = [];
      if (vague)
        list.push({
          target: p.target,
          question: `Pour « ${vague} » (${p.title}) : pouvez-vous chiffrer le résultat (volume, durée, gain, nombre de personnes) ?`,
          why: "Une réalisation chiffrée est plus convaincante, et le chiffre devient une source vérifiable.",
        });
      list.push({
        target: p.target,
        question: `Dans votre rôle de ${p.title}, quel est le résultat dont vous êtes le plus fier, et comment l'avez-vous obtenu ?`,
        why: "Les recruteurs cherchent un impact concret ; il manque peut-être à votre profil.",
      });
      if (p.highlights.length < 3)
        list.push({
          target: p.target,
          question: `Quels outils, méthodes ou responsabilités de ${p.title} n'apparaissent pas encore dans votre profil ?`,
          why: "Une expérience décrite en moins de trois réalisations laisse des compétences invisibles.",
        });
      return list;
    });
    return { questions: [...topical, ...questions].slice(0, 8) };
  },
  "faits-reponse": (input) => {
    const { reponse_du_candidat } = input as { reponse_du_candidat: string };
    const sentences = reponse_du_candidat
      .split(/(?<=[.!?;])\s+|\n+/)
      .map((s) => s.trim().replace(/[.;!?]+$/, ""))
      .filter((s) => s.split(/\s+/).length >= 4);
    return {
      proposals: sentences.slice(0, 3).map((s) => ({ text: s.charAt(0).toUpperCase() + s.slice(1) })),
      followUp: !hasNumber(reponse_du_candidat)
        ? "Pouvez-vous chiffrer ce résultat : combien, en combien de temps, pour combien de personnes ?"
        : reponse_du_candidat.length < 80
          ? "Avec quels outils ou quelles méthodes y êtes-vous parvenu ?"
          : null,
    };
  },
};
