import { createServiceClient } from "@attesta/http-kit";
import { Generation, LinesCheckResult, StoredProfile, type LinesCheck } from "@attesta/shared-schemas";

/**
 * Services lus pour le compte de l'utilisateur, avec son jeton relayé (ADR 0012, point 3). Seul un CV
 * vérifié est servi par cv-generation (ADR 0018, point 3) : `generation` renvoie `undefined` sinon.
 */
export interface Upstreams {
  generation(token: string, id: string): Promise<Generation | undefined>;
  check(token: string, generationId: string, lines: LinesCheck["lines"]): Promise<LinesCheckResult>;
  profile(token: string): Promise<StoredProfile | undefined>;
}

export function httpUpstreams(
  urls: { cvGeneration: string; profiles: string },
  fetchImpl?: typeof fetch,
): Upstreams {
  // Génération et contrôle passent par le LLM de cv-generation : délai long (ADR 0012, point 5).
  const cv = createServiceClient({
    target: "cv-generation",
    baseUrl: urls.cvGeneration,
    timeoutMs: 15_000,
    fetchImpl,
  });
  const profiles = createServiceClient({ target: "profiles", baseUrl: urls.profiles, fetchImpl });
  return {
    async generation(token, id) {
      const { status, data } = await cv.json<unknown>("GET", `/internal/v1/generations/${id}`, {
        token,
        accept: [200, 404, 409],
      });
      return status === 200 ? Generation.parse(data) : undefined;
    },
    async check(token, generationId, lines) {
      const { data } = await cv.json<unknown>("POST", `/internal/v1/generations/${generationId}/check`, {
        token,
        body: { lines },
      });
      return LinesCheckResult.parse(data);
    },
    async profile(token) {
      const { status, data } = await profiles.json<unknown>("GET", "/internal/v1/profiles/me", {
        token,
        accept: [200, 404],
      });
      return status === 404 ? undefined : StoredProfile.parse(data);
    },
  };
}
