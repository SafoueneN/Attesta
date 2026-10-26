import type {
  CvShare,
  CvVariant,
  ApplicationTracking,
  AccountCreate,
  PasswordChange,
  PasswordLogin,
  PasswordReset,
  RecoveryCodes,
  AssistantResults,
  AtsOverview,
  AtsProposal,
  LearningOverview,
  LetterTranslation,
  Reminder,
  ReminderInput,
  AtsAdvice,
  CvTranslation,
  FactProposals,
  FidelityJudgement,
  InterviewFeedback,
  InterviewPrep,
  LearningPlan,
  ProfileInterview,
  Corrections,
  Evidence,
  EvidenceKind,
  Generation,
  GenerationSummary,
  ImportResult,
  JobPosting,
  ProfilePhoto,
  PostingsOverview,
  Letter,
  LlmUsageSummary,
  Me,
  OfferSummary,
  Profile,
  ServiceStats,
  SessionResponse,
  StoredOffer,
  StoredProfile,
  Subscription,
  SubscriptionInput,
  WatchMatch,
  WatchRun,
  City,
  AuthAdminStats,
} from "@attesta/shared-schemas";
import { api, authCall, download, publicCall, send } from "./client";

/** Usages du CV selon le pays visé (ADR 0036). */
export type CvNorms = "FR" | "DE" | "CA" | "TN";

/** Appels de l'API par service, à travers la gateway (`/api/<service>`). Aucune logique métier ici. */

export const auth = {
  /** Comptes par identifiant et mot de passe (ADR 0030). */
  createAccount: (body: AccountCreate) => authCall<SessionResponse>("/accounts", "POST", body),
  passwordLogin: (body: PasswordLogin) => authCall<SessionResponse>("/session/password", "POST", body),
  /** Mot de passe oublié, par code de récupération (ADR 0039). */
  resetPassword: (body: PasswordReset) => authCall<SessionResponse>("/password/reset", "POST", body),
  changePassword: (body: PasswordChange) =>
    api<SessionResponse>("/auth/v1/me/password", { method: "PUT", body }),
  newRecoveryCodes: () => api<RecoveryCodes>("/auth/v1/me/recovery-codes", { method: "POST" }),
  requestLink: (email: string) =>
    authCall<{ message: string }>("/login-links", "POST", { email, policyAccepted: true }),
  previewLink: (token: string) => authCall<{ maskedEmail: string }>(`/login-links/${token}`, "GET"),
  openSession: (token: string) => authCall<SessionResponse>("/session", "POST", { token }),
  closeSession: () => authCall<void>("/session", "DELETE"),
  me: () => api<Me>("/auth/v1/me"),
  setPromoConsent: (granted: boolean) =>
    api<void>("/auth/v1/me/consents", { method: "PUT", body: { purpose: "promo", granted } }),
  exportData: () => download("/auth/v1/me/export", {}, "attesta-mes-donnees.json"),
  deleteAccount: () => api<{ message: string }>("/auth/v1/me", { method: "DELETE", body: { confirm: true } }),
  adminStats: () => api<AuthAdminStats>("/auth/v1/admin/stats"),
};

export const profiles = {
  current: () => api<StoredProfile>("/profiles/v1/profiles/me"),
  save: (profile: Profile) =>
    api<StoredProfile>("/profiles/v1/profiles/me", { method: "PUT", body: { profile } }),
  remove: () => api<void>("/profiles/v1/profiles/me", { method: "DELETE" }),
  versions: () =>
    api<{ version: number; createdAt: string; label: string }[]>("/profiles/v1/profiles/me/versions"),
  importPdf: (file: File) => {
    const form = new FormData();
    form.append("cv", file);
    return api<ImportResult>("/profiles/v1/profiles/import", { method: "POST", form });
  },
  /** Pièces justificatives (ADR 0027) : comptes seulement. */
  evidence: () => api<Evidence[]>("/profiles/v1/profiles/me/evidence"),
  addEvidence: (input: { file: File; target: string; kind: EvidenceKind; label: string }) => {
    const form = new FormData();
    form.append("target", input.target);
    form.append("kind", input.kind);
    form.append("label", input.label);
    form.append("piece", input.file);
    return api<Evidence>("/profiles/v1/profiles/me/evidence", { method: "POST", form });
  },
  evidenceFile: (piece: Pick<Evidence, "id" | "fileName">) =>
    download(`/profiles/v1/profiles/me/evidence/${piece.id}/file`, { accept: "*/*" }, piece.fileName),
  /** Intervieweuse de profil (ADR 0028, rôle 1). */
  interview: (topic?: string) =>
    api<ProfileInterview>("/profiles/v1/profiles/me/interview", {
      method: "POST",
      body: topic ? { topic } : {},
    }),
  interviewAnswer: (body: { target: string; question: string; answer: string }) =>
    api<FactProposals>("/profiles/v1/profiles/me/interview/answer", { method: "POST", body }),
  /** Photo du CV (ADR 0036) : stockée à part, jamais envoyée à l'IA. */
  photo: async () => {
    const res = await send("/profiles/v1/profiles/me/photo", {
      method: "GET",
      accept: "image/jpeg, image/png",
    });
    return res.blob();
  },
  setPhoto: (file: Blob) => {
    const form = new FormData();
    form.append("photo", file, "photo.jpg");
    return api<ProfilePhoto>("/profiles/v1/profiles/me/photo", { method: "PUT", form });
  },
  removePhoto: () => api<void>("/profiles/v1/profiles/me/photo", { method: "DELETE" }),
  removeEvidence: (id: string) => api<void>(`/profiles/v1/profiles/me/evidence/${id}`, { method: "DELETE" }),
  adminStats: () => api<ServiceStats>("/profiles/v1/admin/stats"),
};

