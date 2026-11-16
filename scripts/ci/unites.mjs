// Unités testées séparément en CI, une entrée de matrice chacune (docs/adr/0021) : paquets partagés,
// services, gateway et frontend. L'évaluation de fidélité fait partie des tests de cv-generation. Un service entre dans la matrice dès
// qu'il a un package.json. Sortie : JSON sur une ligne, pour `fromJSON` dans GitHub Actions.
//
// Avec `--depuis <ref>` (PR), seules les unités touchées sont retenues (matrice par chemins) :
// - un fichier dans le dossier d'une unité retient cette unité ;
// - un paquet modifié retient aussi ses consommateurs possibles : services, gateway, frontend ;
// - un fichier hors de toute unité (configuration racine, CI, compose) retient toutes les unités.
// Usage : node scripts/ci/unites.mjs [--depuis origin/main]
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

/** Fichiers sans effet sur les tests : ils ne déclenchent aucune unité. */
const NEUTRAL = [
  /^docs\//,
  /\.md$/,
  /^\.github\/(ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE|CODEOWNERS|labels)/,
  /^TASKS\.md$/,
];

const units = [];

/** Unité retenue si elle a des tests : un script `test` à elle, ou un dossier test/ ou tests/. */
function add(dir) {
  if (!existsSync(`${dir}/package.json`)) return;
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
  const tested = Boolean(pkg.scripts?.test) || existsSync(`${dir}/test`) || existsSync(`${dir}/tests`);
  if (tested) units.push({ name: pkg.name.replace(/^@attesta\//, ""), dir });
}

for (const root of ["packages", "services"]) {
  if (!existsSync(root)) continue;
  for (const name of readdirSync(root).sort()) add(`${root}/${name}`);
}
add("gateway");
add("frontend");

const since = process.argv.indexOf("--depuis");
if (since === -1) {
  console.log(JSON.stringify(units));
} else {
  const ref = process.argv[since + 1];
  const changed = execFileSync("git", ["diff", "--name-only", `${ref}...HEAD`], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((file) => !NEUTRAL.some((pattern) => pattern.test(file)));
  console.log(JSON.stringify(affected(changed)));
}

function affected(files) {
  const owner = (file) => units.find((u) => file.startsWith(`${u.dir}/`));
  const selected = new Set();
  for (const file of files) {
    const unit = owner(file);
    if (!unit) return units; // configuration commune : tout est retesté
    selected.add(unit);
    if (unit.dir.startsWith("packages/")) {
      for (const u of units) if (!u.dir.startsWith("packages/")) selected.add(u);
    }
  }
  return units.filter((u) => selected.has(u));
}
