// Convertit docs/rapport-campagne-tests.md en PDF via Chromium (Playwright du dépôt).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const repo = process.argv[2];
const src = resolve(repo, "docs/rapport-campagne-tests.md");
const out = resolve(repo, "docs/rapport-campagne-tests.pdf");
const require = createRequire(resolve(repo, "package.json"));
const { chromium } = require("@playwright/test");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const docDir = dirname(src);
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(esc(c)) - 1}\u0000`);
  s = esc(s);
  s = s.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_, a, u) => `<img alt="${a}" src="${pathToFileURL(resolve(docDir, u)).href}">`,
  );
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t) => `<span class="lien">${t}</span>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*]+)\*/g, "$1<em>$2</em>");
  // Caractère NUL : marqueur des blocs de code mis de côté avant l'échappement, jamais présent dans le texte.
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
const cells = (l) =>
  l
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

const lines = readFileSync(src, "utf8").split(/\r?\n/);
let html = "";
for (let i = 0; i < lines.length;) {
  const l = lines[i];
  if (!l.trim()) {
    i++;
    continue;
  }
  const h = l.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
    i++;
    continue;
  }
  if (l.startsWith("|")) {
    const rows = [];
    while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
    const align = cells(rows[1]).map((c) => (c.endsWith(":") ? "right" : "left"));
    html +=
      "<table><thead><tr>" +
      cells(rows[0])
        .map((c, k) => `<th style="text-align:${align[k]}">${inline(c)}</th>`)
        .join("") +
      "</tr></thead><tbody>";
    for (const r of rows.slice(2))
      html +=
        "<tr>" +
        cells(r)
          .map((c, k) => `<td style="text-align:${align[k]}">${inline(c)}</td>`)
          .join("") +
        "</tr>";
    html += "</tbody></table>";
    continue;
  }
  if (/^\s*(-|\d+\.)\s/.test(l)) {
    const ordered = /^\s*\d+\./.test(l);
    html += ordered ? "<ol>" : "<ul>";
    while (i < lines.length && /^\s*(-|\d+\.)\s/.test(lines[i]))
      html += `<li>${inline(lines[i++].replace(/^\s*(-|\d+\.)\s+/, ""))}</li>`;
    html += ordered ? "</ol>" : "</ul>";
    continue;
  }
  const para = [];
  while (i < lines.length && lines[i].trim() && !/^(#|\||\s*(-|\d+\.)\s)/.test(lines[i]))
    para.push(lines[i++]);
  const p = inline(para.join(" "));
  html += p.startsWith("<img")
    ? `<figure>${p}</figure>`
    : /^<em>.*<\/em>$/.test(p)
      ? `<p class="legende">${p}</p>`
      : `<p>${p}</p>`;
}

const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport de campagne de tests — Attesta</title><style>
body{font-family:"Segoe UI",Arial,sans-serif;font-size:10pt;line-height:1.45;color:#1d2433}
h1{font-size:20pt;color:#14305c;border-bottom:3px solid #14305c;padding-bottom:6px;margin-top:0}
h2{font-size:13.5pt;color:#14305c;margin-top:22px;border-bottom:1px solid #cdd5e3;padding-bottom:3px;break-after:avoid}
table{border-collapse:collapse;width:100%;margin:8px 0 12px;font-size:8.8pt;break-inside:auto}
tr{break-inside:avoid}th{background:#14305c;color:#fff;font-weight:600}
th,td{border:1px solid #cdd5e3;padding:4px 6px;vertical-align:top}tbody tr:nth-child(even){background:#f3f6fb}
code{font-family:Consolas,monospace;font-size:8.6pt;background:#eef1f6;padding:0 3px;border-radius:3px}
figure{margin:10px 0 2px;text-align:center;break-inside:avoid}img{max-width:100%;max-height:330px;border:1px solid #cdd5e3}
.legende{text-align:center;font-size:8.8pt;color:#555;margin-top:2px}.lien{color:#14305c;text-decoration:underline}
li{margin:2px 0}
</style></head><body>${html}</body></html>`;

const tmp = resolve(docDir, ".rapport-tmp.html");
writeFileSync(tmp, page);
const browser = await chromium.launch();
try {
  const p = await browser.newPage();
  await p.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
  if (process.env.SHOT) {
    await p.setViewportSize({ width: 680, height: 1000 });
    await p.emulateMedia({ media: "print" });
    await p.screenshot({ path: process.env.SHOT, fullPage: true });
  }
  await p.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="font-size:8px;color:#777;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>Attesta — Rapport de campagne de tests — 26/10/2026</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  console.log(out);
} finally {
  await browser.close();
  (await import("node:fs")).rmSync(tmp);
}
