#!/usr/bin/env node
// Test de fumée de la pile (frontend nginx, gateway, services) : santé, en-têtes de sécurité, application
// servie, session invitée émise par auth et vérifiée par un service (JWKS), puis fermeture de la session.
// Aucun appel au modèle d'IA, aucune donnée réelle.
//
//   node scripts/smoke.mjs http://localhost:8080

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "").replace(/\/$/, "");
if (!base) {
  console.error("Usage : node scripts/smoke.mjs <url>");
  process.exit(2);
}

const CSRF = { "x-attesta-csrf": "1" };
let cookie = "";
let token = "";

async function call(method, path, headers = {}) {
  const res = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...headers },
    signal: AbortSignal.timeout(30_000),
  });
  const set = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  if (set.length) cookie = set.join("; ");
  return res;
}

const checks = [
  ["santé du frontend", async () => (await call("GET", "/health")).status === 200],
  [
    "accueil et CSP stricte",
    async () => {
      const res = await call("GET", "/");
      const csp = res.headers.get("content-security-policy") ?? "";
      return (
        res.status === 200 &&
        csp.includes("script-src 'self'") &&
        csp.includes("object-src 'none'") &&
        csp.includes("frame-ancestors 'none'")
      );
    },
  ],
  [
    "route de l'application (mentions légales)",
    async () => {
      const res = await call("GET", "/mentions-legales");
      return res.status === 200 && (await res.text()).includes('<div id="root"');
    },
  ],
  [
    "session invitée (auth, par la gateway)",
    async () => {
      const res = await call("POST", "/api/auth/v1/session/guest", CSRF);
      token = (await res.json()).accessToken ?? "";
      return res.status === 200 && token.split(".").length === 3;
    },
  ],
  [
    "jeton accepté par un service (profiles)",
    async () => {
      const res = await call("GET", "/api/profiles/v1/profiles/me", { authorization: `Bearer ${token}` });
      // Invité neuf : aucun profil encore, mais l'accès est autorisé.
      return res.status === 200 || res.status === 404;
    },
  ],
  [
    "route protégée sans jeton refusée",
    async () => (await call("GET", "/api/profiles/v1/profiles/me")).status === 401,
  ],
  [
    "fermeture de la session",
    async () => (await call("DELETE", "/api/auth/v1/session", CSRF)).status === 204,
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
