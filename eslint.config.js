import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Frontières entre paquets (ADR 0001) : schema et shared ne dépendent de rien d'interne. */
const noInternalImports = (allowed) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: ["@attesta/*", ...allowed.map((name) => `!@attesta/${name}`)],
          message: "Import interdit par les frontières de paquets (docs/adr/0001).",
        },
      ],
    },
  ],
});

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "coverage/**", "playwright-report/**", "test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    // Les gestionnaires d'erreurs Express exigent 4 paramètres, même inutilisés.
    rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
  { files: ["apps/web/public/**/*.js"], languageOptions: { globals: { ...globals.browser } } },
  { files: ["packages/schema/src/**", "packages/shared/src/**"], rules: noInternalImports([]) },
  { files: ["packages/render/src/**"], rules: noInternalImports(["schema"]) },
);
