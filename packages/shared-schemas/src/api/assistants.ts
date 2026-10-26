import { z } from "zod";
import { Profile } from "../profile.js";
import { ProviderKind, Uuid } from "./common.js";

/*
 * Rôles de l'IA (ADR 0028). Règle commune : l'IA propose, explique et conseille ; elle n'ajoute jamais un
 * fait au profil ni au CV sans validation du candidat, et tout texte destiné à un recruteur est contrôlé
 * contre les faits du profil. `providerKind` dit si la réponse vient du modèle ou du mode démonstration.
 */

/* --- 1. Intervieweuse de profil (profiles) -------------------------------------------------------------- */

export const ProfileQuestion = z.object({
  id: z.string(),
  /** Élément du profil que la question cherche à enrichir : `/work/0`, `/projects/1`. */
  target: z.string(),
  question: z.string(),
  /** Pourquoi la question est posée : ce qu'une réponse précise apporterait au CV. */
  why: z.string(),
});
export type ProfileQuestion = z.infer<typeof ProfileQuestion>;

export const ProfileInterview = z.object({ questions: z.array(ProfileQuestion), providerKind: ProviderKind });

/** Sujet facultatif : une compétence acquise grâce au plan de progression, à faire entrer au profil. */
export const ProfileInterviewRequest = z.object({ topic: z.string().trim().max(120).optional() });
export type ProfileInterview = z.infer<typeof ProfileInterview>;

export const ProfileAnswer = z.object({
  target: z.string().regex(/^\/(work|projects)\/\d{1,2}$/, "Élément du profil inconnu"),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(3, "Répondez en quelques mots").max(2000, "2 000 caractères au plus"),
});

/** Réalisation proposée à partir de la réponse : elle n'entre au profil qu'après validation du candidat. */
export const FactProposal = z.object({ target: z.string(), text: z.string() });
export const FactProposals = z.object({
  proposals: z.array(FactProposal),
  /** Propositions écartées : un chiffre ou un nom propre absent de la réponse du candidat. */
  dropped: z.number().int().min(0),
  /** Relance quand la réponse est vague (aucun chiffre, aucun outil) ; null sinon. */
  followUp: z.string().nullable(),
  providerKind: ProviderKind,
});
export type FactProposals = z.infer<typeof FactProposals>;

/* --- 2. Juge de fidélité (cv-generation) ---------------------------------------------------------------- */

export const JudgeVerdict = z.object({
  path: z.string(),
  verdict: z.enum(["fidele", "nuance", "infidele"]),
  explanation: z.string(),
  /** Reformulation fidèle proposée, déjà passée au contrôle de fidélité ; null si aucune. */
  suggestion: z.string().nullable(),
});
export const FidelityJudgement = z.object({ verdicts: z.array(JudgeVerdict), providerKind: ProviderKind });
export type FidelityJudgement = z.infer<typeof FidelityJudgement>;

/* --- 3. Coach d'entretien (cv-generation) --------------------------------------------------------------- */

export const InterviewQuestion = z.object({
  question: z.string(),
  /** Ce que le recruteur cherche à vérifier. */
  intent: z.string(),
  /** Faits du profil sur lesquels s'appuyer pour répondre. */
  sources: z.array(z.string()),
  tip: z.string(),
});
export const InterviewPrep = z.object({ questions: z.array(InterviewQuestion), providerKind: ProviderKind });

/** Niveau de l'entretien : RH (motivation), manager (situations), technique (métier). */
export const InterviewLevel = z.enum(["rh", "manager", "technique"]);
export const InterviewPrepRequest = z.object({ level: InterviewLevel.default("manager") });
export type InterviewPrep = z.infer<typeof InterviewPrep>;

export const InterviewAnswer = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(10, "Rédigez votre réponse (10 caractères au moins)").max(4000),
});

export const InterviewFeedback = z.object({
  /** Méthode STAR : situation, tâche, action, résultat repérés dans la réponse. */
  star: z.object({ situation: z.boolean(), task: z.boolean(), action: z.boolean(), result: z.boolean() }),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  /** Faits du profil qui auraient pu appuyer la réponse. */
  facts: z.array(z.object({ pointer: z.string(), text: z.string() })),
  /** Extraits de la réponse (recopiés tels quels) qui portent chaque partie STAR. */
  highlights: z.array(
    z.object({ part: z.enum(["situation", "task", "action", "result"]), excerpt: z.string() }),
  ),
  /** Question de relance du recruteur, selon la réponse ; null si aucune. */
  followUp: z.string().nullable(),
  providerKind: ProviderKind,
});
export type InterviewFeedback = z.infer<typeof InterviewFeedback>;

/* --- 4. Plan de progression (cv-generation) ------------------------------------------------------------- */

