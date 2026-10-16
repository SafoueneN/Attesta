/** Pays du pilote : Allemagne d'abord (BA Jobsuche), puis France (docs/adr/0010). */
export type Country = "DE" | "FR";
export type WorkingTime = "plein" | "partiel";

/** Recherche lancée auprès d'une source pour un groupe d'abonnés. */
export interface SourceQuery {
  country: Country;
  /** Intitulé de métier, dans la langue de la source. */
  occupation: string;
  city: string;
  radiusKm: number;
  /** Offres publiées depuis au plus ce nombre de jours. */
  sinceDays: number;
}

/** Offre normalisée, prête à être dédupliquée et stockée. */
export interface Posting {
  source: string;
  externalId: string;
  title: string;
  company: string | null;
  city: string | null;
  country: Country;
  lat: number | null;
  lon: number | null;
  /** Langue du texte (« de », « fr ») : configuration de la recherche lexicale. */
  lang: string;
  workingTime: WorkingTime | null;
  /** AAAA-MM-JJ */
  postedAt: string;
  url: string;
  body: string;
  /** Salaire annuel brut en euros, seulement s'il est publié tel quel (jamais estimé). */
  salaryMinEur: number | null;
  salaryMaxEur: number | null;
}

export interface SourceRunStats {
  requests: number;
  fetched: number;
  errors: number;
}

/**
 * Connecteur d'une source autorisée (docs/adr/0007). Aucun scraping : uniquement
 * des API publiques ou sous contrat, dans la limite de leurs quotas.
 */
export interface JobSource {
  readonly id: string;
  readonly countries: readonly Country[];
  /** Mention exigée par les conditions de la source, reprise dans les rapports. */
  readonly attribution?: { text: string; url: string };
  /**
   * Offres correspondant à la recherche. `isKnown` évite de redemander le détail
   * d'une offre déjà stockée ; `budget` borne le nombre de requêtes.
   */
  search(query: SourceQuery, options: SearchOptions): AsyncIterable<Posting>;
}

export interface SearchOptions {
  isKnown: (externalId: string) => Promise<boolean>;
  budget: RequestBudget;
  /**
   * Offre ignorée (retirée entre la recherche et le détail, ou format inattendu) :
   * comptée en erreur, sans interrompre le reste de la recherche.
   */
  onSkip?: () => void;
}

/** Plafond de requêtes partagé par toutes les recherches d'une source pendant une exécution. */
export class RequestBudget {
  private used = 0;
  constructor(readonly limit: number) {}

  /** Réserve une requête ; faux si le plafond est atteint. */
  take(): boolean {
    if (this.used >= this.limit) return false;
    this.used++;
    return true;
  }

  get spent() {
    return this.used;
  }
}
