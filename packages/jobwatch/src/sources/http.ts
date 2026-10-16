/** Appel HTTP d'une source, injectable pour les tests (aucun réseau en CI). */
export type Fetch = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class SourceError extends Error {
  constructor(
    readonly source: string,
    readonly status: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

/** GET JSON avec délai maximal. L'URL n'est jamais journalisée : elle peut porter une clé d'API. */
export async function getJson(
  fetchFn: Fetch,
  source: string,
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 15_000,
): Promise<unknown> {
  let response;
  try {
    response = await fetchFn(url, {
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new SourceError(source, undefined, `requête impossible (${(error as Error).name})`);
  }
  if (!response.ok) throw new SourceError(source, response.status, `réponse ${response.status}`);
  return response.json();
}
