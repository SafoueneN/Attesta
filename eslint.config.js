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
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/reports/**",
      "**/.stryker-tmp/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    // Les gestionnaires d'erreurs Express exigent 4 paramètres, même inutilisés.
    rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
  { files: ["apps/web/public/**/*.js"], languageOptions: { globals: { ...globals.browser } } },
  // Frontend (ADR 0022) : code navigateur ; il n'importe que les contrats partagés, jamais un service.
  {
    files: ["frontend/**/*.{js,ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    rules: noInternalImports(["shared-schemas"]),
  },
  { files: ["packages/schema/src/**", "packages/shared/src/**"], rules: noInternalImports([]) },
  { files: ["packages/render/src/**"], rules: noInternalImports(["schema"]) },
  // Paquets du socle des services (docs/adr/0023) : aucune logique métier, aucun import de service.
  { files: ["packages/logger/src/**", "packages/config/src/**"], rules: noInternalImports([]) },
  { files: ["packages/http-kit/src/**"], rules: noInternalImports(["logger"]) },
  { files: ["packages/shared-schemas/src/**", "packages/llm-client/src/**"], rules: noInternalImports([]) },
  // Un service n'importe que les paquets partagés du socle, jamais un autre service ni le monolithe
  // (règles 1 et 2 de CLAUDE.md) : il parle aux autres par leur API.
  {
    files: ["services/**/*.ts", "gateway/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@attesta/*",
                "!@attesta/logger",
                "!@attesta/config",
                "!@attesta/http-kit",
                "!@attesta/shared-schemas",
                "!@attesta/llm-client",
              ],
              message:
                "Un service n'importe que le socle partagé ; le code du monolithe est extrait, pas importé.",
            },
            {
              group: ["../../*", "../../../*", "../../../../*"],
              message: "Import hors du dossier du service interdit : passer par l'API de l'autre service.",
            },
          ],
        },
      ],
    },
  },
);
