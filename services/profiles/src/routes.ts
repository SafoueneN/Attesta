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
import { AssistUnavailableError, BudgetedProvider, type LlmProvider } from "@attesta/llm-client";
import type { Logger } from "@attesta/logger";
import {
  Evidence,
  EVIDENCE_MAX_BYTES,
  PHOTO_MAX_BYTES,
  ProfilePhoto,
  EVIDENCE_MAX_COUNT,
  EvidenceUpload,
  FactProposals,
  ImportResult,
  ProfileAnswer,
  ProfileInterviewRequest,
  AssistantVote,
  ProfileInterview,
  ProfileSave,
  ProfileVersionSummary,
  ServiceStats,
  StoredProfile,
  UserExport,
} from "@attesta/shared-schemas";
import { factProposals, interviewQuestions } from "./assistant.js";
import { decrypt, encrypt, evidenceAnchor, safeFileName, sniffMime } from "./evidence.js";
import { rulesProfile } from "./import-rules.js";
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
import type { EvidenceRow, ProfileStore, StoredRow } from "./store.js";

export interface RouteDeps {
  store: ProfileStore;
  verifier: TokenVerifier;
  logger: Logger;
  /** Clé AES-256 des pièces justificatives (32 octets, ADR 0027). */
  evidenceKey: Buffer;
  /** Fournisseur LLM sous budget ; absent ou en démonstration : import indisponible. */
  llm?: BudgetedProvider | LlmProvider;
}

const VersionParam = z.object({ version: z.coerce.number().int().positive() });
const EvidenceParam = z.object({ evidenceId: z.uuid("Identifiant de pièce invalide") });
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
    method: "post",
    path: "/v1/assistants/feedback",
    operationId: "avisAssistantProfil",
    summary: "Avis 👍 / 👎 anonyme sur une réponse d'assistant (ADR 0029)",
    tags: ["assistants"],
    auth: true,
    body: AssistantVote,
    responses: { 204: { description: "Enregistré" } },
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
    method: "post",
    path: "/v1/profiles/me/interview",
    operationId: "questionsProfil",
    summary: "Intervieweuse de profil : questions pour préciser expériences et projets (ADR 0028)",
    tags: ["assistants"],
    auth: true,
    body: ProfileInterviewRequest,
    responses: {
      200: { description: "Questions", schema: ProfileInterview },
      409: { description: "Profil absent" },
      503: { description: "Assistant indisponible" },
    },
  },
  {
    method: "post",
    path: "/v1/profiles/me/interview/answer",
    operationId: "faitsDepuisReponse",
    summary:
      "Réalisations proposées depuis la réponse du candidat ; rien n'est enregistré sans sa validation",
    tags: ["assistants"],
    auth: true,
    body: ProfileAnswer,
    responses: {
      200: { description: "Propositions vérifiées", schema: FactProposals },
      400: { description: "Réponse invalide" },
      409: { description: "Profil absent" },
      503: { description: "Assistant indisponible" },
    },
  },
  {
    method: "get",
    path: "/v1/profiles/me/evidence",
    operationId: "mesJustificatifs",
    summary: "Pièces justificatives du compte (métadonnées), avec leur rattachement au profil actuel",
    tags: ["justificatifs"],
    auth: true,
    responses: { 200: { description: "Pièces", schema: z.array(Evidence) } },
  },
  {
    method: "post",
    path: "/v1/profiles/me/evidence",
    operationId: "deposerJustificatif",
    summary:
      "Joint une pièce (multipart : champ « piece », PDF, PNG ou JPEG de 5 Mo au plus ; champs target, kind, label)",
    tags: ["justificatifs"],
    auth: true,
    responses: {
      201: { description: "Pièce enregistrée (chiffrée)", schema: Evidence },
      400: { description: "Fichier ou champs refusés" },
      403: { description: "Réservé aux comptes" },
      409: { description: "Profil absent, élément inconnu ou 20 pièces atteintes" },
    },
  },
  {
    method: "get",
    path: "/v1/profiles/me/evidence/{evidenceId}/file",
    operationId: "telechargerJustificatif",
    summary: "Fichier de la pièce, déchiffré (pièce jointe, jamais mis en cache)",
    tags: ["justificatifs"],
    auth: true,
    responses: { 200: { description: "Fichier" }, 404: { description: "Pièce inconnue" } },
  },
  {
    method: "delete",
    path: "/v1/profiles/me/evidence/{evidenceId}",
    operationId: "supprimerJustificatif",
    summary: "Supprime une pièce",
    tags: ["justificatifs"],
    auth: true,
    responses: { 204: { description: "Supprimée" }, 404: { description: "Pièce inconnue" } },
  },
  {
    method: "put",
    path: "/v1/profiles/me/photo",
    operationId: "enregistrerPhoto",
    summary: "Photo du CV (JPEG ou PNG, 2 Mo), chiffrée, jamais envoyée à l'IA (ADR 0036)",
    tags: ["profil"],
    auth: true,
    responses: { 200: { description: "Photo", schema: ProfilePhoto }, 400: { description: "Refusée" } },
  },
  {
    method: "get",
    path: "/v1/profiles/me/photo",
    operationId: "photo",
    summary: "Photo du CV, en ligne",
    tags: ["profil"],
    auth: true,
    responses: { 200: { description: "Image" }, 404: { description: "Aucune photo" } },
  },
  {
    method: "delete",
    path: "/v1/profiles/me/photo",
    operationId: "supprimerPhoto",
    summary: "Supprime la photo du CV",
    tags: ["profil"],
    auth: true,
    responses: { 204: { description: "Supprimée" }, 404: { description: "Aucune photo" } },
  },
  {
    method: "get",
    path: "/internal/v1/profiles/me/photo",
    operationId: "photoInterne",
    summary: "Photo de l'utilisateur, pour le CV exporté (jeton de l'utilisateur relayé)",
    tags: ["interne"],
    auth: true,
    responses: { 200: { description: "Image" }, 404: { description: "Aucune photo" } },
  },
  {
    method: "get",
    path: "/internal/v1/profiles/me/evidence",
    operationId: "justificatifsInternes",
    summary: "Pièces de l'utilisateur, pour l'annexe du CV (jeton de l'utilisateur relayé)",
    tags: ["interne"],
    auth: true,
    responses: { 200: { description: "Pièces", schema: z.array(Evidence) } },
  },
  {
    method: "get",
    path: "/internal/v1/profiles/me/evidence/{evidenceId}/file",
    operationId: "fichierJustificatifInterne",
    summary: "Fichier d'une pièce de l'utilisateur, pour l'annexe du CV (jeton de l'utilisateur relayé)",
    tags: ["interne"],
    auth: true,
    responses: { 200: { description: "Fichier" }, 404: { description: "Pièce inconnue" } },
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

const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: EVIDENCE_MAX_BYTES, files: 1, fields: 3 },
});

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_MAX_BYTES, files: 1, fields: 0 },
});

