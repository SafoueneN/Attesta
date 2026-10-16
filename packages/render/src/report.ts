import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";
import { fontFaces } from "./html.js";

/**
 * Rapports quotidiens de la veille (docs/adr/0007) : une vue HTML par rapport,
 * imprimée en PDF par le même moteur que le CV. Aucune ressource externe.
 */

export interface ReportOffer {
  title: string;
  company: string | null;
  city: string | null;
  /** JJ/MM/AAAA */
  postedAt: string;
  url: string;
  source: string;
  /** Mention exigée par la source (« Jobs by Adzuna »). */
  attribution: { text: string; url: string } | null;
  /** Pertinence du rerank (0 à 100), absente en mode dégradé. */
  pertinence: number | null;
  /** Composantes en pourcentage ; null : non calculable (pas de coordonnées, pas de terme technique). */
  similarity: number | null;
  coverage: number | null;
  location: number | null;
  missingSkills: string[];
}

export interface OffersReportView {
  date: string;
  criteria: string;
  offers: ReportOffer[];
  /** Le rerank n'a pas pu être fait : classement de l'étage de rappel seul. */
  degraded: boolean;
}

export interface ReportGap {
  skill: string;
  count: number;
  frequency: number;
  /** Phrase déjà rédigée (« associé à », fourchette, effectif) ou « données insuffisantes ». */
  salary: string;
  effort: "faible" | "moyen";
  priority: number;
}

export interface GapsReportView {
  date: string;
  criteria: string;
  /** Offres sur lesquelles portent les fréquences (30 derniers jours). */
  basis: number;
  gaps: ReportGap[];
}

const templatesDir = fileURLToPath(new URL("../templates/", import.meta.url));
const read = (name: string) => readFileSync(join(templatesDir, name), "utf8");
const css = fontFaces + read("report.css");
const offersTemplate = ejs.compile(read("rapport-offres.ejs"));
const gapsTemplate = ejs.compile(read("rapport-ameliorations.ejs"));

export function renderOffersReportHtml(view: OffersReportView): string {
  return offersTemplate({ view, css });
}

export function renderGapsReportHtml(view: GapsReportView): string {
  return gapsTemplate({ view, css });
}
