import {
  AppError,
  authenticate,
  notFound,
  parseInput,
  principalOf,
  requireRole,
  requireScope,
  type Operation,
  type TokenVerifier,
} from "@attesta/http-kit";
import { BudgetedProvider, type LlmProvider } from "@attesta/llm-client";
import type { Logger } from "@attesta/logger";
import {
  ImportResult,
  ProfileSave,
  ProfileVersionSummary,
  ServiceStats,
  StoredProfile,
  UserExport,
} from "@attesta/shared-schemas";
import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import {
  extractPdfText,
  extractProfile,
  groundExtraction,
  MAX_PDF_BYTES,
  PdfImportError,
} from "./extraction.js";
import type { ProfileStore, StoredRow } from "./store.js";

export interface RouteDeps {
  store: ProfileStore;
  verifier: TokenVerifier;
  logger: Logger;
  /** Fournisseur LLM sous budget ; absent ou en démonstration : import indisponible. */
  llm?: BudgetedProvider | LlmProvider;
}

const VersionParam = z.object({ version: z.coerce.number().int().positive() });
const UserParam = z.object({ id: z.string().regex(/^(guest_)?[0-9a-f-]{36}$/i, "Identifiant invalide") });

export const operations: Operation[] = [
  {
    method: "get",
    path: "/v1/profiles/me",
    operationId: "monProfil",
    summary: "Dernière version du profil de l'utilisateur (candidat ou invité)",
    tags: ["profil"],
    auth: true,
    responses: {
      200: { description: "Profil", schema: StoredProfile },
      404: { description: "Aucun profil" },
    },
  },
  {
    method: "put",
    path: "/v1/profiles/me",
    operationId: "enregistrerProfil",
    summary: "Enregistre une nouvelle version du profil (aucune si rien n'a changé)",
    tags: ["profil"],
    auth: true,
    body: ProfileSave,
    responses: {
      200: { description: "Profil inchangé", schema: StoredProfile },
      201: { description: "Nouvelle version", schema: StoredProfile },
      400: { description: "Profil invalide" },
    },
  },
  {
    method: "delete",
    path: "/v1/profiles/me",
    operationId: "supprimerProfil",
    summary: "Efface toutes les versions du profil",
    tags: ["profil"],
    auth: true,
    responses: { 204: { description: "Profil effacé" } },
  },
  {
    method: "get",
    path: "/v1/profiles/me/versions",
    operationId: "versionsProfil",
    summary: "Historique des versions du profil",
    tags: ["profil"],
    auth: true,
    responses: { 200: { description: "Versions", schema: z.array(ProfileVersionSummary) } },
  },
  {
    method: "get",
    path: "/v1/profiles/me/versions/{version}",
    operationId: "versionProfil",
    summary: "Une version passée du profil",
    tags: ["profil"],
    auth: true,
    responses: {
      200: { description: "Profil", schema: StoredProfile },
      404: { description: "Version inconnue" },
    },
  },
  {
    method: "post",
    path: "/v1/profiles/import",
    operationId: "importerCv",
    summary: "Pré-remplit un profil depuis un CV PDF (multipart, champ « cv ») ; rien n'est enregistré",
    tags: ["profil"],
    auth: true,
    responses: {
      200: { description: "Brouillon à relire", schema: ImportResult },
      400: { description: "Fichier refusé" },
      503: { description: "Import indisponible" },
    },
  },
  {
    method: "get",
    path: "/v1/admin/stats",
    operationId: "statistiquesProfils",
    summary: "Compteurs et consommation du LLM, sans donnée personnelle",
    tags: ["administration"],
    auth: true,
    responses: { 200: { description: "Statistiques", schema: ServiceStats } },
  },
  {
    method: "get",
    path: "/internal/v1/profiles/me",
    operationId: "profilCourantInterne",
    summary: "Profil de l'utilisateur du jeton relayé (cv-generation, letters-export)",
    tags: ["interne"],
    auth: true,
    responses: {
      200: { description: "Profil", schema: StoredProfile },
      404: { description: "Aucun profil" },
    },
  },
  {
    method: "get",
    path: "/internal/v1/users/{id}/profile",
    operationId: "profilUtilisateurInterne",
    summary: "Profil d'un utilisateur (jeton de service profiles:read, veille quotidienne)",
    tags: ["interne"],
    auth: true,
    responses: {
      200: { description: "Profil", schema: StoredProfile },
      404: { description: "Aucun profil" },
    },
  },
  {
    method: "get",
    path: "/internal/v1/users/{id}/export",
    operationId: "exportUtilisateur",
    summary: "Données du service pour l'export RGPD (jeton de service users:export)",
    tags: ["interne"],
    auth: true,
    responses: { 200: { description: "Données", schema: UserExport } },
  },
  {
    method: "delete",
    path: "/internal/v1/users/{id}",
    operationId: "effacerUtilisateur",
    summary: "Efface les données d'un utilisateur, idempotent (jeton de service users:delete)",
    tags: ["interne"],
    auth: true,
    responses: { 204: { description: "Effacé" } },
  },
];

