import { createServiceClient, createServiceTokens } from "@attesta/http-kit";
import {
  City,
  IngestionSummary,
  MatchResponse,
  StoredProfile,
  UserContact,
  type GapsReport,
  type MatchRequest,
  type OffersReport,
  type WatchCriteria,
} from "@attesta/shared-schemas";

/**
 * Services appelés par la veille. Tâches système : jeton de service émis par auth, d'audience et de portée
 * minimales (ADR 0014, point 8). Résolution de la ville : jeton de l'utilisateur relayé.
 */
export interface Upstreams {
  contact(userId: string): Promise<UserContact | undefined>;
  profile(userId: string): Promise<StoredProfile | undefined>;
  resolveCity(userToken: string, country: "DE" | "FR", name: string): Promise<City | undefined>;
  ingest(criteria: WatchCriteria[], date: string): Promise<IngestionSummary>;
  match(request: MatchRequest): Promise<MatchResponse>;
  offersReport(view: OffersReport): Promise<Uint8Array>;
  gapsReport(view: GapsReport): Promise<Uint8Array>;
}

export interface UpstreamUrls {
  auth: string;
  profiles: string;
  jobsMatching: string;
  lettersExport: string;
}

export function httpUpstreams(urls: UpstreamUrls, secret: string, fetchImpl?: typeof fetch): Upstreams {
  const auth = createServiceClient({ target: "auth", baseUrl: urls.auth, fetchImpl });
  const profiles = createServiceClient({ target: "profiles", baseUrl: urls.profiles, fetchImpl });
  // Collecte et classement : sources publiques et rerank LLM, délais longs (ADR 0012, point 5).
  const jobs = createServiceClient({
    target: "jobs-matching",
    baseUrl: urls.jobsMatching,
    timeoutMs: 120_000,
    fetchImpl,
  });
  const letters = createServiceClient({
    target: "letters-export",
    baseUrl: urls.lettersExport,
    timeoutMs: 60_000,
    fetchImpl,
  });
  const tokens = createServiceTokens({ client: auth, service: "job-watch", secret });

  const pdf = async (path: string, body: unknown) => {
    const res = await letters.raw("POST", path, {
      token: await tokens("letters-export", "reports:render"),
      body,
      headers: { accept: "application/pdf" },
    });
    return new Uint8Array(await res.arrayBuffer());
  };

  return {
    async contact(userId) {
      const { status, data } = await auth.json<unknown>("GET", `/internal/v1/users/${userId}/contact`, {
        token: await tokens("auth", "users:contact"),
        accept: [200, 404],
      });
      return status === 404 ? undefined : UserContact.parse(data);
    },
    async profile(userId) {
      const { status, data } = await profiles.json<unknown>("GET", `/internal/v1/users/${userId}/profile`, {
        token: await tokens("profiles", "profiles:read"),
        accept: [200, 404],
      });
      return status === 404 ? undefined : StoredProfile.parse(data);
    },
    async resolveCity(userToken, country, name) {
      const query = new URLSearchParams({ country, name });
      const { status, data } = await jobs.json<unknown>("GET", `/internal/v1/cities/resolve?${query}`, {
        token: userToken,
        accept: [200, 404],
      });
      return status === 404 ? undefined : City.parse(data);
    },
    async ingest(criteria, date) {
      const { data } = await jobs.json<unknown>("POST", "/internal/v1/ingestion", {
        token: await tokens("jobs-matching", "matching:run"),
        body: { criteria, date },
        timeoutMs: 600_000,
      });
      return IngestionSummary.parse(data);
    },
    async match(request) {
      const { data } = await jobs.json<unknown>("POST", "/internal/v1/matching", {
        token: await tokens("jobs-matching", "matching:run"),
        body: request,
      });
      return MatchResponse.parse(data);
    },
    offersReport: (view) => pdf("/internal/v1/reports/offers", view),
    gapsReport: (view) => pdf("/internal/v1/reports/gaps", view),
  };
}
