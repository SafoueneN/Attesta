import { createServiceClient } from "@attesta/http-kit";
import {
  CvTranslation,
  Evidence,
  Generation,
  LinesCheckResult,
  StoredProfile,
  type LinesCheck,
} from "@attesta/shared-schemas";
import { z } from "zod";

/**
 * Services lus pour le compte de l'utilisateur, avec son jeton relayé (ADR 0012, point 3). Seul un CV
 * vérifié est servi par cv-generation (ADR 0018, point 3) : `generation` renvoie `undefined` sinon.
 */
export interface Upstreams {
  generation(token: string, id: string): Promise<Generation | undefined>;
  check(token: string, generationId: string, lines: LinesCheck["lines"]): Promise<LinesCheckResult>;
  /** Traduction conservée d'un CV vérifié (ADR 0029) ; `undefined` si le CV n'a pas été traduit. */
  translation(token: string, id: string, lang: "en" | "de"): Promise<CvTranslation | undefined>;
  profile(token: string): Promise<StoredProfile | undefined>;
  /** Pièces justificatives de l'utilisateur (métadonnées), pour l'annexe du CV (ADR 0027). */
  evidence(token: string): Promise<Evidence[]>;
  /** Fichier d'une pièce de l'utilisateur ; `undefined` si elle n'existe pas (ou plus). */
  evidenceFile(token: string, id: string): Promise<Uint8Array | undefined>;
  /** Photo du CV (ADR 0036) ; absente pour un invité ou sans photo. */
  photo(token: string): Promise<{ mimeType: string; bytes: Uint8Array } | undefined>;
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
    async translation(token, id, lang) {
      const { status, data } = await cv.json<unknown>(
        "GET",
        `/internal/v1/generations/${id}/translation/${lang}`,
        { token, accept: [200, 404] },
      );
      return status === 200 ? CvTranslation.parse(data) : undefined;
    },
    async profile(token) {
      const { status, data } = await profiles.json<unknown>("GET", "/internal/v1/profiles/me", {
        token,
        accept: [200, 404],
      });
      return status === 404 ? undefined : StoredProfile.parse(data);
    },
    async evidence(token) {
      const { data } = await profiles.json<unknown>("GET", "/internal/v1/profiles/me/evidence", { token });
      return z.array(Evidence).parse(data);
    },
    async photo(token) {
      const res = await profiles.raw("GET", "/internal/v1/profiles/me/photo", {
        token,
        accept: [200, 403, 404],
        headers: { accept: "image/jpeg, image/png" },
        timeoutMs: 10_000,
      });
      const mimeType = res.headers.get("content-type") ?? "";
      if (res.status !== 200 || !/^image\/(jpeg|png)$/.test(mimeType)) {
        await res.body?.cancel();
        return undefined;
      }
      return { mimeType, bytes: new Uint8Array(await res.arrayBuffer()) };
    },
    async evidenceFile(token, id) {
      const res = await profiles.raw("GET", `/internal/v1/profiles/me/evidence/${id}/file`, {
        token,
        accept: [200, 404],
        headers: { accept: "application/pdf, image/png, image/jpeg" },
        timeoutMs: 15_000,
      });
      if (res.status === 404) {
        await res.body?.cancel();
        return undefined;
      }
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
