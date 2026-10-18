// Teste une unité de la matrice CI, de la même façon en local et sur GitHub Actions.
// - service ou gateway (son propre package-lock.json, docs/adr/0023) : `npm ci`, types, puis tests avec
//   couverture, dans le seul dossier de l'unité, sans rien de la racine ;
// - unité du monolithe : Vitest de la racine, limité à ses tests, couverture limitée à son `src/` ;
// - `evals` : évaluation de fidélité en rejeu, sans couverture.
// Prérequis pour le monolithe : `npm ci && npm run build` à la racine.
// Usage : node scripts/ci/tester-unite.mjs packages/schema
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const dir = process.argv[2]?.replace(/\/+$/, "");
if (!dir || !existsSync(dir)) {
  console.error("Usage : node scripts/ci/tester-unite.mjs <dossier de l'unité>");
  process.exit(2);
}

function run(command, args, cwd) {
  console.log(`> ${command} ${args.join(" ")}${cwd ? `   (${cwd})` : ""}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const autonomous = existsSync(`${dir}/package-lock.json`);
if (autonomous) {
  const scripts = JSON.parse(readFileSync(`${dir}/package.json`, "utf8")).scripts ?? {};
  run("npm", ["ci", "--no-audit", "--no-fund"], dir);
  if (scripts.typecheck) run("npm", ["run", "typecheck"], dir);
  run("npm", ["run", scripts["test:coverage"] ? "test:coverage" : "test"], dir);
} else if (/^(services\/|gateway$)/.test(dir)) {
  console.error(`${dir} : un service doit avoir son propre package-lock.json (docs/adr/0023).`);
  process.exit(1);
} else if (dir === "evals") {
  run("npx", ["vitest", "run", "evals/"]);
} else {
  run("npx", ["vitest", "run", `${dir}/`, "--coverage", `--coverage.include=${dir}/src/**`]);
}
