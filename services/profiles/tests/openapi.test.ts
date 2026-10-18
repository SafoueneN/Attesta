import { readFileSync } from "node:fs";
import { toYaml } from "@attesta/http-kit";
import { describe, expect, it } from "vitest";
import { openApiDocument } from "../src/openapi.js";

describe("openapi.yaml", () => {
  it("est à jour avec les routes (sinon : npm run openapi)", () => {
    const committed = readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    expect(committed).toBe(toYaml(openApiDocument()));
  });

  it("documente au moins /health et /ready", () => {
    expect(Object.keys(openApiDocument().paths)).toEqual(expect.arrayContaining(["/health", "/ready"]));
  });
});
