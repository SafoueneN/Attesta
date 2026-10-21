// Analyse d'un PDF importé, dans un processus enfant (docs/adr/0009). Le parent
// lui impose un plafond mémoire du noyau (prlimit), un temps CPU et un délai, et
// ne lui transmet aucune variable d'environnement : un fichier piégé ne peut ni
// épuiser la mémoire de l'instance, ni lire un secret.
// Entrée : le PDF sur stdin. Sortie : une ligne JSON sur stdout.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const maxPages = Number(process.argv[2]);
const maxChars = Number(process.argv[3]);

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);

const task = getDocument({
  data: new Uint8Array(Buffer.concat(chunks)),
  useSystemFonts: false,
  disableFontFace: true,
  verbosity: 0,
});
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
  process.stdout.write(JSON.stringify({ ok: true, text }));
} catch {
  process.stdout.write(JSON.stringify({ ok: false }));
} finally {
  await task.destroy();
}
