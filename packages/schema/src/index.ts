import { z } from "zod";
import { TailoredCv, FaithfulnessReport } from "./cv.js";
import { JobOfferInput, OfferAnalysis } from "./offer.js";
import { Profile } from "./profile.js";

export * from "./common.js";
export * from "./cv.js";
export * from "./offer.js";
export * from "./pointer.js";
export * from "./profile.js";

export const SCHEMA_VERSION = "1.0.0-draft";

/** Export JSON Schema du contrat, utilisé pour les sorties structurées du LLM. */
export function toJsonSchemas() {
  const schemas = { Profile, JobOfferInput, OfferAnalysis, TailoredCv, FaithfulnessReport };
  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: "input" })]),
  );
}
