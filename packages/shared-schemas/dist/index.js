import { z } from "zod";
import { FaithfulnessReport, TailoredCv } from "./cv.js";
import { JobOfferInput, OfferAnalysis } from "./offer.js";
import { Profile } from "./profile.js";
export * from "./common.js";
export * from "./cv.js";
export * from "./offer.js";
export * from "./pointer.js";
export * from "./profile.js";
export * from "./api/auth.js";
export * from "./api/common.js";
export * from "./api/cv.js";
export * from "./api/letters.js";
export * from "./api/profiles.js";
export const SCHEMA_VERSION = "1.0.0";
/** Export JSON Schema du contrat, utilisé pour les sorties structurées du LLM. */
export function toJsonSchemas() {
    const schemas = { Profile, JobOfferInput, OfferAnalysis, TailoredCv, FaithfulnessReport };
    return Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: "input" })]));
}
