import { assist, createPromptLoader, type DemoHandler, type LlmProvider } from "@attesta/llm-client";
import type { Generation } from "@attesta/shared-schemas";
import { z } from "zod";
import { verifiedLines, type VerifiedLine } from "./letters.js";

/*
 * Rédactrice de candidature (ADR 0028, rôle 7 ; évolutions ADR 0029) : réponses aux questions des
 * formulaires et messages au recruteur, rédigés à partir des seules lignes vérifiées du CV. Comme pour la
 * lettre, chaque paragraphe porteur de faits est contrôlé par cv-generation et retiré s'il n'a pas de
 * source ; les formules d'ouverture et de politesse ne doivent contenir aucun fait.
 */

export const applicationPrompts = createPromptLoader(new URL("../prompts/", import.meta.url), {
  "reponse-formulaire": "v2",
  "message-recruteur": "v2",
  "traduction-lettre": "v1",
});

export const ApplicationOutput = z.object({
  opening: z.string(),
  paragraphs: z.array(z.object({ text: z.string(), sources: z.array(z.string()) })),
  closing: z.string(),
});
export type ApplicationOutput = z.infer<typeof ApplicationOutput>;

export type MessageKind = "linkedin" | "relance" | "remerciement";
export type Tone = "sobre" | "chaleureux" | "dynamique";
export type Length = "court" | "moyen" | "long";

/** Limite d'une note d'invitation LinkedIn : au-delà, le message est coupé par LinkedIn. */
export const LINKEDIN_LIMIT = 300;

const offerOf = (g: Generation) => ({
  titre: g.offerTitle,
  entreprise: g.analysis?.company ?? null,
  exigences: g.analysis?.requirements ?? [],
});

export async function answerQuestion(
  provider: LlmProvider,
  g: Generation,
  input: { question: string; tone: Tone; length: Length },
) {
  return assist({
    provider,
    step: "reponse-formulaire",
    system: applicationPrompts.system("reponse-formulaire"),
    data: {
      offre: offerOf(g),
      question: input.question,
      ton: input.tone,
      longueur: input.length,
      lignes_verifiees: verifiedLines(g),
    },
    schema: ApplicationOutput,
    effort: "medium",
  });
}

export async function recruiterMessage(provider: LlmProvider, g: Generation, kind: MessageKind, tone: Tone) {
  return assist({
    provider,
    step: "message-recruteur",
    system: applicationPrompts.system("message-recruteur"),
    data: { offre: offerOf(g), type_de_message: kind, ton: tone, lignes_verifiees: verifiedLines(g) },
    schema: ApplicationOutput,
  });
}

/** Formule sans fait : un chiffre y trahirait une affirmation non contrôlée, on la remplace alors. */
export const factFree = (text: string, fallback: string) =>
  text.trim() && !/\d/.test(text) && text.length <= 300 ? text.trim() : fallback;

/**
 * Note LinkedIn de 300 caractères au plus, coupée par le code à la phrase : politesse raccourcie, puis
 * paragraphes retirés en partant de la fin, puis accroche réduite. Jamais une phrase coupée en deux.
 */
export function fitLinkedIn<T extends { text: string }>(parts: {
  opening: string;
  kept: T[];
  closing: string;
}) {
  const total = (p: typeof parts) => [p.opening, ...p.kept.map((k) => k.text), p.closing].join("\n\n").length;
  let fitted = { ...parts };
  if (total(fitted) > LINKEDIN_LIMIT) fitted = { ...fitted, closing: "Bien cordialement." };
  while (total(fitted) > LINKEDIN_LIMIT && fitted.kept.length)
    fitted = { ...fitted, kept: fitted.kept.slice(0, -1) };
  if (total(fitted) > LINKEDIN_LIMIT) fitted = { ...fitted, opening: "Bonjour," };
  return fitted;
}

/* --- Traduction de la lettre (ADR 0029) ------------------------------------------------------------- */

const TranslatedLetter = z.object({
  greeting: z.string(),
  paragraphs: z.array(z.string()),
  closing: z.string(),
});

/** Nombres d'un texte, normalisés (« 1 200 » = « 1200 », « 40,5 » = « 40.5 »). */
const numbers = (text: string) =>
  (text.match(/\d[\d\s.,]*\d|\d/g) ?? [])
    .map((n) => n.replace(/[\s.]/g, "").replace(",", "."))
    .sort()
    .join("|");

export async function translateLetter(
  provider: LlmProvider,
  letter: { greeting: string; paragraphs: string[]; closing: string },
  lang: "en" | "de",
) {
  const { data, kind } = await assist({
    provider,
    step: "traduction-lettre",
    system: applicationPrompts.system("traduction-lettre"),
    data: { langue: lang, lettre: letter },
    schema: TranslatedLetter,
    maxTokens: 6000,
  });
  // Garde-fou : un paragraphe traduit garde exactement les nombres de l'original, sinon il est écarté.
  const kept = letter.paragraphs.flatMap((p, i) => {
    const t = data.paragraphs[i];
    return t && numbers(t) === numbers(p) ? [t.trim()] : [];
  });
  return {
    lang,
    greeting: factFree(
      data.greeting,
      lang === "en" ? "Dear Sir or Madam," : "Sehr geehrte Damen und Herren,",
    ),
    paragraphs: kept,
    closing: factFree(data.closing, lang === "en" ? "Yours faithfully," : "Mit freundlichen Grüßen"),
    rejected: letter.paragraphs.length - kept.length,
    providerKind: kind,
  };
}

