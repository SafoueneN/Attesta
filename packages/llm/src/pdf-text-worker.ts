// Analyse d'un PDF importé, isolée dans un worker_thread (docs/adr/0009) : un
// fichier piégé (flux compressé démesuré, contenu pathologique) ne bloque pas le
// serveur. Le thread principal impose un délai et des limites mémoire.
import { parentPort, workerData } from "node:worker_threads";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const { bytes, maxPages, maxChars } = workerData as { bytes: Uint8Array; maxPages: number; maxChars: number };

const task = getDocument({ data: bytes, useSystemFonts: false, disableFontFace: true });
try {
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(
      content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join(""),
    );
  }
  const text = pages
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxChars);
  parentPort!.postMessage({ ok: true, text });
} catch {
  parentPort!.postMessage({ ok: false });
} finally {
  await task.destroy();
}
