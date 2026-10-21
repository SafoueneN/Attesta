import { createServiceClient, type ServiceClient } from "@attesta/http-kit";
import { StoredOffer, StoredProfile } from "@attesta/shared-schemas";

/**
 * Services lus pour le compte de l'utilisateur, avec son jeton relayé (ADR 0012, point 3) : un aller-retour
 * par dépendance, ressource complète, réponse validée par le contrat partagé.
 */
export interface Upstreams {
  profile(token: string): Promise<StoredProfile | undefined>;
  offer(token: string, id: string): Promise<StoredOffer | undefined>;
}

export function httpUpstreams(
  urls: { profiles: string; jobsMatching: string },
  fetchImpl?: typeof fetch,
): Upstreams {
  const profiles: ServiceClient = createServiceClient({
    target: "profiles",
    baseUrl: urls.profiles,
    fetchImpl,
  });
  const jobs: ServiceClient = createServiceClient({
    target: "jobs-matching",
    baseUrl: urls.jobsMatching,
    fetchImpl,
  });
  return {
    async profile(token) {
      const { status, data } = await profiles.json<unknown>("GET", "/internal/v1/profiles/me", {
        token,
        accept: [200, 404],
      });
      return status === 404 ? undefined : StoredProfile.parse(data);
    },
    async offer(token, id) {
      const { status, data } = await jobs.json<unknown>("GET", `/internal/v1/offers/${id}`, {
        token,
        accept: [200, 404],
      });
      return status === 404 ? undefined : StoredOffer.parse(data);
    },
  };
}
