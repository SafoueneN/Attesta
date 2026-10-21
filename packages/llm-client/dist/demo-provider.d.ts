import { type LlmProvider, type LlmRequest, type LlmResult, type LlmStep } from "./provider.js";
/** Réponse de démonstration d'une étape, construite par le service à partir des données d'entrée. */
export type DemoHandler = (input: unknown) => unknown;
/**
 * Fournisseur de démonstration, sans modèle ni réseau. Le paquet n'en connaît pas les règles : chaque
 * service fournit, pour ses étapes, une fonction qui recopie le contenu d'entrée (aucune reformulation).
 * Sert au développement local et aux tests de bout en bout ; l'interface l'indique au candidat. Une étape
 * sans gestionnaire est indisponible (l'import de CV, par exemple).
 */
export declare class DemoProvider implements LlmProvider {
    private readonly handlers;
    readonly kind: "demo";
    readonly model = "demo";
    constructor(handlers?: Partial<Record<LlmStep, DemoHandler>>);
    generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
}
