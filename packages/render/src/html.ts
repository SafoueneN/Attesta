import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";
import { CV_LABELS } from "./labels.js";
import type { CvView } from "./view.js";

export const CV_VARIANTS = ["ats", "design"] as const;
export type CvVariant = (typeof CV_VARIANTS)[number];

const templatesDir = fileURLToPath(new URL("../templates/", import.meta.url));
const readTemplate = (name: string) => readFileSync(join(templatesDir, name), "utf8");

const template = ejs.compile(readTemplate("cv.ejs"));
const css: Record<CvVariant, string> = {
  ats: readTemplate("base.css") + readTemplate("ats.css"),
  design: readTemplate("base.css") + readTemplate("design.css"),
};

/** Dossier d'un paquet installé (ses `exports` n'exposent pas les fichiers de police). */
function packageDir(name: string): string {
  const require = createRequire(import.meta.url);
  const dir = require.resolve
    .paths(name)
    ?.map((p) => join(p, name))
    .find((p) => existsSync(p));
  if (!dir) throw new Error(`Paquet introuvable : ${name}`);
  return dir;
}

/**
 * Polices embarquées en data URI : le PDF ne dépend d'aucune ressource réseau,
 * et l'aperçu affiche exactement les mêmes glyphes.
 */
function embeddedFontFaces(): string {
  const dir = packageDir("@fontsource/source-sans-3");
  return ["400", "600", "700"]
    .map((weight) => readFileSync(join(dir, `${weight}.css`), "utf8"))
    .flatMap(
      (sheet) =>
        sheet.match(/\/\* source-sans-3-latin(-ext)?-\d+-normal \*\/\s*@font-face\s*\{[^}]*\}/g) ?? [],
    )
    .map((face) =>
      face.replace(/src:[^;]+;/, (src) => {
        const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(src)?.[1];
        if (!file) throw new Error("Police woff2 introuvable dans la feuille fontsource");
        const data = readFileSync(join(dir, "files", file)).toString("base64");
        return `src: url(data:font/woff2;base64,${data}) format('woff2');`;
      }),
    )
    .join("\n");
}

const fontFaces = embeddedFontFaces();

export interface RenderOptions {
  variant: CvVariant;
  /** Nonce CSP de la page d'aperçu ; inutile pour le PDF. */
  styleNonce?: string;
}

/**
 * HTML complet du CV. Le même document sert à l'aperçu et au PDF (ADR 0005).
 * La CSP embarquée interdit tout script et toute ressource externe.
 */
export function renderCvHtml(view: CvView, { variant, styleNonce }: RenderOptions): string {
  return template({
    view,
    labels: CV_LABELS[view.lang],
    variant,
    css: fontFaces + css[variant],
    styleNonce,
  });
}
