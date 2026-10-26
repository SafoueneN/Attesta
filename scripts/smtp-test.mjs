#!/usr/bin/env node
// Vérifie l'envoi d'e-mails de la pile locale, depuis le conteneur job-watch (celui qui envoie la veille) :
// connexion et identifiants SMTP, puis, si une adresse est donnée, un e-mail de test. N'affiche jamais
// l'identifiant ni le mot de passe : seulement le serveur et la réponse (adresses masquées).
//
//   npm run smtp:test                       vérifie la connexion
//   npm run smtp:test -- moi@example.org    envoie aussi un e-mail de test

import { spawnSync } from "node:child_process";

const to = process.argv[2];
if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error(`Adresse invalide : ${to}`);
  process.exit(2);
}

const check = `
const nm = require("nodemailer");
const url = process.env.SMTP_URL ?? "";
const server = url.replace(/^([a-z]+:\\/\\/)[^@]*@/, "$1").replace(/\\?.*$/, "");
const mask = (t) => String(t ?? "").replace(/[\\w.+-]+@[\\w.-]+/g, "<adresse>").slice(0, 300);
console.log("Serveur : " + server + (url.includes("mailpit") ? "  (Mailpit : boîte locale, aucun e-mail ne sort)" : ""));
const t = nm.createTransport(url);
t.verify()
  .then(() => {
    console.log("OK : connexion et identifiants acceptés.");
    const to = process.env.TEST_TO;
    if (!to) return;
    return t
      .sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject: "Attesta : e-mail de test",
        text: "Cet e-mail confirme que la veille d'Attesta peut vous écrire. Aucune action n'est nécessaire.",
      })
      .then((r) => console.log("OK : e-mail de test accepté par le serveur (" + r.response.slice(0, 60) + ")."));
  })
  .catch((e) => {
    console.log("ÉCHEC : " + (e.code ?? "") + " " + (e.responseCode ?? ""));
    console.log(mask(e.response ?? e.message));
    if (e.responseCode === 535)
      console.log("→ Identifiant ou mot de passe refusé. Gmail : utilisez un mot de passe d'application (docs/runbook.md).");
    process.exitCode = 1;
  });
`;

const result = spawnSync(
  "docker",
  [
    "compose",
    "--profile",
    "full",
    "exec",
    "-T",
    "-e",
    `TEST_TO=${to ?? ""}`,
    "job-watch",
    "node",
    "-e",
    check,
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
