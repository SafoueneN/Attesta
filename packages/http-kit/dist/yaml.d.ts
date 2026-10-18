/**
 * Sérialisation YAML minimale d'une valeur JSON, pour `openapi.yaml` (ADR 0023), sans dépendance.
 * Toutes les chaînes sont entre guillemets doubles (échappement JSON, valide en YAML 1.2), ce qui évite
 * les pièges du YAML (« no », « 1.0 », « : »…).
 */
export declare function toYaml(value: unknown): string;