export const jobs = {
  offers: () => api<OfferSummary[]>("/jobs/v1/offers"),
  offer: (id: string) => api<StoredOffer>(`/jobs/v1/offers/${id}`),
  createOffer: (rawText: string, sourceUrl?: string) =>
    api<StoredOffer>("/jobs/v1/offers", { method: "POST", body: { rawText, sourceUrl } }),
  fromPosting: (postingId: string) =>
    api<StoredOffer>(`/jobs/v1/offers/from-posting/${postingId}`, { method: "POST" }),
  deleteOffer: (id: string) => api<void>(`/jobs/v1/offers/${id}`, { method: "DELETE" }),
  postings: (filters: { q?: string; country?: string; offset?: number; limit?: number }) => {
    const query = new URLSearchParams(
      Object.entries(filters)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)]),
    );
    return api<JobPosting[]>(`/jobs/v1/postings?${query}`);
  },
  /** Catalogue (ADR 0034) : volume par pays, dernière synchronisation. */
  overview: () => api<PostingsOverview>("/jobs/v1/postings/overview"),
  syncCatalogue: () => api<{ message: string }>("/jobs/v1/admin/catalogue", { method: "POST" }),
  cities: (country: string, q: string) =>
    api<City[]>(`/jobs/v1/cities?${new URLSearchParams({ country, q })}`),
  adminStats: () => api<ServiceStats>("/jobs/v1/admin/stats"),
};

export const cv = {
  generations: () => api<GenerationSummary[]>("/cv/v1/generations"),
  generation: (id: string) => api<Generation>(`/cv/v1/generations/${id}`),
  correct: (
    id: string,
    corrections: Omit<Corrections, "additions"> & Partial<Pick<Corrections, "additions">>,
  ) => api<Generation>(`/cv/v1/generations/${id}/lines`, { method: "PATCH", body: corrections }),
  remove: (id: string) => api<void>(`/cv/v1/generations/${id}`, { method: "DELETE" }),
  /** Assistants d'un CV généré (ADR 0028, rôles 2, 3, 4, 6 et 8). */
  assistants: (id: string) => api<AssistantResults>(`/cv/v1/generations/${id}/assistants`),
  judge: (id: string) =>
    api<FidelityJudgement & { revision: number }>(`/cv/v1/generations/${id}/judge`, { method: "POST" }),
  interview: (id: string, level: "rh" | "manager" | "technique") =>
    api<InterviewPrep>(`/cv/v1/generations/${id}/interview`, { method: "POST", body: { level } }),
  learningOverview: () => api<LearningOverview>("/cv/v1/learning-plan", { method: "POST" }),
  editTranslation: (id: string, lang: "en" | "de", lines: { path: string; text: string }[]) =>
    api<CvTranslation>(`/cv/v1/generations/${id}/translation/${lang}`, { method: "PUT", body: { lines } }),
  atsApply: (id: string, term: string, entry?: string) =>
    api<AtsProposal>(`/cv/v1/generations/${id}/ats/apply`, { method: "POST", body: { term, entry } }),
  atsOverview: () => api<AtsOverview>("/cv/v1/ats/overview"),
  interviewFeedback: (id: string, body: { question: string; answer: string }) =>
    api<InterviewFeedback>(`/cv/v1/generations/${id}/interview/feedback`, { method: "POST", body }),
  learningPlan: (id: string) =>
    api<LearningPlan>(`/cv/v1/generations/${id}/learning-plan`, { method: "POST" }),
  translate: (id: string, lang: "en" | "de") =>
    api<CvTranslation>(`/cv/v1/generations/${id}/translate`, { method: "POST", body: { lang } }),
  ats: (id: string) => api<AtsAdvice>(`/cv/v1/generations/${id}/ats`, { method: "POST" }),
  adminStats: () => api<ServiceStats>("/cv/v1/admin/stats"),
};

