/**
 * Sérialisation YAML minimale d'une valeur JSON, pour `openapi.yaml` (ADR 0023), sans dépendance.
 * Toutes les chaînes sont entre guillemets doubles (échappement JSON, valide en YAML 1.2), ce qui évite
 * les pièges du YAML (« no », « 1.0 », « : »…).
 */
export function toYaml(value: unknown): string {
  return `${render(value, 0)}\n`;
}

function render(value: unknown, indent: number): string {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item) =>
        isBlock(item) ? `${pad}-\n${render(item, indent + 1)}` : `${pad}- ${render(item, indent + 1)}`,
      )
      .join("\n");
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    return entries
      .map(([key, v]) => {
        const k = /^[A-Za-z_$][\w$-]*$/.test(key) ? key : JSON.stringify(key);
        return isBlock(v) ? `${pad}${k}:\n${render(v, indent + 1)}` : `${pad}${k}: ${render(v, indent + 1)}`;
      })
      .join("\n");
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "null";
}

function isBlock(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && typeof value === "object" && Object.values(value).some((v) => v !== undefined);
}