export const LearningItem = z.object({
  skill: z.string(),
  why: z.string(),
  steps: z.array(z.string()),
  /** Projet concret qui produira une réalisation vérifiable à ajouter ensuite au profil. */
  project: z.string(),
  weeks: z.number().int().min(1).max(52),
  /** Liens officiels, tirés d'un catalogue tenu dans le code (jamais écrits par le modèle). */
  resources: z.array(z.object({ title: z.string(), url: z.string() })),
});
export const LearningPlan = z.object({ items: z.array(LearningItem), providerKind: ProviderKind });
export type LearningPlan = z.infer<typeof LearningPlan>;

/** Plan sur tous les CV du candidat : compétences les plus demandées d'abord. */
export const LearningOverview = z.object({
  skills: z.array(
    z.object({ skill: z.string(), offers: z.number().int(), offerTitles: z.array(z.string()) }),
  ),
  items: z.array(LearningItem),
  providerKind: ProviderKind,
});
export type LearningOverview = z.infer<typeof LearningOverview>;

/* --- 5. Explication de correspondance (jobs-matching) --------------------------------------------------- */

/** Le profil est celui du candidat qui demande l'explication : sa propre donnée, déjà affichée. */
export const MatchExplainRequest = z.object({ profile: Profile });
export const MatchExplanation = z.object({
  score: z.number().int().min(0).max(100),
  matched: z.array(z.object({ skill: z.string(), evidence: z.string() })),
  missing: z.array(z.string()),
  /** Parmi les manques, ceux que l'annonce exige (le reste est souhaité). */
  missingMust: z.array(z.string()),
  summary: z.string(),
  providerKind: ProviderKind,
});
export type MatchExplanation = z.infer<typeof MatchExplanation>;

/** Scores calculés par le code seul (sans IA), pour toute une liste d'offres. */
export const MatchScoresRequest = z.object({ profile: Profile, ids: z.array(Uuid).min(1).max(100) });
export const MatchScores = z.array(
  z.object({
    id: Uuid,
    score: z.number().int().min(0).max(100),
    matched: z.number().int(),
    total: z.number().int(),
  }),
);
export type MatchScores = z.infer<typeof MatchScores>;

/* --- 6. Traduction fidèle (cv-generation) --------------------------------------------------------------- */

export const TranslationLang = z.enum(["en", "de"]);
export const TranslateRequest = z.object({ lang: TranslationLang });
export const CvTranslation = z.object({
  lang: TranslationLang,
  lines: z.array(z.object({ path: z.string(), source: z.string(), text: z.string() })),
  /** Lignes dont la traduction a été écartée : chiffre absent ou ajouté par rapport à l'original. */
  rejected: z.number().int().min(0),
  /** Positions des lignes écartées : l'original y est gardé. */
  rejectedPaths: z.array(z.string()),
  /** Lignes modifiées par le candidat. */
  edited: z.array(z.string()),
  providerKind: ProviderKind,
});
export type CvTranslation = z.infer<typeof CvTranslation>;

/** Lignes traduites modifiées par le candidat : mêmes chiffres et mêmes noms propres exigés. */
export const TranslationEdit = z.object({
  lines: z
    .array(z.object({ path: z.string().max(60), text: z.string().trim().min(1).max(500) }))
    .min(1)
    .max(200),
});

/** Lettre traduite : paragraphes écartés si leurs chiffres changent. */
export const LetterTranslation = z.object({
  lang: TranslationLang,
  greeting: z.string(),
  paragraphs: z.array(z.string()),
  closing: z.string(),
  rejected: z.number().int().min(0),
  providerKind: ProviderKind,
});
export type LetterTranslation = z.infer<typeof LetterTranslation>;

/* --- 7. Rédactrice de candidature (letters-export) ------------------------------------------------------ */

export const ApplicationTone = z.enum(["sobre", "chaleureux", "dynamique"]);
export const ApplicationLength = z.enum(["court", "moyen", "long"]);
export const ApplicationAnswerRequest = z.object({
  generationId: Uuid,
  question: z.string().trim().min(5, "Saisissez la question du formulaire").max(500),
  tone: ApplicationTone.default("sobre"),
  length: ApplicationLength.default("moyen"),
});
export const ApplicationMessageKind = z.enum(["linkedin", "relance", "remerciement"]);
export const ApplicationMessageRequest = z.object({
  generationId: Uuid,
  kind: ApplicationMessageKind,
  tone: ApplicationTone.default("sobre"),
});
/** Paragraphe du texte : ses sources (faits du profil) quand il porte des faits, aucune pour une formule. */
export const ApplicationParagraph = z.object({
  text: z.string(),
  sources: z.array(z.string()),
  /** Libellés lisibles des sources, pour les montrer au survol. */
  sourceLabels: z.array(z.string()),
  status: z.enum(["supported", "unsupported", "formule"]),
});
export const ApplicationText = z.object({
  /** Identifiant dans l'historique (comptes seulement) ; null pour un invité. */
  id: Uuid.nullable(),
  text: z.string(),
  paragraphs: z.array(ApplicationParagraph),
  /** Phrases rédigées mais sans source dans le CV vérifié, retirées avant affichage. */
  removed: z.number().int().min(0),
  providerKind: ProviderKind,
});
export type ApplicationText = z.infer<typeof ApplicationText>;

