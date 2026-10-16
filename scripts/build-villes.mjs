// Construit packages/jobwatch/data/villes.json à partir de l'export GeoNames
// « cities15000 » (https://download.geonames.org/export/dump/, CC BY 4.0) :
// villes de plus de 15 000 habitants en Allemagne et en France.
// Usage : node scripts/build-villes.mjs <chemin de cities15000.txt>
import { readFileSync, writeFileSync } from "node:fs";

const [source] = process.argv.slice(2);
if (!source) throw new Error("Usage : node scripts/build-villes.mjs <cities15000.txt>");

const latin = /^[\p{Script=Latin}][\p{Script=Latin}' -]*$/u;
const villes = readFileSync(source, "utf8")
  .split("\n")
  .map((line) => line.split("\t"))
  .filter((f) => f[8] === "DE" || f[8] === "FR")
  .map((f) => {
    const population = Number(f[14]);
    // Exonymes (Munich, Cologne…) seulement pour les grandes villes : taille du fichier.
    const alias =
      population >= 100_000
        ? [
            ...new Set(
              f[3].split(",").filter((n) => latin.test(n) && n.length >= 4 && n.length <= 30 && n !== f[1]),
            ),
          ]
        : [];
    return { nom: f[1], pays: f[8], lat: Number(f[4]), lon: Number(f[5]), population, alias };
  })
  .sort((a, b) => b.population - a.population);

writeFileSync(
  new URL("../packages/jobwatch/data/villes.json", import.meta.url),
  JSON.stringify(villes) + "\n",
);
console.log(`${villes.length} villes`);
