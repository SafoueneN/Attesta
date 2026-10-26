import type { Logger } from "@attesta/logger";
import type { IngestionSummary } from "@attesta/shared-schemas";
import { findCity } from "./geo.js";
import { runQueries, type IngestionDeps } from "./ingestion.js";
import type { Country, JobSource, SourceQuery } from "./types.js";

/*
 * Synchronisation du catalogue d'offres (ADR 0034) : indépendamment des veilles, le service collecte à
 * intervalle régulier les offres récentes des quatre pays, sans filtre de métier, pour que la page « Offres
 * collectées » couvre toutes les régions. Une exécution ne consomme que la moitié du quota restant de chaque
 * source : l'autre moitié reste aux veilles des candidats.
 */

/** Grandes villes interrogées par les sources qui cherchent côté serveur (rayon de 50 km autour de chacune). */
const MAJOR_CITIES: Record<Country, string[]> = {
  DE: ["Berlin", "Hamburg", "Munich", "Köln", "Frankfurt am Main", "Stuttgart", "Düsseldorf", "Leipzig"],
  FR: ["Paris", "Lyon", "Marseille", "Toulouse", "Lille", "Bordeaux", "Nantes", "Strasbourg"],
  CA: ["Toronto", "Montréal", "Vancouver", "Calgary", "Ottawa", "Edmonton", "Québec", "Winnipeg"],
  TN: ["Tunis", "Sfax", "Sousse", "Bizerte"],
};

/** Centre et rayon couvrant tout le pays, pour les sources filtrées par le code (Arbeitnow, employeurs). */
const WHOLE_COUNTRY: Record<Country, { city: string; radiusKm: number }> = {
  DE: { city: "Kassel", radiusKm: 650 },
  FR: { city: "Bourges", radiusKm: 1000 },
  CA: { city: "Winnipeg", radiusKm: 4500 },
  TN: { city: "Kairouan", radiusKm: 450 },
};

/** Sources dont la recherche filtre par lieu côté serveur : une requête par grande ville. */
const SERVER_SIDE = new Set(["ba", "adzuna", "jooble"]);

/** Part du quota restant du jour qu'une synchronisation peut consommer. */
export const CATALOGUE_SHARE = 0.5;

export function catalogueQueries(sources: JobSource[]): { source: JobSource; query: SourceQuery }[] {
  const queries: { source: JobSource; query: SourceQuery }[] = [];
  for (const source of sources) {
    for (const country of source.countries) {
      const zones = SERVER_SIDE.has(source.id)
        ? MAJOR_CITIES[country].map((city) => ({ city, radiusKm: 50 }))
        : [WHOLE_COUNTRY[country]];
      for (const zone of zones) {
        if (!findCity(zone.city, country)) continue;
        // Métier vide : toutes les offres de la zone, publiées ces 3 derniers jours.
        queries.push({ source, query: { country, occupation: "", sinceDays: 3, ...zone } });
      }
    }
  }
  return queries;
}

export interface CatalogueStatus {
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSummary: IngestionSummary | null;
}

/** Synchronisations régulières, jamais deux à la fois. */
export class CatalogueSync {
  private state: CatalogueStatus = {
    running: false,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastSummary: null,
  };
  private timer: NodeJS.Timeout | undefined;
  private first: NodeJS.Timeout | undefined;

  constructor(
    private readonly deps: IngestionDeps,
    private readonly logger: Logger,
  ) {}

  status(): CatalogueStatus {
    return { ...this.state };
  }

  /** Lance une synchronisation ; faux si une autre est en cours. */
  run(): boolean {
    if (this.state.running) return false;
    this.state = { ...this.state, running: true, lastStartedAt: new Date().toISOString() };
    const date = new Date().toISOString().slice(0, 10);
    void runQueries(this.deps, catalogueQueries(this.deps.sources), date, CATALOGUE_SHARE)
      .then((summary) => {
        this.state = { ...this.state, lastSummary: summary };
        this.logger.info({ event: "catalogue", ...summary }, "catalogue synchronisé");
      })
      .catch((error) =>
        this.logger.error({ event: "catalogue_erreur", errorType: (error as Error)?.name }, "catalogue"),
      )
      .finally(() => {
        this.state = { ...this.state, running: false, lastFinishedAt: new Date().toISOString() };
      });
    return true;
  }

  /** Toutes les `hours` heures, la première une minute après le démarrage ; 0 désactive. */
  start(hours: number) {
    if (hours <= 0) return;
    this.first = setTimeout(() => this.run(), 60_000);
    this.timer = setInterval(() => this.run(), hours * 60 * 60 * 1000);
    this.first.unref();
    this.timer.unref();
  }

  stop() {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }
}
