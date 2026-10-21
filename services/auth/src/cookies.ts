import type { Request, Response } from "express";

export const REFRESH_COOKIE = "attesta_rt";
export const GUEST_COOKIE = "attesta_guest";

/** Lecture des cookies de la requête, sans dépendance (deux cookies seulement nous concernent). */
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.get("cookie") ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at === -1) continue;
    if (part.slice(0, at).trim() === name) {
      const value = part.slice(at + 1).trim();
      return /^[A-Za-z0-9._-]{20,2000}$/.test(value) ? value : undefined;
    }
  }
  return undefined;
}

export interface CookieSettings {
  path: string;
  secure: boolean;
}

/**
 * Cookies `HttpOnly`, `SameSite=Strict`, restreints au chemin de la session (ADR 0022, point 3) : jamais
 * lisibles en JavaScript, jamais envoyés à une autre route que celles de la session.
 */
export function setCookie(
  res: Response,
  settings: CookieSettings,
  name: string,
  value: string,
  maxAgeMs: number,
) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: settings.secure,
    sameSite: "strict",
    path: settings.path,
    maxAge: maxAgeMs,
  });
}

export function clearCookie(res: Response, settings: CookieSettings, name: string) {
  res.clearCookie(name, { httpOnly: true, secure: settings.secure, sameSite: "strict", path: settings.path });
}
