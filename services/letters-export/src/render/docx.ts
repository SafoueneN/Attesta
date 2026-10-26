import { crc32, deflateRawSync } from "node:zlib";
import type { CvView } from "./view.js";

/*
 * Export Word (.docx) du CV (ADR 0037), sans dépendance : un .docx est une archive ZIP de quelques fichiers
 * XML (Office Open XML). Même modèle de vue que le PDF : mêmes rubriques, mêmes lignes sourcées, mêmes
 * usages du pays (photo, informations personnelles, signature). Une colonne, styles de titres Word :
 * lisible par les ATS et retouchable par les cabinets de recrutement.
 */

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const run = (text: string, props = "") =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

const para = (content: string, style?: string, extra = "") =>
  `<w:p>${style || extra ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}</w:pPr>` : ""}${content}</w:p>`;

/** Ligne à puce : retrait et puce dessinée en texte (pas de numérotation Word, mieux lue par les ATS). */
const bullet = (text: string) =>
  para(run(`• ${text}`), undefined, '<w:ind w:left="284" w:hanging="284"/><w:spacing w:after="40"/>');

/** Photo d'identité alignée à droite, 30 × 38 mm (1 mm = 36 000 EMU). */
const photoXml = (rid: string) => {
  const cx = 30 * 36000;
  const cy = 38 * 36000;
  return para(
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
      `<wp:docPr id="1" name="Photo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
      `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:nvPicPr><pic:cNvPr id="1" name="Photo"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>` +
      `</wp:inline></w:drawing></w:r>`,
    undefined,
    '<w:jc w:val="right"/>',
  );
};

function documentXml(view: CvView, photo: boolean): string {
  const body: string[] = [];
  if (photo) body.push(photoXml("rIdPhoto"));
  body.push(para(run(view.name), "Title"));
  if (view.headline) body.push(para(run(view.headline, "<w:b/>"), "Subtitle"));
  if (view.contact.length) body.push(para(run(view.contact.join(" · "))));
  if (view.personal.length) body.push(para(run(view.personal.join(" · "), '<w:color w:val="555555"/>')));
  for (const section of view.sections) {
    body.push(para(run(section.title.toUpperCase()), "Heading1"));
    for (const entry of section.entries) {
      body.push(
        para(
          run(entry.title, "<w:b/>") + (entry.period ? run(`\t${entry.period}`) : ""),
          "Heading2",
          '<w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs>',
        ),
      );
      if (entry.subtitle) body.push(para(run(entry.subtitle, "<w:i/>")));
      for (const line of entry.lines) body.push(bullet(line.text));
    }
    if (section.id === "summary") for (const item of section.items) body.push(para(run(item.text)));
    else for (const item of section.items) body.push(bullet(item.text));
  }
  if (view.signature) {
    body.push(para("", undefined, '<w:spacing w:before="480"/>'), para(run(view.signature)));
    body.push(para(run(view.name, "<w:b/>"), undefined, '<w:spacing w:before="360"/>'));
  }
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<w:body>${body.join("")}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="907" w:right="907" w:bottom="1021" w:left="907" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`
  );
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="1A1A1A"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="20"/><w:outlineLvl w:val="1"/></w:pPr></w:style>
</w:styles>`;

/** Archive ZIP (fichiers compressés « deflate »), écrite à la main : en-têtes locaux, répertoire, fin. */
function zip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const packed = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // noms en UTF-8
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    locals.push(header, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

/** Document Word du CV ; la photo (data URL du modèle de vue) est jointe si les usages du pays l'admettent. */
export function renderCvDocx(view: CvView): Buffer {
  const photo = /^data:(image\/(jpeg|png));base64,(.+)$/.exec(view.photo ?? "");
  const ext = photo?.[2] === "png" ? "png" : "jpeg";
  const xml = (s: string) => Buffer.from(s, "utf8");
  const files = [
    {
      name: "[Content_Types].xml",
      data: xml(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>` +
          `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
          `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
          `</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: xml(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      name: "word/_rels/document.xml.rels",
      data: xml(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          (photo
            ? `<Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo.${ext}"/>`
            : "") +
          `</Relationships>`,
      ),
    },
    { name: "word/document.xml", data: xml(documentXml(view, Boolean(photo))) },
    { name: "word/styles.xml", data: xml(STYLES) },
    ...(photo ? [{ name: `word/media/photo.${ext}`, data: Buffer.from(photo[3]!, "base64") }] : []),
  ];
  return zip(files);
}
