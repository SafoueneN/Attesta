import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";
import { fontFaces } from "./html.js";

/** Vue d'une lettre de motivation : coordonnées du candidat, objet, corps et formules. */
export interface LetterView {
  name: string;
  contact: string[];
  /** Date du jour, en toutes lettres : « 21 octobre 2026 ». */
  date: string;
  city?: string;
  company?: string;
  subject: string;
  greeting: string;
  paragraphs: string[];
  closing: string;
}

const templatesDir = fileURLToPath(new URL("../../templates/", import.meta.url));
const read = (name: string) => readFileSync(join(templatesDir, name), "utf8");
const template = ejs.compile(read("lettre.ejs"));
const css = fontFaces + read("lettre.css");

/** HTML complet de la lettre : même document pour l'aperçu et le PDF, sans script ni ressource externe. */
export function renderLetterHtml(view: LetterView): string {
  return template({ view, css });
}

export const longFrenchDate = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(date);