const toDto = (row: StoredRow) => ({
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  schemaVersion: row.schemaVersion,
  profile: row.profile,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 2 },
});

function receiveFile(req: Request, res: Response, next: NextFunction) {
  upload.single("cv")(req, res, (err: unknown) =>
    next(
      err ? new AppError("fichier_refuse", 400, "Le fichier dépasse 5 Mo ou n'est pas accepté.") : undefined,
    ),
  );
}

export function registerRoutes(app: Express, { store, verifier, logger, llm }: RouteDeps): void {
  const auth = authenticate(verifier);
  const me = (res: Response) => principalOf(res).sub;
  /** Les jetons de service n'ont pas de profil : routes utilisateur réservées aux candidats et invités. */
  const user = requireRole("candidate", "admin", "guest");

  const current = async (userId: string) => {
    const row = await store.latest(userId);
    if (!row) throw notFound("Aucun profil enregistré.");
    return toDto(row);
  };

  app.get("/v1/profiles/me", auth, user, async (_req, res) => {
    res.json(await current(me(res)));
  });

  app.put("/v1/profiles/me", auth, user, async (req, res) => {
    const { profile } = parseInput(ProfileSave, req.body);
    const { row, created } = await store.save(me(res), profile);
    if (created) logger.info({ event: "profil_version", version: row.version }, "profil");
    res.status(created ? 201 : 200).json(toDto(row));
  });

  app.delete("/v1/profiles/me", auth, user, async (_req, res) => {
    await store.deleteUser(me(res));
    res.status(204).end();
  });

  app.get("/v1/profiles/me/versions", auth, user, async (_req, res) => {
    const rows = await store.versions(me(res));
    res.json(
      rows.map((r) => ({
        version: r.version,
        createdAt: r.createdAt.toISOString(),
        label: [r.name, r.label].filter(Boolean).join(" · ") || `Version ${r.version}`,
      })),
    );
  });

  app.get("/v1/profiles/me/versions/:version", auth, user, async (req, res) => {
    const { version } = parseInput(VersionParam, req.params);
    const row = await store.version(me(res), version);
    if (!row) throw notFound("Cette version du profil n'existe pas.");
    res.json(toDto(row));
  });

  app.post("/v1/profiles/import", auth, user, receiveFile, async (req, res) => {
    if (!llm || llm.kind !== "ia") {
      throw new AppError(
        "import_indisponible",
        503,
        "L'import de CV n'est pas disponible sur ce serveur (mode démonstration). Saisissez votre profil à la main.",
      );
    }
    if (!req.file) throw new AppError("fichier_absent", 400, "Choisissez un fichier PDF à importer.");
    let text: string;
    try {
      text = await extractPdfText(new Uint8Array(req.file.buffer));
    } catch (error) {
      if (error instanceof PdfImportError) throw new AppError("pdf_illisible", 400, error.publicMessage);
      throw error;
    }
    let extracted;
    try {
      extracted = (await extractProfile(llm, text)).profile;
    } catch (error) {
      logger.warn({ event: "import_echec", errorType: (error as Error)?.name }, "import");
      throw new AppError(
        "import_indisponible",
        503,
        "L'import est indisponible pour le moment. Vous pouvez saisir votre profil à la main.",
      );
    }
    // Tout élément extrait doit se retrouver dans le texte du PDF.
    const { profile, dropped } = groundExtraction(extracted, text);
    logger.info({ event: "import_cv", dropped }, "import");
    res.json({ profile, dropped });
  });

  app.get("/v1/admin/stats", auth, requireRole("admin"), async (_req, res) => {
    logger.info({ event: "admin_acces", route: "/v1/admin/stats" }, "administration");
    const counters = await store.stats();
    res.json({
      service: "profiles",
      counters,
      ...(llm instanceof BudgetedProvider && { llm: await llm.summary() }),
    });
  });

  // --- Interne (ADR 0012, point 3) ---------------------------------------------------------------

  app.get("/internal/v1/profiles/me", auth, user, async (_req, res) => {
    res.json(await current(me(res)));
  });

  app.get("/internal/v1/users/:id/profile", auth, requireScope("profiles:read"), async (req, res) => {
    const { id } = parseInput(UserParam, req.params);
    res.json(await current(id));
  });

  app.get("/internal/v1/users/:id/export", auth, requireScope("users:export"), async (req, res) => {
    const { id } = parseInput(UserParam, req.params);
    res.json({ service: "profiles", data: await store.exportUser(id) });
  });

  app.delete("/internal/v1/users/:id", auth, requireScope("users:delete"), async (req, res) => {
    const { id } = parseInput(UserParam, req.params);
    const count = await store.deleteUser(id);
    logger.info({ event: "rgpd_effacement", count }, "rgpd");
    res.status(204).end();
  });
}
