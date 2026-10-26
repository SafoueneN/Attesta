import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { locationScore, reciprocalRankFusion, RRF_K } from "../src/ranking.js";
import { langOf, placeOf, words } from "../src/sources/places.js";

/*
 * Lieux, langue et classement : tests en boîte blanche (une entrée par branche de placeOf) et propriétés
 * (fast-check) sur des entrées quelconques.
 */

describe("placeOf : première ville du pays reconnue (boîte blanche)", () => {
  it.each([
    ["ville seule", "Berlin", "DE", "Berlin"],
    ["exonyme et région", "Munich, Bavaria", "DE", "Munich"],
    ["plusieurs villes : la première", "Berlin; Munich", "DE", "Berlin"],
    ["mention de bureau retirée", "Hub - Berlin", "DE", "Berlin"],
    ["télétravail retiré", "Remote / Hamburg", "DE", "Hamburg"],
    ["drapeau retiré", "Düsseldorf 🇩🇪", "DE", "Düsseldorf"],
    ["ville, province, pays", "Toronto, Ontario, Canada", "CA", "Toronto"],
    ["homonyme avec la province", "London, ON", "CA", "London"],
    ["Tunisie", "Tunis, Tunisia", "TN", "Tunis"],
    ["France", "Paris, France", "FR", "Paris"],
  ])("%s : « %s » (%s) → %s", (_cas, location, country, expected) => {
    expect(placeOf(location, country as "DE")?.nom).toBe(expected);
  });

  it.each([
    ["autre pays nommé", "London, United Kingdom", "CA"],
    ["région hors des quatre pays", "EMEA", "DE"],
    ["pays voisin des quatre", "Berlin, Germany", "FR"],
    ["homonyme d'une grande ville étrangère, sans pays", "London", "CA"],
    ["homonyme allemand de Paris, sans pays", "Paris", "DE"],
    ["lieu vide", "", "DE"],
    ["ville inconnue", "Atlantis", "DE"],
  ])("%s : « %s » (%s) → aucune ville", (_cas, location, country) => {
    expect(placeOf(location, country as "DE")).toBeUndefined();
  });

  it("pays par défaut : Allemagne", () => {
    expect(placeOf("Köln")?.pays).toBe("DE");
  });
});

describe("words et langOf", () => {
  it("garde les mots de 4 lettres et plus, avec leurs équivalents, sans doublon", () => {
    expect(words("Backend-Entwickler IT")).toEqual(["backend", "entwickler", "developer", "engineer"]);
    expect(words("Développeur développeur")).toEqual(["developpeur", "developer", "engineer"]);
    expect(words("")).toEqual([]);
  });

  it.each([
    ["allemand (5 marqueurs)", "Wir suchen die Kollegin mit Erfahrung und für das Team", "de"],
    ["français (5 marqueurs)", "Nous recherchons des profils pour une équipe et vous", "fr"],
    ["égalité au-delà du seuil : allemand", "und wir die der mit et nous vous les des", "de"],
    ["sous le seuil : anglais", "We are looking for a developer und wir", "en"],
    ["vide : anglais", "", "en"],
  ])("%s → %s", (_cas, text, lang) => {
    expect(langOf(text)).toBe(lang);
  });
});

describe("propriétés (fuzzing fast-check)", () => {
  const country = fc.constantFrom("DE", "FR", "CA", "TN" as const);

  it("placeOf ne lève jamais d'erreur et ne renvoie qu'une ville du pays demandé", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), country, (location, c) => {
        const city = placeOf(location, c);
        if (city) expect(city.pays).toBe(c);
      }),
      { numRuns: 2000 },
    );
  });

  it("langOf renvoie toujours de, fr ou en", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(["de", "fr", "en"]).toContain(langOf(text));
      }),
    );
  });

  const lists = fc.array(fc.uniqueArray(fc.constantFrom(..."abcdefghij"), { maxLength: 10 }), {
    maxLength: 4,
  });

  it("RRF : un score par identifiant, trié, et la somme des scores est conservée", () => {
    fc.assert(
      fc.property(lists, (ls) => {
        const fused = reciprocalRankFusion(ls);
        const ids = fused.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(ids)).toEqual(new Set(ls.flat()));
        for (let i = 1; i < fused.length; i++)
          expect(fused[i - 1]!.score).toBeGreaterThanOrEqual(fused[i]!.score);
        const expected = ls.reduce((s, l) => s + l.reduce((t, _id, r) => t + 1 / (RRF_K + r + 1), 0), 0);
        expect(fused.reduce((s, f) => s + f.score, 0)).toBeCloseTo(expected, 10);
      }),
    );
  });

  it("RRF : l'ordre des listes ne change pas le résultat", () => {
    fc.assert(
      fc.property(lists, (ls) => {
        expect(reciprocalRankFusion([...ls].reverse())).toEqual(reciprocalRankFusion(ls));
      }),
    );
  });

  it("RRF : premier de toutes les listes = meilleur score, égal à n / (k + 1)", () => {
    fc.assert(
      fc.property(
        lists.filter((l) => l.length > 0),
        fc.integer({ min: 1, max: 200 }),
        (ls, k) => {
          const top = ls.map((l) => ["z", ...l]);
          const [first] = reciprocalRankFusion(top, k);
          expect(first).toEqual({ id: "z", score: expect.closeTo(top.length / (k + 1), 12) });
        },
      ),
    );
  });

  it("score de lieu : borné dans [0, 1], 1 au centre, inconnu sans coordonnées", () => {
    const lat = fc.double({ min: -60, max: 70, noNaN: true });
    const lon = fc.double({ min: -170, max: 170, noNaN: true });
    fc.assert(
      fc.property(lat, lon, lat, lon, fc.integer({ min: 1, max: 500 }), (a, b, c, d, radius) => {
        const s = locationScore({ lat: a, lon: b }, { lat: c, lon: d }, radius)!;
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
        expect(locationScore({ lat: a, lon: b }, { lat: a, lon: b }, radius)).toBe(1);
        expect(locationScore({ lat: a, lon: b }, { lat: null, lon: d }, radius)).toBeNull();
      }),
    );
  });
});
