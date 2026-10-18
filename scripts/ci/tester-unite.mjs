// Teste une unité de la matrice CI, de la même façon en local et sur GitHub Actions.
// - unité avec son propre script `test` (services, gateway) : `npm test --workspace <dir>` ;
// - unité du monolithe : Vitest de la racine, limité à ses tests, couverture limitée à son `src/` ;
// - `evals` : évaluation de fidélité en rejeu, sans couverture.
// Prérequis : `npm run build` (les paquets internes sont importés depuis leur dist/).
// Usage : node scripts/ci/tester-unite.mjs packages/schema
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const dir = process.argv[2]?.replace(/\/+$/, "");
if (!dir || !existsSync(dir)) {
  console.error("Usage : node scripts/ci/tester-unite.mjs <dossier de l'unité>");
  process.exit(2);
}

const pkgPath = `${dir}/package.json`;
const ownScript = existsSync(pkgPath) && Boolean(JSON.parse(readFileSync(pkgPath, "utf8")).scripts?.test);

// Le Vitest de la racine ne voit que packages/*, apps/* et evals : un service ou la gateway doit
// déclarer son propre script `test` (avec son seuil de couverture de 80 %).
if (!ownScript && /^(services\/|gateway$)/.test(dir)) {
  console.error(`${dir} : ajoutez un script "test" à son package.json (docs/adr/0021).`);
  process.exit(1);
}

const [command, args] = ownScript
  ? ["npm", ["test", "--workspace", dir]]
  : dir === "evals"
    ? ["npx", ["vitest", "run", "evals/"]]
    : ["npx", ["vitest", "run", `${dir}/`, "--coverage", `--coverage.include=${dir}/src/**`]];

console.log(`> ${command} ${args.join(" ")}`);
const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
