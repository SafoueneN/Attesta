// Régénère openapi.yaml depuis les schémas Zod des routes : npm run openapi.
// Le test tests/openapi.test.ts échoue si le fichier commité n'est plus à jour.
import { writeFileSync } from "node:fs";
import { toYaml } from "@attesta/http-kit";
import { openApiDocument } from "../src/openapi.js";

writeFileSync(new URL("../openapi.yaml", import.meta.url), toYaml(openApiDocument()));
console.log("openapi.yaml régénéré");