export const letters = {
  list: () =>
    api<Pick<Letter, "id" | "generationId" | "offerTitle" | "company" | "createdAt" | "updatedAt">[]>(
      "/letters/v1/letters",
    ),
  get: (id: string) => api<Letter>(`/letters/v1/letters/${id}`),
  create: (generationId: string, tone: Letter["tone"]) =>
    api<Letter>("/letters/v1/letters", { method: "POST", body: { generationId, tone } }),
  update: (id: string, body: { greeting: string; closing: string; paragraphs: { text: string }[] }) =>
    api<Letter>(`/letters/v1/letters/${id}`, { method: "PUT", body }),
  remove: (id: string) => api<void>(`/letters/v1/letters/${id}`, { method: "DELETE" }),
  /** Suivi des candidatures (ADR 0040), sans IA. */
  trackings: () => api<ApplicationTracking[]>("/letters/v1/applications/tracking"),
  track: (
    generationId: string,
    body: { status: ApplicationTracking["status"]; sentAt: string | null; note: string | null },
  ) => api<ApplicationTracking>(`/letters/v1/applications/tracking/${generationId}`, { method: "PUT", body }),
  translateLetter: (id: string, lang: "en" | "de") =>
    api<LetterTranslation>(`/letters/v1/letters/${id}/translate`, { method: "POST", body: { lang } }),
  pdf: (id: string) => download(`/letters/v1/letters/${id}/pdf`, { method: "POST" }, "lettre.pdf"),
  exportCv: (body: {
    generationId?: string;
    variant: CvVariant;
    evidenceIds?: string[];
    lang?: "fr" | "en" | "de";
    norms?: CvNorms;
  }) => download("/letters/v1/exports/cv", { method: "POST", body, accept: "application/pdf" }, "cv.pdf"),
  /** CV en ligne (ADR 0042) : lien secret vers un instantané, révocable. */
  shares: () => api<CvShare[]>("/letters/v1/shares"),
  createShare: (body: {
    generationId: string;
    variant: CvVariant;
    norms?: CvNorms;
    lang?: "fr" | "en" | "de";
    consent: true;
  }) => api<CvShare>("/letters/v1/shares", { method: "POST", body }),
  deleteShare: (id: string) => api<void>(`/letters/v1/shares/${id}`, { method: "DELETE" }),
  /** Lecture publique d'un CV partagé, sans session. */
  publicCv: async (token: string) => {
    const res = await fetch(`/api/letters/v1/public/cv/${encodeURIComponent(token)}`, {
      headers: { Accept: "text/html" },
      credentials: "omit",
    });
    if (!res.ok) throw new Error("introuvable");
    return res.text();
  },
  /** Export Word (ADR 0037) : même contenu que le PDF, retouchable. */
  exportCvDocx: (body: {
    generationId?: string;
    variant: CvVariant;
    lang?: "fr" | "en" | "de";
    norms?: CvNorms;
  }) =>
    download(
      "/letters/v1/exports/cv/docx",
      {
        method: "POST",
        body,
        accept: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      "cv.docx",
    ),
  previewCv: async (body: { generationId?: string; variant: CvVariant; norms?: CvNorms }) => {
    const res = await send("/letters/v1/exports/cv/preview", { method: "POST", body, accept: "text/html" });
    return res.text();
  },
  adminStats: () => api<ServiceStats>("/letters/v1/admin/stats"),
};

export const watch = {
  subscription: () => api<Subscription>("/watch/v1/subscriptions/me"),
  save: (input: SubscriptionInput) =>
    api<{ subscription: Subscription; confirmationSent: boolean }>("/watch/v1/subscriptions/me", {
      method: "PUT",
      body: input,
    }),
  stop: () => api<void>("/watch/v1/subscriptions/me", { method: "DELETE" }),
  matches: () => api<WatchMatch[]>("/watch/v1/subscriptions/me/matches"),
  confirm: (token: string) => publicCall(`/watch/v1/subscriptions/confirm/${token}`),
  unsubscribe: (token: string) => publicCall(`/watch/v1/subscriptions/unsubscribe/${token}`),
  adminStats: () => api<ServiceStats>("/watch/v1/admin/stats"),
  runs: () => api<WatchRun[]>("/watch/v1/admin/runs"),
  runNow: () => api<{ message: string }>("/watch/v1/admin/runs", { method: "POST" }),
  reminders: () => api<Reminder[]>("/watch/v1/reminders"),
  addReminder: (input: ReminderInput) =>
    api<Reminder>("/watch/v1/reminders", { method: "POST", body: input }),
  removeReminder: (id: string) => api<void>(`/watch/v1/reminders/${id}`, { method: "DELETE" }),
};

export interface PlatformHealth {
  gateway: string;
  services: {
    service: string;
    status: "ok" | "indisponible" | "injoignable";
    checks: Record<string, string>;
    ms: number;
  }[];
}

export const admin = { health: () => api<PlatformHealth>("/admin/v1/health") };

export type { LlmUsageSummary };

/**
 * Avis 👍 / 👎 sur une réponse d'assistant (ADR 0029) : envoyé au service qui porte l'assistant, anonyme
 * (ni identifiant ni contenu).
 */
const VOTE_SERVICE: Record<string, string> = {
  "entretien-profil": "profiles",
  "faits-reponse": "profiles",
  "traduction-lettre": "letters",
};
export const vote = (role: string, value: 1 | -1, providerKind: "ia" | "demo") =>
  api<void>(`/${VOTE_SERVICE[role] ?? "cv"}/v1/assistants/feedback`, {
    method: "POST",
    body: { role, vote: value, providerKind },
  });
