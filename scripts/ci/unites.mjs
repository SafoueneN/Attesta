// Unités testées séparément en CI, une entrée de matrice chacune (docs/adr/0021) : paquets partagés,
// applications, services, gateway, puis l'évaluation de fidélité. Un service entre dans la matrice dès
// qu'il a un package.json. Sortie : JSON sur une ligne, pour `fromJSON` dans GitHub Actions.
// Usage : node scripts/ci/unites.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";

const units = [];

/** Unité retenue si elle a des tests : un script `test` à elle, ou un dossier test/ ou tests/. */
function add(dir) {
  if (!existsSync(`${dir}/package.json`)) return;
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
  const tested = Boolean(pkg.scripts?.test) || existsSync(`${dir}/test`) || existsSync(`${dir}/tests`);
  if (tested) units.push({ name: pkg.name.replace(/^@attesta\//, ""), dir });
}

for (const root of ["packages", "apps", "services"]) {
  if (!existsSync(root)) continue;
  for (const name of readdirSync(root).sort()) add(`${root}/${name}`);
}
add("gateway");
units.push({ name: "evals", dir: "evals" });

console.log(JSON.stringify(units));
