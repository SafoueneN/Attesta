#!/usr/bin/env node
// Test de fumée d'un déploiement : santé, en-têtes de sécurité, parcours complet
// et export d'un vrai PDF (vérifie Chromium et sa sandbox). Aucun appel au
// modèle d'IA, aucune donnée réelle ; la session de test est effacée à la fin.
//
//   node scripts/smoke.mjs https://candidat---attesta-preprod-xxxx.run.app

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "").replace(/\/$/, "");
if (!base) {
  console.error("Usage : node scripts/smoke.mjs <url>");
  process.exit(2);
}

let cookie = "";
let csrf = "";

async function call(method, path, form) {
  const res = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams({ _csrf: csrf, ...form }).toString() : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const session = res.headers.getSetCookie().find((c) => c.startsWith("attesta.sid="));
  if (session) cookie = session.split(";")[0];
  return res;
}

async function page(path) {
  const res = await call("GET", path);
  const html = await res.text();
  csrf = /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? csrf;
  return { res, html };
}

const checks = [
  [
    "santé",
    async () => {
      const res = await call("GET", "/health");
      const body = await res.json();
      return res.status === 200 && body.status === "ok";
    },
  ],
  [
    "accueil et CSP stricte",
    async () => {
      const { res } = await page("/");
      const csp = res.headers.get("content-security-policy") ?? "";
      return res.status === 200 && csp.includes("script-src 'self'") && csp.includes("object-src 'none'");
    },
  ],
  [
    "étape 1",
    async () => {
      await page("/cv/etape/1");
      const res = await call("POST", "/cv/etape/1", { "basics[name]": "Test de fumée", action: "next" });
      return res.status === 303 && res.headers.get("location") === "/cv/etape/2";
    },
  ],
  [
    "étape 2",
    async () => {
      await page("/cv/etape/2");
      const res = await call("POST", "/cv/etape/2", {
        "work[0][position]": "Développeur",
        "work[0][name]": "Entreprise fictive",
        "work[0][startDate]": "2020-01",
        "work[0][highlights]": "Réalisation fictive pour le test de fumée",
        action: "next",
      });
      return res.status === 303 && res.headers.get("location") === "/cv/etape/3";
    },
  ],
  [
    "étape 3",
    async () => {
      await page("/cv/etape/3");
      const res = await call("POST", "/cv/etape/3", {
        "offer[rawText]":
          "Offre fictive utilisée par le test de fumée du déploiement, sans aucune donnée réelle.",
        action: "next",
      });
      return res.status === 303 && res.headers.get("location") === "/cv/etape/4";
    },
  ],
  [
    "export PDF (Chromium)",
    async () => {
      await page("/cv/etape/5");
      const res = await call("POST", "/cv/etape/5", { variant: "ats", reviewed: "yes", action: "export" });
      const bytes = new Uint8Array(await res.arrayBuffer());
      return (
        res.status === 200 &&
        res.headers.get("content-type") === "application/pdf" &&
        new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-"
      );
    },
  ],
  [
    "effacement de la session de test",
    async () => {
      const res = await call("POST", "/cv/effacer", {});
      return res.status === 303;
    },
  ],
];

for (const [name, check] of checks) {
  let ok = false;
  try {
    ok = await check();
  } catch (error) {
    console.error(`✗ ${name} : ${error.message}`);
  }
  if (!ok) {
    console.error(`✗ ${name} : échec`);
    process.exit(1);
  }
  console.log(`✓ ${name}`);
}
console.log(`Test de fumée réussi sur ${base}`);
