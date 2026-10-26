import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { fontFaces } from "./html.js";

/*
 * Annexe « Justificatifs » du CV (ADR 0027) : page de garde rendue comme le CV (Chromium), puis chaque
 * pièce choisie par le candidat, ajoutée telle quelle (pages d'un PDF) ou mise en page (image), par pdf-lib.
 */

export interface AnnexItem {
  label: string;
  /** Nature lisible : « Diplôme », « Attestation d'employeur »… */
  kind: string;
  /** Élément du profil appuyé : « Développeuse back-end – Transports Rhône ». */
  anchor: string;
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
  bytes: Uint8Array;
}

export interface AnnexView {
  name: string;
  items: { label: string; kind: string; anchor: string; note?: string }[];
}

const templatesDir = fileURLToPath(new URL("../../templates/", import.meta.url));
const read = (file: string) => readFileSync(join(templatesDir, file), "utf8");
const template = ejs.compile(read("annexe.ejs"));
const css = fontFaces + read("annexe.css");

export function renderAnnexHtml(view: AnnexView): string {
  return template({ view, css });
}

export const EVIDENCE_KIND_LABELS: Record<string, string> = {
  diplome: "Diplôme",
  attestation_employeur: "Attestation d'employeur",
  certificat: "Certificat",
  recommandation: "Recommandation",
  autre: "Autre pièce",
};

/** Un PDF illisible ou protégé ne bloque pas l'export : il est signalé sur la page de garde. */
export async function unreadablePdf(bytes: Uint8Array): Promise<boolean> {
  try {
    await PDFDocument.load(bytes, { ignoreEncryption: false });
    return false;
  } catch {
    return true;
  }
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 40;

/**
 * CV + page de garde + pièces, dans cet ordre. Les PDF illisibles sont omis (la page de garde le dit) ;
 * une image occupe une page A4, réduite pour tenir sous son titre.
 */
export async function appendAnnex(
  cv: Uint8Array,
  cover: Uint8Array,
  items: AnnexItem[],
): Promise<Uint8Array> {
  const out = await PDFDocument.load(cv);
  const copyAll = async (bytes: Uint8Array) => {
    const source = await PDFDocument.load(bytes);
    for (const page of await out.copyPages(source, source.getPageIndices())) out.addPage(page);
  };
  await copyAll(cover);
  const font = await out.embedFont(StandardFonts.HelveticaBold);
  for (const [i, item] of items.entries()) {
    if (item.mimeType === "application/pdf") {
      try {
        await copyAll(item.bytes);
      } catch {
        // Omis : signalé sur la page de garde (voir unreadablePdf).
      }
      continue;
    }
    const image =
      item.mimeType === "image/png" ? await out.embedPng(item.bytes) : await out.embedJpg(item.bytes);
    const page = out.addPage([A4.width, A4.height]);
    // Titre numéroté seulement : la police standard ne couvre pas tous les caractères qu'un libellé saisi
    // peut contenir ; le libellé complet figure sur la page de garde.
    const title = `Pièce ${i + 1}`;
    page.drawText(title, {
      x: MARGIN,
      y: A4.height - MARGIN - 12,
      size: 12,
      font,
      color: rgb(0.09, 0.16, 0.11),
    });
    const box = { width: A4.width - 2 * MARGIN, height: A4.height - 2 * MARGIN - 30 };
    const scale = Math.min(box.width / image.width, box.height / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, { x: (A4.width - w) / 2, y: MARGIN + (box.height - h) / 2, width: w, height: h });
  }
  out.setTitle("CV et justificatifs");
  out.setProducer("Attesta");
  return out.save();
}