/** Texte modifié par le candidat, recontrôlé paragraphe par paragraphe. */
export const ApplicationCheckRequest = z.object({
  generationId: Uuid,
  text: z.string().trim().min(1).max(4000),
});
export const ApplicationCheck = z.object({ paragraphs: z.array(ApplicationParagraph) });
export type ApplicationCheck = z.infer<typeof ApplicationCheck>;

export const ApplicationKind = z.enum(["formulaire", "linkedin", "relance", "remerciement"]);
export const ApplicationHistoryItem = z.object({
  id: Uuid,
  generationId: Uuid,
  kind: ApplicationKind,
  question: z.string().nullable(),
  text: z.string(),
  createdAt: z.string(),
});
export type ApplicationHistoryItem = z.infer<typeof ApplicationHistoryItem>;

/** Suivi d'une candidature : où en est-elle, et quand relancer. */
export const ApplicationStatus = z.enum(["a_envoyer", "envoyee", "relancee", "entretien", "refus", "offre"]);
export const ApplicationTrackingInput = z.object({
  status: ApplicationStatus,
  sentAt: z.iso.date().nullable(),
  note: z.string().trim().max(500).nullable(),
});
export const ApplicationTracking = ApplicationTrackingInput.extend({
  generationId: Uuid,
  offerTitle: z.string(),
  /** Date de relance conseillée : 10 jours après l'envoi, tant que rien n'a bougé. */
  followUpOn: z.string().nullable(),
  updatedAt: z.string(),
});
export type ApplicationTracking = z.infer<typeof ApplicationTracking>;

/* --- 8. Conseillère ATS (cv-generation) ----------------------------------------------------------------- */

export const AtsKeyword = z.object({
  term: z.string(),
  /** place : déjà dans le CV ; a_placer : dans le profil mais pas dans le CV ; absent : ni l'un ni l'autre. */
  status: z.enum(["place", "a_placer", "absent"]),
  where: z.string().nullable(),
  advice: z.string(),
});
export const AtsAdvice = z.object({ keywords: z.array(AtsKeyword), providerKind: ProviderKind });
export type AtsAdvice = z.infer<typeof AtsAdvice>;

/**
 * Conseil appliqué : le fait du profil qui contient le mot-clé, recopié tel quel, à ajouter à l'entrée du
 * CV qui le porte. Le candidat valide ; l'ajout passe ensuite par les corrections (`additions`).
 */
export const AtsApplyRequest = z.object({
  term: z.string().trim().min(1).max(200),
  /** Entrée choisie par glisser-déposer (`/work/0`, `/summary`) ; à défaut, celle du fait. */
  entry: z.string().max(30).optional(),
});
export const AtsProposal = z.object({
  term: z.string(),
  entry: z.string(),
  entryLabel: z.string(),
  text: z.string(),
  sources: z.array(z.string()),
});
export type AtsProposal = z.infer<typeof AtsProposal>;

/** Couverture des mots-clés de chaque CV (calcul du code, sans IA), pour comparer les offres. */
export const AtsOverview = z.array(
  z.object({
    generationId: Uuid,
    offerTitle: z.string(),
    placed: z.number().int(),
    possible: z.number().int(),
    total: z.number().int(),
  }),
);
export type AtsOverview = z.infer<typeof AtsOverview>;

/* --- Communs (ADR 0029) ---------------------------------------------------------------------------- */

/** Résultats conservés d'un CV, par clé « rôle » ou « rôle:variante » (langue, niveau). */
export const AssistantResults = z.record(
  z.string(),
  z.object({ payload: z.unknown(), updatedAt: z.string() }),
);
export type AssistantResults = z.infer<typeof AssistantResults>;

/** Avis anonyme sur une réponse : ni identifiant ni contenu, seulement le rôle et le sens. */
export const AssistantVote = z.object({
  role: z.string().regex(/^[a-z-]{2,40}$/),
  vote: z.union([z.literal(1), z.literal(-1)]),
  providerKind: ProviderKind,
});
export type AssistantVote = z.infer<typeof AssistantVote>;
