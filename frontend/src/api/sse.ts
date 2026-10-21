import { GenerationEvent } from "@attesta/shared-schemas";
import { send } from "./client";

/**
 * Génération lue en flux par `fetch` (ADR 0022, point 4) : `EventSource` ne sait pas envoyer l'en-tête
 * Authorization. Chaque événement « data: {...} » est validé par le contrat partagé.
 */
export async function streamGeneration(
  offerId: string,
  onEvent: (event: GenerationEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await send("/cv/v1/generations", {
    method: "POST",
    body: { offerId },
    accept: "text/event-stream",
    signal,
  });
  if (!res.body) throw new Error("Flux indisponible");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");
      if (!data) continue;
      const parsed = GenerationEvent.safeParse(JSON.parse(data));
      if (parsed.success) onEvent(parsed.data);
    }
  }
}
