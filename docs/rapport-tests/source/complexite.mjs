// Complexité cyclomatique (règle ESLint `complexity`) des fonctions de services/*/src, avec la config du dépôt.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const repo = process.argv[2];
const require = createRequire(`${repo}/package.json`);
const { ESLint } = require("eslint");
const eslint = new ESLint({ cwd: repo, overrideConfig: { rules: { complexity: ["warn", 0] } } });
const results = await eslint.lintFiles(["services/*/src/**/*.ts"]);
const out = [];
for (const f of results)
  for (const m of f.messages)
    if (m.ruleId === "complexity") {
      const n = Number(m.message.match(/complexity of (\d+)/)[1]);
      const name = m.message.match(/^(.*?) has/)[1];
      out.push({ n, file: f.filePath.replace(/\\/g, "/").replace(/.*\/services\//, ""), line: m.line, name });
    }
out.sort((a, b) => b.n - a.n);
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
const bins = [0, 0, 0, 0];
for (const x of out) bins[x.n <= 5 ? 0 : x.n <= 10 ? 1 : x.n <= 20 ? 2 : 3]++;
console.log("fonctions", out.length, "A(1-5)/B(6-10)/C(11-20)/D(>20)", bins.join("/"));
for (const x of out.slice(0, 12)) console.log(x.n, x.file, x.line, x.name);
for (const x of out.filter((x) => x.file.includes("passwords"))) console.log("pw", x.n, x.line, x.name);
