import { Writable } from "node:stream";
import { createLogger } from "@attesta/logger";

/** Logger de test : chaque ligne JSON est recueillie dans `lines`, rien n'est écrit sur la console. */
export function testLogger() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk, _enc, done) {
      lines.push(JSON.parse(chunk.toString()));
      done();
    },
  });
  return { logger: createLogger({ service: "test", destination }), lines };
}
