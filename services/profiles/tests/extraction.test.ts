import { describe, expect, it } from "vitest";
import { extractPdfText, isPdf, PdfImportError } from "../src/extraction.js";
import { minimalPdf } from "./pdf.js";

describe("analyse d'un PDF dans un processus enfant", () => {
  it("reconnaît un PDF à sa signature, pas à son extension", () => {
    expect(isPdf(new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(isPdf(new TextEncoder().encode("<html>"))).toBe(false);
  });

  it("refuse un fichier de plus de 5 Mo", async () => {
    await expect(extractPdfText(new Uint8Array(5 * 1024 * 1024 + 1))).rejects.toThrow("5 Mo");
  });

  it("extrait le texte, accents compris", async () => {
    const text = await extractPdfText(
      minimalPdf(["Léa Martin, développeuse back-end", "Réduction de 40 % du temps de réponse de l'API"]),
    );
    expect(text).toContain("Léa Martin");
    expect(text).toContain("Réduction de 40 % du temps de réponse");
  });

  it("refuse un PDF sans texte lisible (document scanné)", async () => {
    await expect(extractPdfText(minimalPdf(["court"]))).rejects.toThrow(/Aucun texte lisible/);
  });

  it("interrompt une analyse qui dépasse le délai", async () => {
    const outcome = extractPdfText(minimalPdf(["x".repeat(80)]), { timeoutMs: 1 });
    await expect(outcome).rejects.toBeInstanceOf(PdfImportError);
    await expect(outcome).rejects.toThrow("trop long à analyser");
  });

  it("refuse un PDF corrompu sans planter le service", async () => {
    const broken = new TextEncoder().encode("%PDF-1.4\n" + "garbage ".repeat(100));
    await expect(extractPdfText(broken)).rejects.toThrow("n'a pas pu être lu");
  });
});