/* --- Mode démonstration : texte construit à partir des lignes vérifiées, sans modèle ----------------- */

/** Lignes les plus proches d'une question (mots communs), sinon les premières réalisations chiffrées. */
function relevant(lines: VerifiedLine[], question: string, count: number) {
  const words = new Set(
    question
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 4),
  );
  const scored = lines
    .map((l) => ({
      l,
      score: l.text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => words.has(w)).length,
    }))
    .sort((a, b) => b.score - a.score || Number(/\d/.test(b.l.text)) - Number(/\d/.test(a.l.text)));
  return scored.slice(0, count).map((s) => s.l);
}

const sentence = (text: string) => text.trim().replace(/[.;\s]+$/, "") + ".";
const lower = (text: string) => sentence(text).charAt(0).toLowerCase() + sentence(text).slice(1);

const OPENINGS: Record<Tone, string> = {
  sobre: "Mon parcours répond concrètement à cette question.",
  chaleureux: "Merci pour cette question, à laquelle je réponds avec plaisir.",
  dynamique: "Voici ce que je peux vous apporter, concrètement.",
};
const CLOSINGS: Record<Tone, string> = {
  sobre: "Je vous en dirai volontiers davantage lors d'un entretien.",
  chaleureux: "Ce serait un plaisir d'en échanger avec vous de vive voix.",
  dynamique: "Parlons-en lors d'un entretien !",
};

const LETTER_WORDS: Record<"en" | "de", [RegExp, string][]> = {
  en: [
    [/^Madame, Monsieur,?$/, "Dear Sir or Madam,"],
    [/\bje\b/gi, "I"],
    [/\bvotre offre\b/gi, "your offer"],
    [/\bmon parcours\b/gi, "my background"],
  ],
  de: [
    [/^Madame, Monsieur,?$/, "Sehr geehrte Damen und Herren,"],
    [/\bje\b/gi, "ich"],
    [/\bvotre offre\b/gi, "Ihr Angebot"],
    [/\bmon parcours\b/gi, "mein Werdegang"],
  ],
};

export const applicationDemoHandlers: Record<string, DemoHandler> = {
  "reponse-formulaire": (input) => {
    const {
      question,
      lignes_verifiees,
      ton = "sobre",
      longueur = "moyen",
    } = input as {
      question: string;
      lignes_verifiees: VerifiedLine[];
      ton?: Tone;
      longueur?: Length;
    };
    const count = { court: 1, moyen: 2, long: 3 }[longueur];
    const picked = relevant(lignes_verifiees, question, count);
    return {
      opening: OPENINGS[ton],
      paragraphs: picked.map((l, i) => ({
        text: i === 0 ? sentence(l.text) : `${i === 1 ? "Par exemple" : "Autre exemple"} : ${lower(l.text)}`,
        sources: l.sources,
      })),
      closing: CLOSINGS[ton],
    };
  },
  "message-recruteur": (input) => {
    const {
      offre,
      type_de_message,
      lignes_verifiees,
      ton = "sobre",
    } = input as {
      offre: { titre: string };
      type_de_message: MessageKind;
      lignes_verifiees: VerifiedLine[];
      ton?: Tone;
    };
    const [first] = relevant(lignes_verifiees, offre.titre, 1);
    const hello = ton === "chaleureux" ? "Bonjour et merci de me lire," : "Bonjour,";
    const openings: Record<MessageKind, string> = {
      linkedin: `${hello} votre offre « ${offre.titre} » a retenu toute mon attention.`,
      relance: `${hello} je me permets de revenir vers vous au sujet de ma candidature au poste « ${offre.titre} ».`,
      remerciement: `${hello} merci pour notre échange au sujet du poste « ${offre.titre} ».`,
    };
    const closings: Record<MessageKind, string> = {
      linkedin:
        ton === "dynamique"
          ? "Un court échange cette semaine ? Bien cordialement."
          : "Seriez-vous disponible pour un court échange ? Bien cordialement.",
      relance: "Je reste à votre disposition pour tout complément. Bien cordialement.",
      remerciement: "Ce poste me motive vivement ; je reste à votre disposition. Bien cordialement.",
    };
    return {
      opening: openings[type_de_message],
      paragraphs: first
        ? [{ text: `Dans mon poste actuel : ${lower(first.text)}`, sources: first.sources }]
        : [],
      closing: closings[type_de_message],
    };
  },
  "traduction-lettre": (input) => {
    const { langue, lettre } = input as {
      langue: "en" | "de";
      lettre: { greeting: string; paragraphs: string[]; closing: string };
    };
    const tr = (t: string) => LETTER_WORDS[langue].reduce((s, [p, w]) => s.replace(p, w), t);
    return {
      greeting: tr(lettre.greeting),
      paragraphs: lettre.paragraphs.map(tr),
      closing: langue === "en" ? "Yours faithfully," : "Mit freundlichen Grüßen",
    };
  },
};
