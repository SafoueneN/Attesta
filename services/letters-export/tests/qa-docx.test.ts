import { inflateRawSync } from "node:zlib";
import { Profile } from "@attesta/shared-schemas";
import { describe, expect, it } from "vitest";
import { renderCvDocx } from "../src/render/docx.js";
import { applyNorms, type CvNorms } from "../src/render/norms.js";
import { viewFromProfile } from "../src/render/view.js";
import { lea } from "./fixtures.js";

/*
 * Campagne QA (A-04) : contenu réel du .docx. L'archive est relue par un lecteur ZIP indépendant du
 * code testé (répertoire central, puis inflate de node:zlib) : nom, rubriques, réalisations, usages du pays
 * (photo, informations personnelles, signature) et échappement XML.
 */

/** Lit une archive ZIP à partir de son répertoire central : nom → contenu décompressé. */
function unzip(archive: Buffer): Map<string, Buffer> {
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("fin de répertoire central absente");
  const count = archive.readUInt16LE(end + 10);
  let p = archive.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (archive.readUInt32LE(p) !== 0x02014b50) throw new Error("entrée de répertoire invalide");
    const method = archive.readUInt16LE(p + 10);
    const packed = archive.readUInt32LE(p + 20);
    const size = archive.readUInt32LE(p + 24);
    const nameLength = archive.readUInt16LE(p + 28);
    const extra = archive.readUInt16LE(p + 30);
    const comment = archive.readUInt16LE(p + 32);
    const local = archive.readUInt32LE(p + 42);
    const name = archive.subarray(p + 46, p + 46 + nameLength).toString("utf8");
    if (archive.readUInt32LE(local) !== 0x04034b50) throw new Error(`en-tête local invalide : ${name}`);
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const raw = archive.subarray(start, start + packed);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    if (data.length !== size) throw new Error(`taille inattendue : ${name}`);
    files.set(name, data);
    p += 46 + nameLength + extra + comment;
  }
  return files;
}

/** Texte visible du document, paragraphe par paragraphe (balises <w:t>, entités décodées). */
const paragraphs = (xml: string) =>
  [...xml.matchAll(/<w:p>(.*?)<\/w:p>/g)].map(([, p]) =>
    [...p!.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g)]
      .map(([, t]) =>
        t!
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&"),
      )
      .join(""),
  );

const basics = {
  ...lea.basics,
  location: { city: "Berlin", countryCode: "DE" },
  birthDate: "1990-04-12",
  nationality: "française",
  workPermit: "titre de séjour UE",
  drivingLicence: "B",
} as Profile["basics"];
const profile = Profile.parse({ ...lea, basics });
const photo = { mimeType: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) };
const docx = (norms: CvNorms, p = profile) => {
  const view = applyNorms(viewFromProfile(p), p.basics, norms, photo);
  return { view, files: unzip(renderCvDocx(view)) };
};

describe("export Word : contenu de word/document.xml (campagne QA)", () => {
  it("contient les parties Office Open XML attendues, sans photo pour le Canada", () => {
    const { files } = docx("CA");
    expect([...files.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
      "word/document.xml",
      "word/styles.xml",
    ]);
  });

  it("reprend le nom, le titre, chaque rubrique et chaque réalisation de la vue, dans l'ordre", () => {
    const { view, files } = docx("FR");
    const xml = files.get("word/document.xml")!.toString("utf8");
    const text = paragraphs(xml);
    expect(xml).toContain(`<w:pStyle w:val="Title"/>`);
    expect(text).toContain(view.name);
    expect(text).toContain(view.headline);
    const headings = [
      ...xml.matchAll(/<w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:t[^>]*>(.*?)<\/w:t>/g),
    ].map(([, t]) => t);
    expect(headings).toEqual(view.sections.map((s) => s.title.toUpperCase()));
    for (const line of view.sections.flatMap((s) => s.entries.flatMap((e) => e.lines))) {
      expect(text).toContain(`• ${line.text}`);
    }
    expect(text).toContain("• Réduction de 40 % du temps de réponse de l'API de réservation");
  });

  it("Allemagne : photo jointe, informations personnelles et signature « Berlin, JJ.MM.AAAA » puis le nom", () => {
    const { view, files } = docx("DE");
    expect(files.get("word/media/photo.jpeg")).toEqual(Buffer.from(photo.bytes));
    expect(files.get("word/_rels/document.xml.rels")!.toString()).toContain('Target="media/photo.jpeg"');
    const xml = files.get("word/document.xml")!.toString("utf8");
    expect(xml).toContain('<a:blip r:embed="rIdPhoto"/>');
    const text = paragraphs(xml);
    expect(text).toContain(view.personal.join(" · "));
    expect(view.personal.join(" ")).toContain("Né(e) le 12/04/1990");
    expect(text.at(-2)).toMatch(/^Berlin, \d{2}\.\d{2}\.\d{4}$/);
    expect(text.at(-1)).toBe(view.name);
  });

  it("France : photo admise, ni date de naissance, ni nationalité, ni signature", () => {
    const { files } = docx("FR");
    expect(files.has("word/media/photo.jpeg")).toBe(true);
    const text = paragraphs(files.get("word/document.xml")!.toString("utf8")).join("\n");
    expect(text).not.toMatch(/Né\(e\) le|Nationalité/);
    expect(text).toContain("Permis B");
    expect(text).not.toMatch(/Berlin, \d{2}\./);
  });

  it("Canada : aucune photo, ni dans l'archive ni dans les relations", () => {
    const { files } = docx("CA");
    expect(files.get("word/_rels/document.xml.rels")!.toString()).not.toContain("rIdPhoto");
    expect(files.get("word/document.xml")!.toString()).not.toContain("<w:drawing>");
  });

  it("échappe les caractères XML et garde un nom arabe en UTF-8", () => {
    const tricky = Profile.parse({
      ...lea,
      basics: { ...lea.basics, name: "أمينة ديالو", label: `R&D <senior> "lead"` },
    });
    const xml = docx("TN", tricky).files.get("word/document.xml")!.toString("utf8");
    expect(xml).toContain("R&amp;D &lt;senior&gt; &quot;lead&quot;");
    expect(xml).not.toContain("<senior>");
    expect(paragraphs(xml)).toContain("أمينة ديالو");
  });
});
