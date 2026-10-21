// Après une modification d'un paquet partagé (packages/logger, config, http-kit) : le recompile, puis le
// recopie dans chaque service qui l'utilise (docs/adr/0025). npm ne recopie pas de lui-même un paquet
// `file:` dont la version n'a pas changé.
// Prérequis : `npm ci` à la racine (pour compiler les paquets).
// Usage : node scripts/sync-packages.mjs                    tous les services et la gateway
//         node scripts/sync-packages.mjs services/profiles  un seul
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const SHARED = ["logger", "config", "http-kit", "shared-schemas", "llm-client"];
const shell = process.platform === "win32";

function run(command, args, cwd) {
  console.log(`> ${command} ${args.join(" ")}${cwd ? `   (${cwd})` : ""}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const consumers = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [...readdirSync("services").map((name) => join("services", name)), "gateway"];

run("npx", ["tsc", "-b", ...SHARED.map((name) => `packages/${name}`)]);

for (const dir of consumers) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const used = Object.keys(pkg.dependencies ?? {}).filter((name) => name.startsWith("@attesta/"));
  if (!used.length) continue;
  rmSync(join(dir, "node_modules", "@attesta"), { recursive: true, force: true });
  run("npm", ["install", "--no-audit", "--no-fund"], dir);
}
console.log("Paquets partagés à jour. Pensez à committer leur dist/ avec les sources.");
