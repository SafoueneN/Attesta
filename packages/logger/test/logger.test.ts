import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, currentRequestId, runWithContext } from "../src/index.js";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk, _enc, done) {
      lines.push(JSON.parse(chunk.toString()));
      done();
    },
  });
  return { lines, destination };
}

describe("createLogger", () => {
  it("écrit une ligne JSON avec le service, la sévérité et le message", () => {
    const { lines, destination } = capture();
    createLogger({ service: "profiles", destination }).info({ event: "test" }, "bonjour");
    expect(lines[0]).toMatchObject({
      service: "profiles",
      severity: "INFO",
      message: "bonjour",
      event: "test",
    });
  });

  it("masque les données personnelles et les jetons", () => {
    const { lines, destination } = capture();
    createLogger({ service: "auth", destination }).info(
      { user: { email: "lea@example.org", name: "Léa" }, token: "jeton-secret", body: { a: 1 } },
      "événement",
    );
    const text = JSON.stringify(lines);
    expect(text).not.toContain("lea@example.org");
    expect(text).not.toContain("Léa");
    expect(text).not.toContain("jeton-secret");
    expect(text).toContain("[supprimé]");
  });

  it("ajoute le requestId du contexte courant, et seulement dans ce contexte", () => {
    const { lines, destination } = capture();
    const logger = createLogger({ service: "gateway", destination });
    runWithContext({ requestId: "4b1e3c1e-0000-4000-8000-000000000001" }, () => logger.info("dedans"));
    logger.info("dehors");
    expect(lines[0]).toMatchObject({ requestId: "4b1e3c1e-0000-4000-8000-000000000001" });
    expect(lines[1]).not.toHaveProperty("requestId");
  });

  it("respecte le niveau demandé", () => {
    const { lines, destination } = capture();
    createLogger({ service: "x", level: "warn", destination }).info("ignoré");
    expect(lines).toHaveLength(0);
  });
});

describe("currentRequestId", () => {
  it("est indéfini hors contexte", () => {
    expect(currentRequestId()).toBeUndefined();
  });
});
