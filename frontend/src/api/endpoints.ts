import type {
  Corrections,
  Generation,
  GenerationSummary,
  ImportResult,
  JobPosting,
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

/** Appels de l'API par service, à travers la gateway (`/api/<service>`). Aucune logique métier ici. */

export const auth = {
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
  postings: (filters: { q?: string; country?: string }) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
    return api<JobPosting[]>(`/jobs/v1/postings?${query}`);
  },
  cities: (country: string, q: string) =>
    api<City[]>(`/jobs/v1/cities?${new URLSearchParams({ country, q })}`),
  adminStats: () => api<ServiceStats>("/jobs/v1/admin/stats"),
};

export const cv = {
  generations: () => api<GenerationSummary[]>("/cv/v1/generations"),
  generation: (id: string) => api<Generation>(`/cv/v1/generations/${id}`),
  correct: (id: string, corrections: Corrections) =>
    api<Generation>(`/cv/v1/generations/${id}/lines`, { method: "PATCH", body: corrections }),
  remove: (id: string) => api<void>(`/cv/v1/generations/${id}`, { method: "DELETE" }),
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
  pdf: (id: string) => download(`/letters/v1/letters/${id}/pdf`, { method: "POST" }, "lettre.pdf"),
  exportCv: (body: { generationId?: string; variant: "ats" | "design" }) =>
    download("/letters/v1/exports/cv", { method: "POST", body, accept: "application/pdf" }, "cv.pdf"),
  previewCv: async (body: { generationId?: string; variant: "ats" | "design" }) => {
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
