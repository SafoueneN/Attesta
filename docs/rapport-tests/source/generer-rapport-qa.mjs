// Rapport QA Attesta (PDF) : HTML construit ici, imprimé par le Chromium de Playwright du dépôt.
// Usage : node rapport-qa.mjs <racine du dépôt>
import { writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repo = process.argv[2];
const require = createRequire(resolve(repo, "package.json"));
const { chromium } = require("@playwright/test");
const CAP = (f) => pathToFileURL(resolve(repo, "docs/rapport-tests/captures/recette", f)).href;
const PARITE = {
  passed: 14,
  failed: 3,
  note: "2 échecs reproductibles (connexion par lien), 1 intermittent",
  texte:
    "a donné <b>14 réussis et 3 échecs sur 17</b> (68,4 s) contre le monolithe (port 3080). Relancés seuls, deux échecs se reproduisent : la demande de lien de connexion aboutit à la page « Une erreur est survenue » (A-01). Le troisième (« les erreurs sont annoncées… », dépassement de délai de <code>page.goto</code>) passe à la relance (A-10). La règle du projet exige une parité verte : elle ne l'est pas sur cette pile.",
  bilan: "14/17 ; 2 échecs reproductibles, 1 intermittent",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const c = (s) => `<code>${esc(s)}</code>`;
const ok = (t) => `<span class="ok">✓</span> ${t}`;
const ko = (t) => `<span class="ko">✗</span> ${t}`;
const table = (head, rows, cls = "") =>
  `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
const pct = (n) => `${String(n).replace(".", ",")} %`;

// ---------- Données mesurées le 26/10/2026 ----------
const SERVICES = [
  // nom, fichiers, tests, durée (s), instr., branches, fonctions, lignes
  ["auth", 6, 86, 28.0, 90.67, 80.66, 92.12, 92.3],
  ["job-watch", 7, 50, 10.4, 84.95, 70.45, 86.23, 87.26],
  ["jobs-matching", 7, 93, 11.3, 71.76, 61.96, 74.07, 73.34],
  ["profiles", 6, 136, 27.5, 65.56, 57.65, 58.72, 67],
  ["cv-generation", 8, 199, 22.6, 55.53, 48.04, 51.67, 56.19],
  ["letters-export", 9, 50, 57.6, 51.69, 35.94, 51.95, 53.86],
];
const MUTATION = [
  ["PARAMS (constante)", 1, 0, 0, 1],
  ["derive", 8, 0, 0, 8],
  ["hashPassword", 6, 0, 0, 6],
  ["decoyHash", 3, 0, 0, 3],
  ["verifyPassword", 28, 1, 0, 29],
  ["validParams", 36, 2, 3, 41],
];
const E2E = [
  ["US01", "créer un compte sans e-mail, 8 codes de récupération", 7.2],
  ["US02", "connexion ; mauvais mot de passe refusé sans révéler le compte", 4.9],
  ["US03", "import d'un CV PDF, profil pré-rempli sans IA", 11.4],
  ["US04", "catalogue d'offres des quatre pays, filtre par pays", 6.6],
  ["US05", "CV ciblé, chaque ligne contrôlée contre le profil", 6.6],
  ["US06", "export PDF et Word selon le modèle et le pays", 5.1],
  ["US07", "lien de partage secret et révocable", 6.6],
  ["US08", "lettre de motivation sourcée dans le CV", 5.2],
  ["US09", "veille emploi et consentement", 9.8],
  ["US10", "suivi des candidatures par étape", 2.3],
  ["US11", "juge de fidélité du Studio IA", 4.1],
  ["US12", "administration réservée, sans donnée personnelle", 5.2],
  ["US13", "suppression du compte et des données (RGPD)", 3.9],
];

// ---------- Graphiques SVG ----------
function barsCouverture() {
  const W = 760,
    rowH = 46,
    top = 34,
    left = 120,
    w = 260,
    gap = 330;
  const rows = SERVICES.map((s) => ({ n: s[0], l: s[7], b: s[5] }));
  const H = top + rows.length * rowH + 30;
  let g = "";
  for (const [k, title, key] of [
    [0, "Lignes", "l"],
    [1, "Branches", "b"],
  ]) {
    const x0 = left + k * gap;
    g += `<text x="${x0}" y="16" class="t">${title}</text>`;
    for (const t of [0, 20, 40, 60, 80, 100]) {
      const x = x0 + (w * t) / 100;
      g += `<line x1="${x}" y1="${top - 8}" x2="${x}" y2="${H - 26}" class="grid"/><text x="${x}" y="${H - 10}" class="ax">${t} %</text>`;
    }
    const x80 = x0 + w * 0.8;
    g += `<line x1="${x80}" y1="${top - 12}" x2="${x80}" y2="${H - 26}" class="seuil"/>`;
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const v = r[key];
      const col = v >= 80 ? "#2f7bd8" : "#d9822b";
      if (k === 0) g += `<text x="${left - 10}" y="${y + 16}" class="lab">${r.n}</text>`;
      g += `<rect x="${x0}" y="${y + 4}" width="${(w * v) / 100}" height="18" rx="2" fill="${col}"/>`;
      g += `<text x="${x0 + (w * v) / 100 + 5}" y="${y + 17}" class="val">${pct(v)}</text>`;
    });
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`;
}

function barsMutation() {
  const W = 760,
    rowH = 34,
    top = 10,
    left = 190,
    w = 430;
  const H = top + MUTATION.length * rowH + 30;
  let g = "";
  for (const t of [0, 20, 40, 60, 80, 100]) {
    const x = left + (w * t) / 100;
    g += `<line x1="${x}" y1="${top}" x2="${x}" y2="${H - 26}" class="grid"/><text x="${x}" y="${H - 10}" class="ax">${t} %</text>`;
  }
  g += `<line x1="${left + w * 0.8}" y1="${top - 4}" x2="${left + w * 0.8}" y2="${H - 26}" class="seuil"/>`;
  MUTATION.forEach(([n, k, s, to, tot], i) => {
    const y = top + i * rowH;
    const kw = (w * k) / tot,
      sw = (w * s) / tot,
      tw = (w * to) / tot;
    g += `<text x="${left - 10}" y="${y + 17}" class="lab">${n}</text>`;
    g += `<rect x="${left}" y="${y + 5}" width="${kw}" height="18" fill="#2f7bd8"/>`;
    if (s) g += `<rect x="${left + kw}" y="${y + 5}" width="${sw}" height="18" fill="#d9822b"/>`;
    if (to) g += `<rect x="${left + kw + sw}" y="${y + 5}" width="${tw}" height="18" fill="#b9b4ad"/>`;
    g += `<text x="${left + w + 10}" y="${y + 18}" class="val">${k}/${tot} · ${pct(((100 * k) / tot).toFixed(1))}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>
  <div class="legend"><span><i style="background:#2f7bd8"></i>tués</span><span><i style="background:#d9822b"></i>survivants</span><span><i style="background:#b9b4ad"></i>expirations</span><span><i class="dash"></i>seuil haut Stryker (80 %)</span></div>`;
}

// ---------- Cas de test (boîte noire) ----------
const CT = [
  [
    "CT-01",
    "US01",
    "erreur",
    "Créer un compte → valider le formulaire vide",
    "Résumé d'erreurs accessible, dont « Acceptez la politique de confidentialité »",
    ok(`(${c("US01")}, E2E)`),
  ],
  [
    "CT-02",
    "US01",
    "nominal",
    "Créer un compte : identifiant, mot de passe ×2, politique acceptée",
    "« Votre compte est créé », 8 codes de récupération, « Continuer » inactif tant que les codes ne sont pas confirmés",
    ok(`(${c("US01")}, E2E + axe-core)`),
  ],
  [
    "CT-03",
    "US02",
    "erreur",
    "Connexion de amina.diallo avec un mauvais mot de passe",
    "« Identifiant ou mot de passe incorrect. » (même message que pour un compte inconnu)",
    ok(`(${c("US02")}, E2E)`),
  ],
  [
    "CT-04",
    "US02",
    "nominal",
    "Connexion avec le bon mot de passe",
    "Page « Mon compte »",
    ok(`(${c("US02")}, E2E + axe-core)`),
  ],
  [
    "CT-05",
    "US03",
    "nominal",
    "Nouveau compte → étape 1 → importer un CV PDF exporté par Attesta",
    "« Profil pré-rempli à partir de votre CV (lecture automatique, sans IA) », champ « Nom et prénom » rempli",
    ok(`(${c("US03")}, E2E)`),
  ],
  [
    "CT-06",
    "US03",
    "erreur",
    "Importer un PDF corrompu, un PDF scanné sans texte, un fichier de plus de 5 Mo",
    "Refus avec message, service toujours disponible",
    ok(`(${c("extraction.test.ts")}, profiles)`),
  ],
  [
    "CT-07",
    "US04",
    "nominal",
    "Catalogue d'offres → filtre « Tunisie »",
    "Offres filtrées, bouton « Cibler cette offre »",
    ok(`(${c("US04")}, E2E + axe-core)`),
  ],
  [
    "CT-08",
    "US05",
    "nominal",
    "Coller une annonce (Scrum, Jira, Kubernetes) → Générer",
    "CV généré, jauge « Fidélité », mots-clés absents du profil signalés, jamais ajoutés",
    ok(`(${c("US05")}, E2E)`),
  ],
  [
    "CT-09",
    "US05",
    "limite",
    "Le modèle propose des lignes sans source dans le profil",
    "Lignes retirées avant affichage, avec leur raison",
    ok(`(${c("faithfulness.test.ts")}, ${c("pipeline.test.ts")})`),
  ],
  [
    "CT-10",
    "US05",
    "erreur",
    "Offre trop courte",
    "Refus avec message en français",
    ok(`(${c("app.test.ts")}, jobs-matching)`),
  ],
  [
    "CT-11",
    "US06",
    "nominal",
    "Modèle « Moderne », pays « Allemagne », relecture cochée → PDF puis Word",
    "Fichiers commençant par %PDF- et PK (docx)",
    ok(`(${c("US06")}, E2E)`),
  ],
  [
    "CT-12",
    "US06",
    "erreur",
    "Rendu PDF qui dépasse le délai ; CV non vérifié",
    "Rendu interrompu, réponse 503 ; export refusé",
    ok(`(${c("render-pdf-ats.test.ts")}, ${c("app.test.ts")}, letters-export)`),
  ],
  [
    "CT-13",
    "US07",
    "nominal",
    "Relecture + consentement → « Créer un lien de partage » → ouvrir le lien dans une autre session",
    "CV visible par le visiteur dans un cadre « CV partagé »",
    ok(`(${c("US07")}, E2E)`),
  ],
  [
    "CT-14",
    "US08",
    "nominal",
    "Depuis un CV → « Rédiger la lettre de motivation »",
    "Page « Lettre pour … », accessible",
    ok(`(${c("US08")}, E2E + axe-core)`),
  ],
  [
    "CT-15",
    "US08",
    "erreur",
    "Demander une lettre pour un CV non vérifié",
    "Refus",
    ok(`(${c("app.test.ts")}, letters-export)`),
  ],
  [
    "CT-16",
    "US09",
    "erreur",
    "Veille → « Mettre à jour » sans cocher le consentement",
    "« Cochez la case pour accepter de recevoir la veille »",
    ok(`(${c("US09")}, E2E)`),
  ],
  [
    "CT-17",
    "US09",
    "nominal",
    "Cocher le consentement → « Mettre à jour »",
    "« Votre veille est active… »",
    ok(`(${c("US09")}, E2E + axe-core)`),
  ],
  [
    "CT-18",
    "US10",
    "nominal",
    "Ouvrir « Mes candidatures »",
    "Liste avec un sélecteur « Étape » par candidature",
    ok(`(${c("US10")}, E2E)`),
  ],
  [
    "CT-19",
    "US11",
    "nominal",
    "Depuis un CV → « Ouvrir le Studio IA »",
    "Juge de fidélité affiché, bouton « Rejuger »",
    ok(`(${c("US11")}, E2E)`),
  ],
  ["CT-20", "US12", "erreur", "Candidat connecté → /admin", "« Accès refusé »", ok(`(${c("US12")}, E2E)`)],
  [
    "CT-21",
    "US12",
    "nominal",
    "Administrateur → /admin",
    "Tableau de bord sans identifiant de candidat",
    ok(`(${c("US12")}, E2E)`),
  ],
  [
    "CT-22",
    "US13",
    "nominal",
    "Mon compte → « Supprimer mon compte » → confirmer",
    "Boîte de confirmation, puis retour à l'état déconnecté",
    ok(`(${c("US13")}, E2E)`),
  ],
  [
    "CT-23",
    "US13",
    "erreur",
    "Export RGPD alors qu'un service ne répond pas",
    "Export incomplet refusé",
    ok(`(${c("app.test.ts")}, auth)`),
  ],
  [
    "CT-24",
    "US01",
    "erreur",
    "Requête modifiant l'état sans en-tête anti-CSRF ; lien de connexion déjà utilisé ; code de récupération inventé",
    "Refus dans les trois cas",
    ok(`(${c("app.test.ts")}, ${c("accounts.test.ts")}, auth)`),
  ],
  [
    "CT-25",
    "US02",
    "nominal",
    "Monolithe (port 3080) : saisir une adresse e-mail → « Recevoir mon lien de connexion »",
    "« Lien envoyé », e-mail reçu dans Mailpit",
    ko(`A-01 : page « Une erreur est survenue » (${c("e2e/parite/compte.spec.ts")}, reproduit 2/2)`),
  ],
];

const CAPTURES = [
  [
    "US01-1-creation-erreurs.png",
    "CT-01 — Formulaire de création vide",
    "Résumé d'erreurs affiché, dont l'acceptation de la politique de confidentialité.",
  ],
  [
    "US01-2-codes-de-recuperation.png",
    "CT-02 — Compte créé, codes de récupération",
    "8 codes affichés ; « Continuer » reste inactif tant que la case n'est pas cochée.",
  ],
  [
    "US02-1-mot-de-passe-incorrect.png",
    "CT-03 — Mauvais mot de passe",
    "Message générique : il ne révèle pas si l'identifiant existe.",
  ],
  ["US02-2-mon-compte.png", "CT-04 — Connexion réussie", "Page « Mon compte » du compte de démonstration."],
  [
    "US03-1-import-pdf-message.png",
    "CT-05 — Import d'un CV PDF",
    "Lecture automatique, sans IA : le profil est pré-rempli et doit être relu.",
  ],
  [
    "US03-2-import-pdf-champs-pre-remplis.png",
    "CT-05 — Champs pré-remplis",
    "« Nom et prénom » et les autres champs repris du PDF.",
  ],
  [
    "US04-1-catalogue-toutes-regions.png",
    "CT-07 — Catalogue, toutes régions",
    "Filtres par pays disponibles.",
  ],
  [
    "US04-2-catalogue-tunisie.png",
    "CT-07 — Catalogue filtré : Tunisie",
    "Offres tunisiennes, chacune avec « Cibler cette offre ».",
  ],
  [
    "US05-1-offre-analysee.png",
    "CT-08 — Offre analysée",
    "Étape 4 sur 4 : l'annonce est analysée avant la génération.",
  ],
  [
    "US05-2-cv-genere-fidelite.png",
    "CT-08 — CV généré, fidélité 100 %",
    "Kubernetes, absent du profil, est signalé mais jamais ajouté au CV.",
  ],
  [
    "US05-3-relecture-ligne-par-ligne.png",
    "CT-08 — Relecture ligne par ligne",
    "Chaque ligne renvoie à sa source dans le profil.",
  ],
  [
    "US06-1-export-modele-pays.png",
    "CT-11 — Export : modèle et pays",
    "Modèle « Moderne », usages allemands, relecture confirmée avant téléchargement.",
  ],
  [
    "US07-1-lien-de-partage.png",
    "CT-13 — Lien de partage créé",
    "Lien secret, révocable, créé après relecture et consentement.",
  ],
  [
    "US07-2-cv-en-ligne-visiteur.png",
    "CT-13 — Vue du visiteur",
    "Le CV partagé, ouvert dans une autre session.",
  ],
  [
    "US08-1-lettre-de-motivation.png",
    "CT-14 — Lettre de motivation",
    "Lettre rédigée à partir des faits du CV.",
  ],
  [
    "US09-1-veille-emploi.png",
    "CT-16 — Veille emploi",
    "Adresse de réception renseignée ; le consentement est redemandé à chaque enregistrement.",
  ],
  [
    "US09-2-veille-mise-a-jour.png",
    "CT-17 — Veille mise à jour",
    "« Votre veille est active » après consentement.",
  ],
  ["US10-1-candidatures.png", "CT-18 — Mes candidatures", "Suivi par étape."],
  [
    "US11-1-studio-juge-de-fidelite.png",
    "CT-19 — Studio IA, juge de fidélité",
    "Jugement affiché ; « Rejuger » disponible.",
  ],
  ["US12-1-acces-refuse-candidat.png", "CT-20 — Administration refusée au candidat", "« Accès refusé »."],
  [
    "US12-2-administration.png",
    "CT-21 — Administration",
    "Santé des six services et compteurs agrégés, sans donnée personnelle.",
  ],
  [
    "US13-1-suppression-confirmation.png",
    "CT-22 — Confirmation de suppression",
    "Case « Je comprends » obligatoire avant la suppression définitive.",
  ],
  ["US13-2-compte-supprime.png", "CT-22 — Compte supprimé", "Retour à l'état déconnecté."],
];

const ANOMALIES = [
  [
    "A-01",
    "Connexion par lien impossible sur le monolithe (parité rouge)",
    `Pile compose, ${c("http://localhost:3080/connexion")} → adresse e-mail → « Recevoir mon lien de connexion » (${c("e2e/parite/compte.spec.ts")}, ${c("complements.spec.ts:129")})`,
    "Message « lien de connexion envoyé », e-mail reçu dans Mailpit",
    "Page « Une erreur est survenue » ; journal du conteneur web : MailError « envoi impossible (EAUTH 535) », une fois ESOCKET. Reproduit 2 fois sur 2",
    "Majeur",
  ],
  [
    "A-02",
    "Échec d'envoi d'e-mail affiché comme une erreur générique",
    "Même scénario que A-01",
    "Message explicite (« envoi impossible, réessayez ») sur la page de connexion",
    "Page d'erreur générique, sans indication sur l'e-mail ni sur la marche à suivre",
    "Mineur",
  ],
  [
    "A-03",
    "Couverture sous le seuil de la CI dans 4 services",
    `${c("npm run test:coverage")} dans cv-generation, letters-export, profiles, jobs-matching`,
    "Lignes ≥ 80 % (seuil de chaque vitest.config.ts)",
    "56,19 % ; 53,86 % ; 67 % ; 73,34 % : la commande sort en erreur, donc le job CI de ces services échouera dès qu'ils seront modifiés",
    "Majeur",
  ],
  [
    "A-04",
    "Export Word presque non testé",
    `Couverture de ${c("letters-export/src/render/docx.ts")}`,
    "Contenu du .docx vérifié",
    "8,1 % des lignes, 0 % des branches ; l'E2E US06 ne vérifie que la signature PK du fichier",
    "Majeur",
  ],
  [
    "A-05",
    "Connecteur d'offres « employeurs » sans aucun test",
    `${c("jobs-matching/src/sources/employers.ts")}`,
    "Chemins principaux couverts",
    "0 % pour des fonctions de complexité 21 (board) et 18 (search)",
    "Majeur",
  ],
  [
    "A-06",
    "Assistants IA peu testés",
    `${c("cv-generation/src/assistants.ts")}, ${c("profiles/src/assistant.ts")}`,
    "Réponses valides, invalides et erreurs du LLM vérifiées",
    "8,01 % et 13,33 % des lignes ; seul le parcours US11 passe par le Studio IA",
    "Majeur",
  ],
  [
    "A-07",
    "Effacement et export RGPD partiellement testés",
    `${c("auth/src/rgpd.ts")}`,
    "Chemins d'effacement et d'export couverts",
    "48,88 % des lignes (91-118 non couvertes) ; la suppression de bout en bout (US13) passe",
    "Majeur",
  ],
  [
    "A-08",
    "Candidatures peu testées côté service",
    `${c("letters-export/src/applications.ts")}`,
    "Transitions d'étape vérifiées",
    "26 % des lignes, 0 % des branches",
    "Mineur",
  ],
  [
    "A-09",
    "Envoi d'e-mails : erreurs SMTP non testées",
    `${c("auth/src/mail.ts")}`,
    "Échec d'envoi traité",
    "57,14 % des lignes, 0 % des branches",
    "Mineur",
  ],
  [
    "A-10",
    "Tests instables (délais)",
    `${c("accounts.test.ts")} › « bloque un identifiant après trop d'échecs » ; ${c("e2e/parite/parcours.spec.ts:45")}`,
    "Résultat identique à chaque exécution",
    "auth : échec 1 fois sur 4 (délai de 5 s), puis 3/3 ; parité « les erreurs sont annoncées… » : délai de page.goto, passe à la relance",
    "Mineur",
  ],
  [
    "A-11",
    "Bornes de validParams mal isolées par les tests",
    `Stryker sur ${c("auth/src/passwords.ts")}`,
    "Mutants des bornes tués",
    "3 survivants et 3 expirations (détail en mission 5)",
    "Mineur",
  ],
  [
    "A-12",
    "Stryker ne s'arrête pas proprement sous Windows",
    `${c("npm run test:mutation")} (auth)`,
    "Fin de commande sans erreur",
    "« taskkill : accès refusé » à l'arrêt des workers ; rapport produit malgré tout",
    "Mineur",
  ],
];

// ---------- Page ----------
const kpi = (big, label) => `<div class="kpi"><b>${big}</b><span>${label}</span></div>`;
const card = (titre, avant, apres, note) =>
  `<div class="card"><small>${titre}</small><div class="ba"><span>${avant}</span> → <b>${apres}</b></div><em>${note}</em></div>`;

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport QA Attesta</title><style>
@page{size:A4;margin:16mm 15mm 18mm}
*{box-sizing:border-box}
body{font-family:"Segoe UI",Arial,sans-serif;font-size:9.6pt;line-height:1.45;color:#1f2633;margin:0}
h1,h2,h3{color:#17365d}
h2{font-size:15pt;margin:20px 0 10px;padding-bottom:5px;border-bottom:3px solid #e6edf6;break-after:avoid}
h3{font-size:11pt;margin:16px 0 6px;break-after:avoid}
p{margin:6px 0}
code{font-family:Consolas,monospace;font-size:8.3pt;background:#eef1f5;padding:0 3px;border-radius:3px}
table{border-collapse:collapse;width:100%;margin:8px 0 12px;font-size:8.6pt}
thead{display:table-header-group}tr{break-inside:avoid}
th{background:#17365d;color:#fff;text-align:left;font-weight:600;padding:6px 7px}
td{border-bottom:1px solid #dde3ea;padding:5px 7px;vertical-align:top}
.ok{color:#1f8a3b;font-weight:700}.ko{color:#c0392b;font-weight:700}
.cover-band{background:#17365d;color:#fff;border-radius:10px;padding:34px 40px 40px;position:relative;overflow:hidden;margin-top:6mm}
.cover-band:after{content:"";position:absolute;right:-60px;top:-60px;width:260px;height:260px;border-radius:50%;background:#24497a}
.cover-band small{letter-spacing:2px;font-size:8.5pt;opacity:.85;position:relative;z-index:1}
.cover-band h1{color:#fff;font-size:34pt;line-height:1.05;margin:22px 0 12px;position:relative;z-index:1}
.cover-band p{font-size:12pt;opacity:.95;position:relative;z-index:1}
.meta{width:100%;margin:22px 0 8px;font-size:9.4pt}.meta td{border:none;padding:4px 8px}.meta td:first-child{color:#5b6573;width:23%}
.kpis{display:flex;gap:10px;margin:18px 0}.kpi{flex:1;border:1px solid #d8dee6;border-radius:8px;background:#f7f8fa;padding:12px}
.kpi b{display:block;font-size:20pt;color:#17365d;line-height:1.1}.kpi span{font-size:8.2pt;color:#4b5563}
.callout{background:#eaf1fb;border-left:4px solid #2f7bd8;border-radius:6px;padding:12px 16px;margin:14px 0}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:10px 0}
.card{border:1px solid #d8dee6;border-radius:8px;padding:10px 12px}.card small{font-size:7.8pt;letter-spacing:1px;color:#5b6573;text-transform:uppercase}
.card .ba{font-size:10pt;margin:4px 0}.card .ba b{font-size:16pt;color:#17365d}.card em{font-style:normal;font-size:8pt;color:#4b5563}
.sev{display:flex;gap:10px;margin:8px 0 14px}.sev div{flex:1;border-radius:8px;padding:12px 14px;font-size:10pt}.sev b{font-size:20pt;margin-right:8px}
.s0{background:#fde9e7;color:#a5281b}.s1{background:#fdf1dc;color:#9a5b00}.s2{background:#eef0f2;color:#4b5563}.s3{background:#e6eefb;color:#17365d}
.badge{display:inline-block;border-radius:10px;padding:1px 8px;font-size:7.8pt;font-weight:600}
.b-Majeur{background:#fdf1dc;color:#9a5b00}.b-Mineur{background:#eef0f2;color:#4b5563}
.chart{width:100%;height:auto;font-family:"Segoe UI",Arial,sans-serif}
.chart .t{font-size:12px;font-weight:700;fill:#17365d}.chart .lab{font-size:11px;text-anchor:end;fill:#1f2633}
.chart .val{font-size:10px;fill:#1f2633}.chart .ax{font-size:9px;text-anchor:middle;fill:#6b7280}
.chart .grid{stroke:#e5e7eb}.chart .seuil{stroke:#17365d;stroke-dasharray:3 3;stroke-width:1.2}
.legend{display:flex;gap:16px;font-size:8pt;color:#4b5563;margin:2px 0 4px}.legend i{display:inline-block;width:10px;height:10px;margin-right:4px;vertical-align:-1px}
.legend i.dash{border-top:2px dashed #17365d;height:0;width:14px;vertical-align:3px}
.fig{font-size:8.2pt;color:#5b6573;margin:4px 0 12px}
.box{background:#f7f8fa;border:1px solid #d8dee6;border-radius:8px;padding:10px 16px;margin:12px 0}
.box ul{margin:4px 0;padding-left:18px}.box li{margin:3px 0}
.shot{break-inside:avoid;margin:10px 0 16px}.shot h4{color:#17365d;font-size:10.5pt;margin:0 0 6px}
.shot img{width:100%;max-height:96mm;object-fit:contain;border:1px solid #cfd6df;border-radius:6px;display:block}
.shot p{text-align:center;font-size:8.6pt;margin:4px 0 0}
pre{background:#151b26;color:#d6dde8;border-radius:8px;padding:10px 14px;font-size:7.9pt;white-space:pre-wrap;line-height:1.5}
.pb{break-before:page}
td:first-child{white-space:nowrap}
table.anom td:nth-child(2){width:17%}table.anom td:nth-child(3){width:22%}table.anom td:nth-child(4){width:17%}table.anom td:nth-child(5){width:26%}
table.ct td:nth-child(4),table.ct td:nth-child(5){width:22%}
</style></head><body>

<div class="cover-band"><small>ÉQUIPE QA · CAMPAGNE DE TESTS · ATTESTA</small>
<h1>Rapport QA<br>Attesta</h1><p>Générateur de CV ciblés et fidèles — six microservices, une gateway et un frontend React</p></div>
<table class="meta">
<tr><td>Application</td><td>Attesta : frontend React, gateway, services ${c("auth")}, ${c("profiles")}, ${c("cv-generation")}, ${c("jobs-matching")}, ${c("letters-export")}, ${c("job-watch")}</td></tr>
<tr><td>Rôle</td><td>Équipe QA : les anomalies sont signalées, pas corrigées ; aucun fichier de production ni de test modifié</td></tr>
<tr><td>Date</td><td>26 octobre 2026</td></tr>
<tr><td>Environnement</td><td>Windows 11, Node 22.18.0, Vitest 5.0.5, Playwright 1.64.1 (Chromium), Docker Compose (11 conteneurs), PostgreSQL 16.10, Stryker 10.1.1, fast-check 4.10.2</td></tr>
<tr><td>Contraintes</td><td>Fournisseur LLM de démonstration ou simulé (aucun appel à un vrai modèle) ; aucune vraie clé ; comptes et données de démonstration uniquement</td></tr>
</table>
<div class="kpis">
${kpi("898/899", "tests exécutés réussis ; 1 échec intermittent (passe 3/3 ensuite)")}
${kpi("13/13", "user stories validées de bout en bout, 3 exécutions identiques")}
${kpi("93,2 %", "score de mutation, auth/passwords.ts (82/88)")}
${kpi("2/6", "services au-dessus du seuil de couverture de 80 %")}
</div>
<div class="callout"><b>En bref.</b> Les 13 parcours utilisateurs fonctionnent de bout en bout sur la pile complète, et la suite racine est verte sous Node 22. En revanche, la <b>parité n'est pas verte (14/17)</b> : sur le monolithe, la connexion par lien échoue, car l'e-mail ne part pas et l'utilisateur voit une page d'erreur générique. Aucune anomalie bloquante. L'autre risque majeur est la <b>couverture insuffisante de quatre services</b> (53,86 % à 73,34 % des lignes, pour un seuil CI de 80 %) : l'export Word, le connecteur d'offres « employeurs » et les assistants IA sont presque non testés, alors que les parcours qui les traversent sont verts.</div>

<h2 class="pb">Synthèse : avant / après la campagne</h2>
<p>« Avant » : état du premier rapport de campagne du 26 octobre au matin (Node 20, pile non sollicitée). « Après » : exécutions de cette campagne.</p>
<div class="cards">
${card("Suite racine (monolithe)", "4 échecs", "0 échec", "247 réussis, 31 ignorés ; les 4 délais Puppeteer disparaissent sous Node 22")}
${card("Recette E2E (user stories)", "0 exécuté", "13/13", "Pile compose, Chromium, 3 exécutions")}
${card("Parité E2E (monolithe)", "non exécutée", PARITE.passed ? `${PARITE.passed}/${PARITE.passed + PARITE.failed}` : "—", PARITE.note ?? "")}
${card("Tests des services", "86 (auth)", "614", "6 services, intégration PostgreSQL comprise")}
${card("Services mesurés en couverture", "1/6", "6/6", "2 au-dessus du seuil de 80 % des lignes")}
${card("Score de mutation (auth)", "93,2 %", "93,2 %", "82/88 ; aucun nouveau test ajouté par la QA")}
</div>
<h3>Anomalies par gravité</h3>
<div class="sev"><div class="s0"><b>0</b>bloquante</div><div class="s1"><b>6</b>majeures</div><div class="s2"><b>6</b>mineures</div><div class="s3"><b>2</b>vérifications impossibles (CI, evals live)</div></div>
${barsCouverture()}
<div class="legend"><span><i style="background:#2f7bd8"></i>≥ 80 %</span><span><i style="background:#d9822b"></i>&lt; 80 %</span><span><i class="dash"></i>seuil CI (80 % des lignes)</span></div>
<p class="fig">Figure 1 — Couverture des lignes et des branches par service (${c("npm run test:coverage")}, V8, tests d'intégration PostgreSQL compris).</p>
<div class="box"><b>À retenir</b><ul>
<li>Tous les parcours sont verts, mais la couverture montre que plusieurs fonctions traversées par ces parcours ne sont presque pas vérifiées au niveau du service.</li>
<li>Les 4 échecs du premier rapport venaient de l'environnement (Node 20 au lieu de la version 22.18.0 du projet), pas du produit.</li>
<li>Un seul défaut visible par l'utilisateur : la connexion par lien du monolithe (A-01), causée par l'envoi d'e-mail et révélée par la parité. Les autres anomalies portent sur la qualité et la stabilité des tests.</li>
</ul></div>

<h2>Score de mutation par fonction</h2>
${barsMutation()}
<p class="fig">Figure 2 — Mutants tués par fonction de ${c("services/auth/src/passwords.ts")} (Stryker 10.1.1, 88 mutants). Les expirations comptent comme non tuées.</p>
<p>Quatre fonctions sur six tuent tous leurs mutants. Les faiblesses se concentrent dans ${c("validParams")}, qui borne les paramètres scrypt lus dans une empreinte stockée : les tests vérifient qu'une empreinte démesurée est refusée, mais pas que chaque borne, prise séparément, fait le travail. La mutation n'a été exécutée que sur ${c("auth")} : les cinq autres services ont une configuration Stryker, mais pas encore de rapport.</p>

<h2>Inventaire de départ</h2>
${table(
  ["Élément", "Présent ?", "Conséquence"],
  [
    [
      `Recette par user story (${c("e2e/frontend/recette.spec.ts")})`,
      "Oui, 13 scénarios, jamais exécutés",
      "Exécutée 3 fois sur la pile compose ; captures produites",
    ],
    [`Parité (${c("e2e/parite")})`, "Oui, 17 scénarios", "Exécutée contre le monolithe (port 3080) : 14/17"],
    [
      "Tests unitaires et d'intégration des 6 services",
      "Oui, 46 fichiers",
      "Exécutés avec couverture et PostgreSQL local",
    ],
    ["Tests de propriétés (fast-check)", "Oui, 6 fichiers", "332 tests réussis (exécution du matin)"],
    ["Tests de mutation (Stryker)", "Configurés dans les 6 services", "Rapport pour auth seulement"],
    [
      "Fournisseur LLM simulé",
      `Oui : ${c("ScriptedProvider")} et fournisseur de démonstration`,
      "Aucun appel à un vrai modèle",
    ],
    [
      "Workflows GitHub Actions",
      `${c("ci.yml")}, ${c("mutation.yml")}`,
      "Présents, jamais observés en exécution",
    ],
    [
      `Évaluation live (${c("evals:live")})`,
      "Script présent",
      "Non exécutable : aucun identifiant Vertex/Claude",
    ],
  ],
)}

<h2>User stories</h2>
${table(
  ["ID", "User story"],
  [
    [
      "US01",
      "En tant que visiteur, je veux créer un compte avec un identifiant et des codes de récupération, sans e-mail obligatoire.",
    ],
    [
      "US02",
      "En tant qu'utilisateur, je veux me connecter ; un mauvais mot de passe est refusé sans révéler si le compte existe.",
    ],
    ["US03", "En tant que candidat, je veux importer mon CV PDF et obtenir un profil pré-rempli à relire."],
    ["US04", "En tant que candidat, je veux parcourir et filtrer par pays le catalogue d'offres."],
    [
      "US05",
      "En tant que candidat, je veux générer un CV ciblé dont chaque ligne est contrôlée contre mon profil.",
    ],
    ["US06", "En tant que candidat, je veux exporter mon CV en PDF et en Word selon le modèle et le pays."],
    ["US07", "En tant que candidat, je veux partager mon CV par un lien secret et révocable."],
    ["US08", "En tant que candidat, je veux une lettre de motivation fondée sur les faits de mon CV."],
    ["US09", "En tant que candidat, je veux régler ma veille emploi et mon consentement."],
    ["US10", "En tant que candidat, je veux suivre mes candidatures par étape."],
    ["US11", "En tant que candidat, je veux faire juger la fidélité de mon CV par l'assistant IA."],
    [
      "US12",
      "En tant qu'administrateur, je veux une administration réservée, sans donnée personnelle visible.",
    ],
    ["US13", "En tant qu'utilisateur, je veux supprimer mon compte et mes données (RGPD)."],
  ],
)}

<h2 class="pb">Annexe 2 — Cas de test (boîte noire)</h2>
<p>« Obtenu » provient de l'exécution réelle des tests automatisés cités (✓ conforme). Les cas E2E pilotent l'interface par libellés et rôles ARIA ; les autres appellent l'API HTTP du service.</p>
${table(["N°", "US", "Type", "Étapes", "Résultat attendu", "Obtenu"], CT, "ct")}
<p><b>Bilan</b> : 25 cas ; 24 conformes ; 1 défaut (CT-25, A-01). 15 cas sont vérifiés dans le navigateur, dont 6 avec un contrôle d'accessibilité axe-core.</p>

<h2 class="pb">Preuves d'exécution : captures d'écran</h2>
<p>Les captures sont produites par la recette elle-même (${c("CAPTURES_DIR")}), sur la pile compose lancée telle quelle : frontend (port 8081), gateway et six services, PostgreSQL, Mailpit. Le CV et la lettre sont produits par le fournisseur LLM de démonstration, qui recopie les faits du profil sans IA. Les adresses e-mail sont masquées à la capture par la recette elle-même : ce sont les rectangles roses visibles en CT-16 et CT-17. Les comptes sont des comptes de démonstration (${c("npm run demo:seed")}). CT-25 n'a pas de capture : la parité n'en produit pas, et rejouer le cas aurait déclenché un nouvel envoi vers le serveur SMTP configuré.</p>
<p>Note d'exécution : le premier rapport du matin comptait 4 échecs Puppeteer (délai de 30 s au lancement de Chromium) dans la suite racine. Relancée sous Node 22.18.0, la version fixée par ${c(".nvmrc")}, la même suite passe sans échec. Ces échecs ne sont pas retenus comme des anomalies du produit.</p>
${table(
  ["N°", "Capture", "Constat"],
  CAPTURES.map(([f, t, d]) => [t.split(" — ")[0], esc(f), d]),
)}
${CAPTURES.map(([f, t, d]) => `<div class="shot"><h4>${t}</h4><img src="${CAP(f)}"><p>Constat : ${d}</p></div>`).join("")}

<h2 class="pb">Mission 2 — Tests fonctionnels automatisés</h2>
<p>${c("e2e/frontend/recette.spec.ts")} (Playwright 1.64.1, Chromium) : 13 scénarios, un par user story, exécutés contre ${c("http://localhost:8081")}. Ils n'utilisent que ce que voit l'utilisateur : libellés, rôles ARIA, messages, fichiers téléchargés.</p>
${table(
  ["Scénario", "Ce qui est vérifié", "Durée", "Résultat"],
  E2E.map(([id, t, d]) => [c(id), t, `${String(d).replace(".", ",")} s`, ok("réussi")]),
)}
<p>Total : 13 réussis en 81,7 s (exécution 1). La suite de parité ${c("e2e/parite")}, qui compare le monolithe à son comportement de référence, ${PARITE.texte ?? "n'a pas été exécutée."}</p>

<h2>Mission 3 — Tests avec LLM et services simulés</h2>
<p>Aucun test ne dépend d'un vrai modèle. Les réponses du LLM viennent de ${c("ScriptedProvider")} (réponses scriptées) ou du fournisseur de démonstration ; les sources d'offres et le SMTP sont remplacés par des réponses enregistrées.</p>
${table(
  ["Cas", "Test(s)", "Résultat"],
  [
    [
      "Réponse valide du LLM",
      `${c("pipeline.test.ts")} › « fonctionne de bout en bout avec le fournisseur de démonstration, sans invention »`,
      ok("réussi"),
    ],
    [
      "Invention du LLM",
      `${c("pipeline.test.ts")} › « retire les inventions avant qu'elles n'atteignent le CV » ; ${c("faithfulness.test.ts")} › « retire chaque invention et explique pourquoi »`,
      ok("réussi"),
    ],
    [
      "Réponse hors contrat d'un autre service",
      `${c("upstreams.test.ts")} › « traduit un 404 en absence, et rejette une réponse hors contrat »`,
      ok("réussi"),
    ],
    [
      "Délai dépassé",
      `${c("extraction.test.ts")} › « interrompt une analyse qui dépasse le délai » ; ${c("render-pdf-ats.test.ts")} › « interrompt un rendu qui dépasse le délai »`,
      ok("réussi"),
    ],
    [
      "Service amont indisponible",
      `${c("app.test.ts")} (auth) › « refuse un export incomplet si un service ne répond pas »`,
      ok("réussi"),
    ],
  ],
)}
<p>Limite : l'évaluation ${c("evals:live")} sur un vrai modèle n'a pas pu être lancée (aucun identifiant). Les conclusions portent sur les contrats et les jeux rejoués, pas sur la qualité du modèle en production.</p>

<h2>Tests unitaires et d'intégration : exécution</h2>
<p>Chaque service est testé dans son dossier, comme en CI (${c("scripts/ci/tester-unite.mjs")}) : ${c("npm run test:coverage")}, avec une base PostgreSQL jetable par suite d'intégration.</p>
${table(
  ["Unité", "Fichiers", "Tests", "Résultat", "Durée"],
  [
    ...SERVICES.map(([n, f, t, d]) => [
      c(n),
      f,
      t,
      n === "auth"
        ? `${ko("85 réussis, 1 échec (délai)")} ; puis ${ok("86/86 ×3")}`
        : ok(`${t}/${t} réussis`),
      `${String(d).replace(".", ",")} s`,
    ]),
    [c("racine (monolithe)"), "22 (+3 ignorés)", "278", ok("247 réussis, 31 ignorés"), "33,6 s"],
    [c("frontend"), 4, 25, ok("25/25 réussis"), "69,9 s"],
    [c("e2e/frontend/recette"), 1, 13, ok("13/13 réussis"), "81,7 s"],
  ],
)}
<p>Total de la première exécution : <b>899 tests, 898 réussis, 1 échec</b> (A-10), sans compter les 31 tests ignorés de la racine (intégration réservée à la CI). Les 31 tests ignorés de la racine n'ont pas été examinés un par un.</p>

<h2>Tests en boîte blanche</h2>
${table(
  ["Technique", "Outil", "Résultat"],
  [
    [
      "Complexité cyclomatique (McCabe)",
      `ESLint, règle ${c("complexity")}`,
      "1 387 fonctions : 1 300 simples (1-5), 66 en 6-10, 18 en 11-20, 3 au-delà de 20",
    ],
    [
      "Couverture des instructions et des branches",
      "Vitest, V8",
      "de 51,69 % à 90,67 % des instructions selon le service",
    ],
    [
      "Croisement complexité × couverture",
      "analyse des rapports",
      "2 fonctions de complexité ≥ 18 sans aucun test (A-05)",
    ],
    ["Tests de mutation", "Stryker 10.1.1", "82/88 mutants tués sur passwords.ts (93,2 %)"],
  ],
)}
<h3>1. Les fonctions les plus complexes et leur couverture</h3>
${table(
  ["Fonction", "Fichier", "V(G)", "Couverture des lignes du fichier", "Risque"],
  [
    [c("checkLine"), c("cv-generation/src/faithfulness.ts"), 31, "100 %", "faible"],
    [c("rulesProfile"), c("profiles/src/import-rules.ts"), 30, "99,15 %", "faible"],
    [
      c("board"),
      c("jobs-matching/src/sources/employers.ts"),
      21,
      '<span class="ko">0 %</span>',
      "<b>élevé</b>",
    ],
    [c("postings"), c("jobs-matching/src/sources/rss.ts"), 20, "100 %", "faible"],
    [c("adzunaPosting"), c("jobs-matching/src/sources/adzuna.ts"), 19, "100 % (branches 63,88 %)", "moyen"],
    [c("baPosting"), c("jobs-matching/src/sources/ba.ts"), 19, "100 %", "faible"],
    [
      c("search"),
      c("jobs-matching/src/sources/employers.ts"),
      18,
      '<span class="ko">0 %</span>',
      "<b>élevé</b>",
    ],
    [
      c("documentXml"),
      c("letters-export/src/render/docx.ts"),
      14,
      '<span class="ko">8,1 %</span>',
      "<b>élevé</b>",
    ],
    ["fonction anonyme", c("job-watch/src/daily.ts"), 13, "78,08 %", "moyen"],
    [c("validParams"), c("auth/src/passwords.ts"), 10, "100 %", "moyen (mutants)"],
  ],
)}
<p>La règle de fidélité du produit, ${c("checkLine")}, est la fonction la plus complexe du code et elle est entièrement couverte. Les risques sont ailleurs : trois fonctions complexes (connecteur « employeurs » et génération du .docx) ne sont exercées par aucun test du service.</p>
<h3>2. Ce que la lecture du code a révélé</h3>
<div class="box"><ul>
<li><b>Borne N de scrypt</b> : le seul test d'empreinte démesurée utilise N = 2<sup>24</sup>. Avec le mutant qui supprime la borne ${c("N <= 2 ** 20")}, ce test passe encore : la dérivation échoue d'elle-même et l'erreur est absorbée par le ${c(".catch")} de ${c("verifyPassword")}. La borne n'est donc pas isolée par un test (A-11).</li>
<li><b>Borne p ≥ 1</b> : même mécanisme, p = 0 n'est jamais testé et scrypt le refuse à la place de ${c("validParams")}.</li>
<li><b>Couverture ≠ vérification</b> : l'E2E US06 télécharge bien un .docx, mais n'en vérifie que les deux premiers octets ; ${c("docx.ts")} reste couvert à 8,1 % (A-04).</li>
</ul></div>

<h2>Mission 4 — Couverture</h2>
<p>Commande : ${c("npm run test:coverage")} dans chaque service (rapport HTML dans ${c("services/<service>/coverage/")}).</p>
${table(
  ["Service", "Instructions", "Branches", "Fonctions", "Lignes", "Seuil CI (80 % lignes)"],
  SERVICES.map(([n, , , , s, b, f, l]) => [
    c(n),
    pct(s),
    pct(b),
    pct(f),
    `<b>${pct(l)}</b>`,
    l >= 80 ? ok("atteint") : ko("non atteint"),
  ]),
)}
<p>Fichiers les moins couverts :</p>
${table(
  ["Fichier", "Lignes", "Branches", "Fonction utilisateur concernée"],
  [
    [c("jobs-matching/src/sources/employers.ts"), "0 %", "0 %", "Offres des sites d'employeurs (US04)"],
    [c("jobs-matching/src/sources/jooble.ts"), "0 %", "0 %", "Source d'offres Jooble (US04)"],
    [c("jobs-matching/src/catalogue.ts"), "0 %", "0 %", "Catalogue d'offres (US04)"],
    [c("profiles/src/evidence.ts"), "0 %", "0 %", "Justificatifs joints au profil"],
    [c("cv-generation/src/assistants.ts"), "8,01 %", "0 %", "Studio IA (US11)"],
    [c("letters-export/src/render/docx.ts"), "8,1 %", "0 %", "Export Word (US06)"],
    [c("jobs-matching/src/explain.ts"), "8,33 %", "0 %", "Explication du classement"],
    [c("profiles/src/assistant.ts"), "13,33 %", "0 %", "Assistant de profil"],
    [c("letters-export/src/applications.ts"), "26 %", "0 %", "Candidatures (US10)"],
    [c("auth/src/rgpd.ts"), "48,88 %", "47,05 %", "Effacement et export RGPD (US13)"],
  ],
)}
<p>Aucun test n'a été ajouté pendant cette campagne : le rôle QA s'est limité à mesurer et à signaler.</p>

<h2>Mission 5 — Tests de mutants</h2>
<p><b>Outil</b> : Stryker 10.1.1, lanceur Vitest, sur ${c("services/auth/src/passwords.ts")} (${c("npm run test:mutation")}). Rapport HTML et JSON conservés dans ${c("docs/rapport-tests/artifacts/")}.</p>
${table(
  ["Fonction", "Mutants", "Tués", "Survivants", "Expirations", "Score"],
  [
    ...MUTATION.map(([n, k, s, t, tot]) => [c(n), tot, k, s, t, pct(((100 * k) / tot).toFixed(1))]),
    ["<b>Total</b>", "<b>88</b>", "<b>82</b>", "<b>3</b>", "<b>3</b>", "<b>93,2 %</b>"],
  ],
)}
<h3>Mutants non tués</h3>
${table(
  ["Ligne", "Code d'origine", "Mutation", "Statut", "Lecture"],
  [
    [
      "33",
      c("N <= 2 ** 20 &&"),
      c("true"),
      "survivant",
      "Aucun test avec N juste au-dessus de 2<sup>20</sup>. Test à ajouter : N = 2<sup>21</sup> refusé.",
    ],
    [
      "39",
      c("p >= 1 &&"),
      c("true"),
      "survivant",
      "p = 0 jamais testé ; scrypt le refuse à la place de validParams.",
    ],
    [
      "49",
      c("actual !== undefined && …"),
      c("true"),
      "survivant",
      "Équivalent en pratique : avec des paramètres valides, la dérivation n'échoue pas.",
    ],
    [
      "33",
      c("N <= 2 ** 20"),
      c("N < 2 ** 20"),
      "expiration",
      "Le test a dépassé le délai de Stryker. À examiner.",
    ],
    ["34", c("(N & (N - 1)) === 0"), c("true"), "expiration", "Idem."],
    ["36", c("r >= 1"), c("true"), "expiration", "Idem."],
  ],
)}

<h2>Bonus</h2>
<div class="box"><ul>
<li><b>Tests de propriétés (fast-check 4.10.2)</b> : 6 fichiers, 332 tests réussis (auth 22, profiles 109, jobs-matching 30, cv-generation 144, letters-export 13, job-watch 14). Ils vérifient notamment qu'aucune ligne non sourcée n'atteint le CV, quelles que soient les entrées générées. Chiffres de l'exécution du 26 octobre au matin.</li>
<li><b>GitHub Actions</b> : ${c("ci.yml")} (lint, types, migrations, tests par unité avec PostgreSQL, secrets, parité, image Docker) et ${c("mutation.yml")} (Stryker sur les 6 services, chaque lundi à 04:00 UTC). Aucune exécution GitHub n'a été observée : état non vérifié.</li>
</ul></div>

<h2 class="pb">Annexe 3 — Rapport d'anomalies</h2>
<p>Gravité : <b>bloquant</b> = plante ou perd des données ; <b>majeur</b> = fonction fausse, non vérifiée sur un chemin utilisateur, ou CI bloquée ; <b>mineur</b> = test, outillage ou chemin secondaire. Pas de correctif ici : seulement le constat.</p>
${table(
  ["N°", "Titre", "Où / comment reproduire", "Attendu", "Obtenu", "Gravité"],
  ANOMALIES.map((a) => [...a.slice(0, 5), `<span class="badge b-${a[5]}">${a[5]}</span>`]),
  "anom",
)}
<p>Vérifications impossibles dans cette campagne : l'exécution GitHub Actions (aucun run observé) et ${c("evals:live")} (aucun identifiant). Seules A-01 et A-02 sont visibles par l'utilisateur ; les autres portent sur les tests et l'outillage.</p>

<h2>Annexe 4 — Bilan des mesures</h2>
${table(
  ["Mesure", "Avant", "Après", "Outil"],
  [
    [
      "Suite racine",
      "234 réussis, 4 échecs, 40 ignorés (Node 20)",
      "247 réussis, 0 échec, 31 ignorés (Node 22.18.0)",
      "Vitest",
    ],
    ["Tests des services", "86 (auth seul)", "614 (6 services)", "Vitest, PostgreSQL 16"],
    ["Tests du frontend", "25/25", "25/25", "Vitest, Testing Library"],
    ["Recette E2E", "non exécutée", "13/13, 3 exécutions identiques", "Playwright, Chromium"],
    ["Parité E2E", "non exécutée", PARITE.bilan ?? "—", "Playwright, Chromium"],
    ["Services mesurés en couverture", "1/6", "6/6 ; 2 au-dessus de 80 % des lignes", "V8"],
    ["Couverture des lignes", "auth 92,30 %", "de 53,86 % (letters-export) à 92,30 % (auth)", "V8"],
    ["Mutants tués (auth)", "82/88 (93,2 %)", "82/88 (93,2 %)", "Stryker"],
    ["Complexité cyclomatique", "non mesurée", "1 387 fonctions, maximum 31", "ESLint"],
    ["Anomalies", "6 actions de suivi", "0 bloquante, 6 majeures, 6 mineures", "Revue + tests"],
  ],
)}

<h2>Le constat le plus important : vert de bout en bout, peu vérifié au milieu</h2>
<p>Les 13 user stories passent, trois fois de suite. Pourtant l'export Word (US06) traverse ${c("docx.ts")}, couvert à 8,1 %, et le test E2E ne regarde que les deux premiers octets du fichier. Le catalogue d'offres (US04) dépend de sources dont l'une, ${c("employers.ts")}, n'a aucun test alors qu'elle contient deux des fonctions les plus complexes du dépôt.</p>
<p>Un parcours vert prouve que l'écran s'affiche et que le fichier se télécharge, pas que son contenu est juste. La couverture par service, puis la mutation, mesurent ce second point : ce sont elles qui doivent guider les prochains tests.</p>

<h2>Stabilité et commandes</h2>
<h3>Commandes pour tout relancer (PowerShell)</h3>
<pre>nvm use 22.18.0                                      # version du projet (.nvmrc)
npm test                                             # suite racine
cd services\\&lt;service&gt; ; npm run test:coverage       # chaque service, PostgreSQL local sur le port 5433
cd services\\auth ; npm run test:mutation             # Stryker
cd frontend ; npx vitest run
docker compose --profile core up -d --build --wait   # pile locale
$env:E2E_BASE_URL="http://localhost:8081"; $env:CAPTURES_DIR="docs/rapport-tests/captures/recette"
npx playwright test e2e/frontend/recette.spec.ts
$env:E2E_BASE_URL="http://localhost:3080"; $env:MAILPIT_URL="http://localhost:8025"
npx playwright test e2e/parite</pre>
<h3>Stabilité</h3>
${table(
  ["Exécution", "Résultat", "Durée"],
  [
    ["Recette E2E 1", "13 réussis, 0 échec", "81,7 s"],
    ["Recette E2E 2", "13 réussis, 0 échec", "83,5 s"],
    ["Recette E2E 3", "13 réussis, 0 échec", "73,7 s"],
    ["auth (couverture) 1", "85 réussis, 1 échec (délai de 5 s)", "28,0 s"],
    ["auth (couverture) 2 à 4", "86 réussis, 0 échec (×3)", "≈ 28 s"],
    ["Parité E2E", "14 réussis, 3 échecs", "68,4 s"],
    ["Parité : 3 tests en échec relancés", "1 réussi, 2 échecs (connexion par lien, A-01)", "23,1 s"],
  ],
)}
<p>La recette donne des résultats identiques à chaque exécution. Les écarts observés sont les deux tests instables (A-10). Les deux échecs de connexion par lien de la parité, eux, se reproduisent (A-01).</p>
<h3>Fichiers ajoutés ou modifiés</h3>
${table(
  ["Fichier", "Statut"],
  [
    [c("docs/rapport-tests/captures/recette/*.png"), "Nouveaux : 23 captures produites par la recette"],
    [c("docs/rapport-qa-attesta.pdf"), "Nouveau : ce rapport"],
    ["Code de production, tests, configuration", "<b>Non modifiés</b>"],
  ],
)}
</body></html>`;

const out = resolve(repo, "docs/rapport-qa-attesta.pdf");
const tmp = resolve(repo, "docs/.rapport-qa-tmp.html");
writeFileSync(tmp, html);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="font-family:Segoe UI,Arial;font-size:7.5px;color:#6b7280;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>Rapport QA — Attesta · campagne du 26 octobre 2026</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  console.log(out);
} finally {
  await browser.close();
  rmSync(tmp);
}
