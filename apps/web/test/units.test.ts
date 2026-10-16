import { loggedPath } from "../src/app.js";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { draftToProfile, emptyDraft, mergeStep, validProfile } from "../src/draft.js";
import { absoluteSessionLimit, SESSION_ABSOLUTE_MS } from "../src/security.js";

describe("brouillon", () => {
  it("accepte les listes que qs transforme en objets au-delà de 20 éléments", () => {
    const body = { work: { "0": { position: "A" }, "21": { position: "B" } } };

    const draft = mergeStep(emptyDraft(), 2, body);

    expect(draft.work.map((w) => w.position)).toEqual(["A", "B"]);
  });

  it("ignore les valeurs non textuelles injectées dans le formulaire", () => {
    const draft = mergeStep(emptyDraft(), 1, { basics: { name: ["x", "y"], label: { $ne: 1 } } });
    expect(draft.basics.name).toBe("");
    expect(draft.basics.label).toBe("");
  });

  it("convertit compétences, langues et réalisations ligne par ligne", () => {
    const draft = mergeStep(emptyDraft(), 2, {
      work: [{ position: "Dev", name: "ACME", startDate: "2020", highlights: "  A \r\n\nB " }],
      skills: "Node.js : Express, PostgreSQL\nDocker",
      languages: "Anglais : C1",
    });

    const profile = draftToProfile(draft);

    expect(profile.work[0]?.highlights).toEqual(["A", "B"]);
    expect(profile.skills).toEqual([
      { name: "Node.js", keywords: ["Express", "PostgreSQL"] },
      { name: "Docker", keywords: [] },
    ]);
    expect(profile.languages).toEqual([{ language: "Anglais", fluency: "C1" }]);
  });

  it("normalise le code pays et omet la localisation vide", () => {
    const withCountry = mergeStep(emptyDraft(), 1, { basics: { name: "Léa", countryCode: "fr" } });
    const without = mergeStep(emptyDraft(), 1, { basics: { name: "Léa" } });

    expect(validProfile(withCountry)?.basics.location).toEqual({ countryCode: "FR" });
    expect(draftToProfile(without).basics.location).toBeUndefined();
  });
});

describe("plafond absolu de session", () => {
  const run = (createdAt: number | undefined, now: number) => {
    const session = { createdAt, regenerate: vi.fn((cb: (err?: unknown) => void) => cb()) };
    const next = vi.fn() as NextFunction;
    absoluteSessionLimit(() => now)({ session } as unknown as Request, {} as Response, next);
    return { session, next };
  };

  it("horodate une nouvelle session", () => {
    const { session, next } = run(undefined, 1000);
    expect(session.createdAt).toBe(1000);
    expect(next).toHaveBeenCalledOnce();
  });

  it("conserve une session de moins de 24 h", () => {
    const { session } = run(0, SESSION_ABSOLUTE_MS);
    expect(session.regenerate).not.toHaveBeenCalled();
  });

  it("régénère une session de plus de 24 h", () => {
    const { session, next } = run(0, SESSION_ABSOLUTE_MS + 1);
    expect(session.regenerate).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(undefined);
  });
});

describe("journal d'accès", () => {
  it("masque les jetons des liens envoyés par e-mail et les paramètres", () => {
    expect(loggedPath("/compte/connexion/abcDEF123_-xyz?x=1")).toBe("/compte/connexion/:jeton");
    expect(loggedPath("/veille/confirmer/abc")).toBe("/veille/confirmer/:jeton");
    expect(loggedPath("/veille/desabonner/abc")).toBe("/veille/desabonner/:jeton");
    expect(loggedPath("/cv/etape/2?variant=ats")).toBe("/cv/etape/2");
    // Le routage Express ignore la casse : le masquage aussi.
    expect(loggedPath("/Veille/Desabonner/abcDEF123456789012345")).not.toContain("abcDEF");
  });
});
