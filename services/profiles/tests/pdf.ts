/**
 * PDF minimal valide (une page, police Helvetica standard), écrit à la main pour les tests : le service
 * n'embarque pas Chromium. Texte en WinAnsi : les accents usuels du français passent en octal.
 */
export function minimalPdf(lines: string[]): Uint8Array {
  const escape = (s: string) =>
    [...s]
      .map((c) => {
        if (c === "(" || c === ")" || c === "\\") return `\\${c}`;
        const code = c.charCodeAt(0);
        return code > 126 ? `\\${code.toString(8).padStart(3, "0")}` : c;
      })
      .join("");
  const stream = [
    "BT",
    "/F1 11 Tf",
    "14 TL",
    "50 790 Td",
    ...lines.map((l) => `(${escape(l)}) '`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}
