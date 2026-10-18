import type { FieldError } from "./errors.js";

/** Format d'erreur commun à toutes les API (ADR 0017), proche de la RFC 9457. */
export interface Problem {
  /** Identifiant stable : `urn:attesta:erreur:<code>`. */
  type: string;
  /** Message en français, montrable à l'utilisateur. */
  title: string;
  status: number;
  errors?: FieldError[];
  requestId?: string;
}

export function problem(
  code: string,
  status: number,
  title: string,
  errors?: FieldError[],
  requestId?: string,
): Problem {
  const body: Problem = { type: `urn:attesta:erreur:${code}`, title, status };
  if (errors?.length) body.errors = errors;
  if (requestId) body.requestId = requestId;
  return body;
}