function receivePhoto(req: Request, res: Response, next: NextFunction) {
  photoUpload.single("photo")(req, res, (err: unknown) =>
    next(
      err ? new AppError("fichier_refuse", 400, "La photo dépasse 2 Mo ou n'est pas acceptée.") : undefined,
    ),
  );
}

function receiveEvidence(req: Request, res: Response, next: NextFunction) {
  evidenceUpload.single("piece")(req, res, (err: unknown) =>
    next(
      err ? new AppError("fichier_refuse", 400, "Le fichier dépasse 5 Mo ou n'est pas accepté.") : undefined,
    ),
  );
}

/** Pièce exposée : `current` dit si l'élément visé porte encore le libellé enregistré au dépôt. */
const evidenceDto = (row: EvidenceRow, latest: StoredRow | undefined) => ({
  id: row.id,
  target: row.target,
  kind: row.kind,
  label: row.label,
  fileName: row.fileName,
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
  anchor: row.anchor,
  current: latest !== undefined && evidenceAnchor(latest.profile, row.target) === row.anchor,
  createdAt: row.createdAt.toISOString(),
});

export function registerRoutes(app: Express, { store, verifier, logger, llm, evidenceKey }: RouteDeps): void {
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
    if (!req.file) throw new AppError("fichier_absent", 400, "Choisissez un fichier PDF à importer.");
    let text: string;
    try {
      text = await extractPdfText(new Uint8Array(req.file.buffer));
    } catch (error) {
      if (error instanceof PdfImportError) throw new AppError("pdf_illisible", 400, error.publicMessage);
      throw error;
    }
    // Claude si un modèle est configuré ; sinon, ou s'il est en panne, extraction par règles (ADR 0038).
    let extracted;
    let method: "ia" | "regles" = "regles";
    if (llm && llm.kind === "ia") {
      try {
        extracted = (await extractProfile(llm, text)).profile;
        method = "ia";
      } catch (error) {
        logger.warn({ event: "import_echec", errorType: (error as Error)?.name }, "import");
      }
    }
    extracted ??= rulesProfile(text);
    // Tout élément extrait doit se retrouver dans le texte du PDF.
    const { profile, dropped } = groundExtraction(extracted, text);
    logger.info({ event: "import_cv", dropped, method }, "import");
    res.json({ profile, dropped, method });
  });

  // --- Intervieweuse de profil (ADR 0028, rôle 1) : l'IA propose, le candidat valide. -------------------

  /** Fournisseur prêt, ou 503 explicite (aucun fournisseur configuré, panne, budget atteint). */
  const assistant = () => {
    if (!llm)
      throw new AppError("assistant_indisponible", 503, "L'assistant n'est pas disponible sur ce serveur.");
    return llm;
  };
  const unavailable = (error: unknown) => {
    if (error instanceof AssistUnavailableError) {
      logger.warn({ event: "assistant_indisponible", reason: error.reason }, "assistant");
      return new AppError(
        "assistant_indisponible",
        503,
        "L'assistant est indisponible pour le moment. Réessayez dans un instant.",
      );
    }
    return error;
  };

  app.post("/v1/profiles/me/interview", auth, user, async (req, res) => {
    const { topic } = parseInput(ProfileInterviewRequest, req.body ?? {});
    const latest = await store.latest(me(res));
    if (!latest) throw new AppError("profil_absent", 409, "Enregistrez d'abord votre profil.");
    try {
      const result = await interviewQuestions(assistant(), latest.profile, topic);
      logger.info(
        { event: "assistant", role: "entretien-profil", questions: result.questions.length },
        "assistant",
      );
      res.json(result);
    } catch (error) {
      throw unavailable(error);
    }
  });

  app.post("/v1/profiles/me/interview/answer", auth, user, async (req, res) => {
    const input = parseInput(ProfileAnswer, req.body);
    const latest = await store.latest(me(res));
    if (!latest) throw new AppError("profil_absent", 409, "Enregistrez d'abord votre profil.");
    try {
      const result = await factProposals(assistant(), latest.profile, input);
      logger.info(
        {
          event: "assistant",
          role: "faits-reponse",
          proposals: result.proposals.length,
          dropped: result.dropped,
        },
        "assistant",
      );
      res.json(result);
    } catch (error) {
      throw unavailable(error);
    }
  });

  // --- Pièces justificatives (ADR 0027) : comptes seulement, chiffrées, jamais journalisées ni envoyées à l'IA.

  const account = requireRole("candidate", "admin");

  app.get("/v1/profiles/me/evidence", auth, account, async (_req, res) => {
    const [rows, latest] = await Promise.all([store.evidence(me(res)), store.latest(me(res))]);
    res.json(rows.map((row) => evidenceDto(row, latest)));
  });

  app.post("/v1/profiles/me/evidence", auth, account, receiveEvidence, async (req, res) => {
    const userId = me(res);
    const fields = parseInput(EvidenceUpload, req.body);
    if (!req.file) throw new AppError("fichier_absent", 400, "Choisissez le fichier à joindre.");
    const bytes = new Uint8Array(req.file.buffer);
    const mimeType = sniffMime(bytes);
    if (!mimeType)
      throw new AppError("fichier_refuse", 400, "Seuls les fichiers PDF, PNG et JPEG sont acceptés.");
    const latest = await store.latest(userId);
    if (!latest) throw new AppError("profil_absent", 409, "Enregistrez d'abord votre profil.");
    const anchor = evidenceAnchor(latest.profile, fields.target);
    if (!anchor) throw new AppError("element_inconnu", 409, "Cet élément n'existe pas dans votre profil.");
    if ((await store.evidenceCount(userId)) >= EVIDENCE_MAX_COUNT)
      throw new AppError(
        "limite_atteinte",
        409,
        `Vous avez déjà ${EVIDENCE_MAX_COUNT} pièces : supprimez-en une.`,
      );
    const row = await store.addEvidence(userId, {
      ...fields,
      fileName: safeFileName(req.file.originalname, mimeType),
      mimeType,
      sizeBytes: bytes.byteLength,
      anchor,
      ...encrypt(evidenceKey, bytes),
    });
    logger.info({ event: "justificatif_ajoute", kind: fields.kind, mimeType }, "justificatifs");
    res.status(201).json(evidenceDto(row, latest));
  });

  /** Envoie le fichier déchiffré : en pièce jointe, jamais en cache, type imposé. */
  const sendEvidence = async (req: Request, res: Response) => {
    const { evidenceId } = parseInput(EvidenceParam, req.params);
    const piece = await store.evidenceFile(me(res), evidenceId);
    if (!piece) throw notFound("Cette pièce n'existe pas.");
    res
      .status(200)
      .set({
        "Content-Type": piece.mimeType,
        "Content-Disposition": `attachment; filename="${piece.fileName}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(decrypt(evidenceKey, piece));
  };

  app.get("/v1/profiles/me/evidence/:evidenceId/file", auth, account, sendEvidence);

  app.delete("/v1/profiles/me/evidence/:evidenceId", auth, account, async (req, res) => {
    const { evidenceId } = parseInput(EvidenceParam, req.params);
    if (!(await store.deleteEvidence(me(res), evidenceId))) throw notFound("Cette pièce n'existe pas.");
    logger.info({ event: "justificatif_supprime" }, "justificatifs");
    res.status(204).end();
  });

  app.get("/v1/admin/stats", auth, requireRole("admin"), async (_req, res) => {
    logger.info({ event: "admin_acces", route: "/v1/admin/stats" }, "administration");
    const counters = await store.stats();
    res.json({
      service: "profiles",
      counters,
      votes: await store.voteStats(),
      ...(llm instanceof BudgetedProvider && { llm: await llm.summary() }),
    });
  });

  app.post("/v1/assistants/feedback", auth, user, async (req, res) => {
    const { role, vote, providerKind } = parseInput(AssistantVote, req.body);
    await store.vote(role, vote, providerKind);
    res.status(204).end();
  });

  // --- Interne (ADR 0012, point 3) ---------------------------------------------------------------

  app.get("/internal/v1/profiles/me", auth, user, async (_req, res) => {
    res.json(await current(me(res)));
  });

  // --- Photo du CV (ADR 0036) : comptes seulement, chiffrée, jamais dans le profil ni envoyée à l'IA. ---

  const photoDto = (p: { mimeType: string; sizeBytes: number; updatedAt: Date }) => ({
    mimeType: p.mimeType,
    sizeBytes: p.sizeBytes,
    updatedAt: p.updatedAt.toISOString(),
  });

  app.put("/v1/profiles/me/photo", auth, account, receivePhoto, async (req, res) => {
    if (!req.file) throw new AppError("fichier_absent", 400, "Choisissez une photo.");
    const bytes = new Uint8Array(req.file.buffer);
    const mimeType = sniffMime(bytes);
    if (mimeType !== "image/jpeg" && mimeType !== "image/png")
      throw new AppError("fichier_refuse", 400, "Seules les photos JPEG et PNG sont acceptées.");
    const row = await store.setPhoto(me(res), {
      mimeType,
      sizeBytes: bytes.byteLength,
      ...encrypt(evidenceKey, bytes),
    });
    logger.info({ event: "photo_enregistree", mimeType }, "photo");
    res.json(photoDto(row));
  });

  /** Photo déchiffrée, affichée en ligne, jamais en cache. */
  const sendPhoto = async (_req: Request, res: Response) => {
    const photo = await store.photo(me(res));
    if (!photo) throw notFound("Aucune photo enregistrée.");
    res
      .status(200)
      .set({
        "Content-Type": photo.mimeType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Photo-Updated": photo.updatedAt.toISOString(),
      })
      .send(decrypt(evidenceKey, photo));
  };
  app.get("/v1/profiles/me/photo", auth, account, sendPhoto);

  app.delete("/v1/profiles/me/photo", auth, account, async (_req, res) => {
    if (!(await store.deletePhoto(me(res)))) throw notFound("Aucune photo enregistrée.");
    res.status(204).end();
  });

  // Annexe du CV (letters-export) : jeton de l'utilisateur relayé, il ne lit que ses propres pièces.
  app.get("/internal/v1/profiles/me/photo", auth, account, sendPhoto);
  app.get("/internal/v1/profiles/me/evidence", auth, account, async (_req, res) => {
    const [rows, latest] = await Promise.all([store.evidence(me(res)), store.latest(me(res))]);
    res.json(rows.map((row) => evidenceDto(row, latest)));
  });
  app.get("/internal/v1/profiles/me/evidence/:evidenceId/file", auth, account, sendEvidence);

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
