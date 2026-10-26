import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Profile } from "@attesta/shared-schemas";

/*
 * Pièces justificatives (ADR 0027) : chiffrement au repos, contrôle du type réel du fichier, et libellé
 * d'ancrage de l'élément du profil appuyé. Les fichiers ne sont jamais journalisés ni envoyés à l'IA.
 */

export type EvidenceMime = "application/pdf" | "image/png" | "image/jpeg";

/** Type réel d'après la signature du fichier (l'extension et le type annoncé ne sont pas crus). */
export function sniffMime(bytes: Uint8Array): EvidenceMime | undefined {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  return undefined;
}

/** AES-256-GCM : vecteur d'initialisation aléatoire par fichier, étiquette d'authenticité vérifiée. */
export function encrypt(key: Buffer, plain: Uint8Array) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const content = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), content };
}

export function decrypt(key: Buffer, sealed: { iv: Buffer; tag: Buffer; content: Buffer }) {
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.iv);
  decipher.setAuthTag(sealed.tag);
  return Buffer.concat([decipher.update(sealed.content), decipher.final()]);
}

/**
 * Libellé de l'élément du profil visé par une pièce. Même règle que le frontend : une pièce ne justifie
 * un élément que tant que ce libellé reste identique à celui enregistré au dépôt.
 */
export function evidenceAnchor(profile: Profile, target: string): string | undefined {
  const [, section, a] = target.split("/");
  const i = Number(a);
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" – ");
  switch (section) {
    case "work": {
      const w = profile.work[i];
      return w && join(w.position, w.name);
    }
    case "education": {
      const e = profile.education[i];
      return e && join([e.studyType, e.area].filter(Boolean).join(" "), e.institution);
    }
    case "certificates": {
      const c = profile.certificates[i];
      return c && join(c.name, c.issuer);
    }
    case "languages":
      return profile.languages[i]?.language;
    default:
      return undefined;
  }
}

/** Nom de fichier sûr pour l'en-tête Content-Disposition (lettres, chiffres, tirets, points). */
export function safeFileName(name: string, mime: EvidenceMime) {
  const ext = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" }[mime];
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "justificatif";
  return `${base}.${ext}`;
}
