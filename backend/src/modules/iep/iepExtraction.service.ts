import { z } from "zod";
import { createExecutionContext } from "@pravnix/ai-core";
import type { AiContentPart } from "@pravnix/ai-core";
import { parse as parseCsv } from "csv-parse/sync";
import { PDFParse } from "pdf-parse";
import { Modality, PocMeasurementType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { deriveDisciplineAndModality } from "../ai/goalSkillSuggestion.service";
import { orchestrator } from "../ai/ai.platform";
import { EVIDENCE_FIELD_INSTRUCTIONS, MODALITIES, OUTCOMES, SUPPORT_LEVELS, evidenceItemSchema, type EvidenceCandidate } from "../ai/evidenceFields.shared";
import type { IepSource } from "./iepExtraction.schemas";

// An IEP document commonly describes two different things at once: narrative progress on goals
// this kid already has, and a structured plan introducing goals that aren't tracked yet. Rather
// than treat everything as a new goal (which duplicates what's already being tracked), this asks
// the model to classify each distinct thing it finds:
//  - STATUS UPDATE -- matches one of this kid's own existing active goals -> extracted with the
//    same evidence fields extractEvidenceService uses, so it saves through the exact same
//    POST /goals/:goalId/evidence endpoint a manually logged note would.
//  - NEW GOAL -- doesn't match anything this kid already has tracked -> matched against the FULL
//    canonical taxonomy (unlike evidence matching, these are prospective new goals, so every one
//    of the ~148 skills is a valid candidate), same discipline as goalSkillSuggestion.service.ts's
//    single-title matcher: the model physically cannot return an id outside the real taxonomy.
function buildSystemPrompt(hasActiveGoals: boolean): string {
  const statusUpdateSection = hasActiveGoals
    ? "1. STATUS UPDATE -- the source is reporting progress, performance, or status on a goal " +
      "that matches one of \"This kid's existing active goals\" below. Extract it as a status " +
      "update against that goal's id, using the evidence fields described below.\n"
    : "1. STATUS UPDATE -- not applicable here: this kid has no existing active goals yet, so " +
      "nothing can be a status update. Always leave statusUpdates empty.\n";

  return (
    "You are helping a therapist turn an IEP (Individualized Education Plan) document into " +
    "structured updates. The source may be the raw text of an IEP document, a photo/scan of one, " +
    "or a list of goal titles a therapist already wrote down (e.g. from a spreadsheet).\n\n" +
    "Decide, for each distinct goal or topic the source describes, which of two things it is:\n\n" +
    statusUpdateSection +
    "2. NEW GOAL -- the source describes a goal or plan that does NOT match any existing active " +
    "goal (or there are none). Extract it as a new goal, matched to the single best-fitting entry " +
    "in the shared clinical skill taxonomy in \"Candidate skills\" below (pick exactly one " +
    "canonicalSkillId -- never invent an id that isn't in the candidate list, and if nothing is a " +
    "close match, still pick the closest one).\n\n" +
    "Decide per distinct goal/topic mentioned, not per page or section -- a single document " +
    "commonly contains both narrative progress notes about ongoing goals and a structured plan " +
    "introducing new ones.\n\n" +
    "-- Status update fields --\n" +
    "For each status update, extract: which existing goal it's about (goalId); itemHint -- the " +
    "ONE specific, concrete item/word/task actually involved (e.g. \"Apple\", \"Ball\", \"kick\"), " +
    "never a category (e.g. never \"fruits\"), null if the source only describes general practice " +
    "with no specific item named; the outcome; the support level the child needed; the modality " +
    "the child actually used to respond (verbal/manual_sign/aac/written/gestural/not_applicable/" +
    "unknown -- infer only from what the source actually says); a confidence score; and the exact " +
    "excerpt of the source that status update came from, so the therapist can see exactly what " +
    "you based it on.\n\n" +
    EVIDENCE_FIELD_INSTRUCTIONS +
    "\n\n" +
    "-- New goal fields --\n" +
    "For each new goal, extract: which candidate skill it best matches (canonicalSkillId); a " +
    "short, clear goal title in plain language (clean up the source wording if needed, but don't " +
    "invent a goal that isn't actually there); a confidence score; and the exact excerpt of the " +
    "source text that goal came from.\n\n" +
    "Extract every distinct status update or new goal you find, up to 15 status updates and 30 " +
    "new goals. Don't merge clearly separate items into one, and don't split one item into " +
    "several just because it mentions multiple examples.\n\n" +
    "Respond with ONLY a single JSON object, no markdown fences, no prose before or after it, in " +
    'exactly this shape: {"statusUpdates": [{"goalId": string, "itemHint": string or null, ' +
    `"outcome": one of [${OUTCOMES.map((o) => `"${o}"`).join(",")}], "supportLevel": one of ` +
    `[${SUPPORT_LEVELS.map((s) => `"${s}"`).join(",")}], "modality": one of [${MODALITIES.map((m) => `"${m}"`).join(",")}], ` +
    '"measurementValue": number or null, "measurementUnit": string or null, "measurementBoolean": ' +
    'boolean or null, "measurementText": string or null, "confidence": number between 0 and 1, ' +
    '"excerpt": string}], "newGoals": [{"canonicalSkillId": string, "title": string, ' +
    '"confidence": number between 0 and 1, "sourceExcerpt": string}]}. Both arrays must be empty ' +
    "if nothing of that kind is described."
  );
}

function buildSchema(validSkillIds: Set<string>, validGoalIds: Set<string>) {
  const newGoalItem = z.object({
    canonicalSkillId: z.string().refine((id) => validSkillIds.has(id), { message: "Must be one of the provided candidate skill ids" }),
    title: z.string().min(1).max(300),
    confidence: z.number().min(0).max(1),
    sourceExcerpt: z.string().min(1).max(500)
  });
  return z.object({
    statusUpdates: z.array(evidenceItemSchema(validGoalIds)).max(15),
    newGoals: z.array(newGoalItem).max(30)
  });
}

export interface IepGoalCandidate {
  canonicalSkillId: string;
  skillName: string;
  domainName: string;
  measurementType: PocMeasurementType | null;
  disciplineId: string | null;
  modality: Modality | null;
  title: string;
  confidence: number;
  sourceExcerpt: string;
}

// Returns null (never throws) on a file that isn't actually a readable PDF -- a bad/corrupt
// upload is an expected user error, not a 500.
async function extractPdfText(base64: string): Promise<string | null> {
  const buffer = Buffer.from(base64, "base64");
  const parser = new PDFParse({ data: buffer });
  try {
    // pdf-parse's default pageJoiner inserts "-- N of total --" boilerplate between pages, which
    // inflates the text length for every multi-page PDF regardless of real content -- disabled so
    // the usable-text check below (isUsablePdfText) measures only actual extracted text.
    const result = await parser.getText({ pageJoiner: "" });
    return (result.text ?? "").trim();
  } catch {
    return null;
  } finally {
    await parser.destroy();
  }
}

// A scanned/photographed document (e.g. CamScanner) wrapped in a PDF has no real embedded text --
// pdf-parse has no OCR, so getText() comes back empty, or (common with scanner apps) non-empty
// but useless: just the app's own watermark string. Either way there's nothing for the AI to
// extract goals from, so this is the trigger for falling back to rendering pages as images and
// routing through the same multimodal path as "photo" uploads.
const MIN_USABLE_PDF_TEXT_LENGTH = 60;
function isUsablePdfText(text: string | null): text is string {
  return !!text && text.replace(/\s+/g, "").length >= MIN_USABLE_PDF_TEXT_LENGTH;
}

// Renders each page to a PNG raster image via pdf-parse's own getScreenshot() (backed by
// @napi-rs/canvas, a prebuilt-binary transitive dependency of pdf-parse -- no extra install/build
// toolchain needed). Capped at maxPages to bound multimodal message size/cost for long documents.
// Returns null (never throws) on a file that isn't actually a readable PDF.
async function renderPdfPagesAsImages(base64: string, maxPages = 5): Promise<string[] | null> {
  const buffer = Buffer.from(base64, "base64");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getScreenshot({ first: maxPages, imageBuffer: true, imageDataUrl: false });
    const pages = result.pages.filter((p) => p.data && p.data.length > 0);
    if (pages.length === 0) return null;
    return pages.map((p) => Buffer.from(p.data).toString("base64"));
  } catch {
    return null;
  } finally {
    await parser.destroy();
  }
}

// One required "title" column, optional "notes" for extra matching context -- rows become a
// plain numbered list and flow through the exact same text-extraction path as a PDF. CSV is just
// another way to produce input text, not a separate pipeline. relax_column_count tolerates ragged
// real-world CSVs (e.g. an unquoted comma in a notes field) rather than rejecting the whole file;
// genuinely unparseable input (not CSV at all) returns null instead of throwing.
function csvToGoalListText(csvText: string): string | null {
  let rows: Record<string, string>[];
  try {
    rows = parseCsv(csvText, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true }) as Record<string, string>[];
  } catch {
    return null;
  }
  return rows
    .map((row, i) => {
      const title = row.title ?? row.Title ?? "";
      const notes = row.notes ?? row.Notes ?? "";
      return title ? `${i + 1}. ${title}${notes ? ` -- ${notes}` : ""}` : null;
    })
    .filter((line): line is string => line !== null)
    .join("\n");
}

export const iepExtractionService = {
  // Never persists anything -- just returns candidates for review. Saving happens through the
  // normal POST /goals (new goals) or POST /goals/:goalId/evidence (status updates) endpoints,
  // once per approved candidate. The uploaded PDF/photo itself is only ever forwarded to the AI
  // provider for this one request (or, for PDF, parsed locally for its text) -- never written to
  // disk or kept anywhere after the response.
  async extract(user: AuthUser, kidId: string, source: IepSource): Promise<{ statusUpdates: EvidenceCandidate[]; newGoals: IepGoalCandidate[] } | { error: string }> {
    const kid = await assertCanAccessKid(user, kidId);

    const skills = await prisma.canonicalSkill.findMany({
      select: {
        id: true,
        name: true,
        defaultDisciplineId: true,
        supportedModalities: true,
        measurementType: true,
        domain: { select: { name: true } }
      }
    });
    if (skills.length === 0) return { error: "No canonical skills exist yet." };

    const activeGoals = await prisma.goal.findMany({
      where: { kidId, status: "ACTIVE" },
      select: { id: true, title: true, canonicalSkill: { select: { name: true, measurementType: true } } }
    });

    const validSkillIds = new Set(skills.map((s) => s.id));
    const validGoalIds = new Set(activeGoals.map((g) => g.id));

    const skillCandidateLines = skills
      .map((s) => `${s.id}\t${s.domain.name} > ${s.name}${s.measurementType ? ` [measures: ${s.measurementType.toLowerCase()}]` : ""}`)
      .join("\n");
    const skillCandidateBlock = `Candidate skills (id, domain > name):\n${skillCandidateLines}`;

    const goalCandidateBlock =
      activeGoals.length > 0
        ? `This kid's existing active goals (id, title (skill)):\n${activeGoals
            .map((g) => `${g.id}\t${g.title} (skill: ${g.canonicalSkill.name})${g.canonicalSkill.measurementType ? ` [measures: ${g.canonicalSkill.measurementType.toLowerCase()}]` : ""}`)
            .join("\n")}`
        : null;

    const candidateBlock = [goalCandidateBlock, skillCandidateBlock].filter((b): b is string => b !== null).join("\n\n");

    const imageContentFor = (pageBase64s: string[], mimeType: string): AiContentPart[] => [
      {
        type: "text",
        text: `The attached image${pageBase64s.length > 1 ? "s are pages" : " is a page"} from an IEP document -- read the text in ${
          pageBase64s.length > 1 ? "them" : "it"
        } and extract updates from it exactly as you would from typed text.\n\n${candidateBlock}`
      },
      ...pageBase64s.map((base64): AiContentPart => ({ type: "image", data: { base64 }, mimeType }))
    ];

    let content: AiContentPart[];
    if (source.kind === "pdf") {
      const text = await extractPdfText(source.base64);
      if (isUsablePdfText(text)) {
        content = [{ type: "text", text: `IEP document text:\n${text}\n\n${candidateBlock}` }];
      } else {
        // No usable embedded text (empty, or scanner-app watermark only) -- fall back to
        // rendering pages as images and reusing the proven multimodal "photo" path.
        const pageImages = await renderPdfPagesAsImages(source.base64);
        if (!pageImages) return { error: "Couldn't read any text from this PDF -- it may be a scanned image. Try uploading it as a photo instead." };
        content = imageContentFor(pageImages, "image/png");
      }
    } else if (source.kind === "csv") {
      const goalListText = csvToGoalListText(source.csvText);
      if (!goalListText) return { error: "No rows found -- make sure the CSV has a \"title\" column with at least one goal." };
      content = [{ type: "text", text: `Goal list (one per line):\n${goalListText}\n\n${candidateBlock}` }];
    } else {
      content = imageContentFor([source.base64], source.mimeType);
    }

    const result = await orchestrator.executeStructured({
      name: "pravnyaadmin.extract-iep-goals",
      request: {
        systemPrompt: buildSystemPrompt(activeGoals.length > 0),
        messages: [{ role: "user", content }],
        // Default provider cap (4000) truncates mid-JSON on a real multi-goal document -- up to
        // 30 new goals (schema max) plus 15 status updates, several with verbatim quoted excerpts,
        // can need well more than that. 8000 comfortably covers the worst case with headroom. (The
        // provider's client-level request timeout, which this call's size also strains, is fixed
        // at provider construction -- see ai.platform.ts -- not overridable per-request here.)
        options: { maxOutputTokens: 8000 },
        // Attributed to the kid's own tenant, not the (possibly guest) therapist's -- see
        // kidAccess.ts on cross-tenant support-team links.
        executionContext: createExecutionContext({ productId: "pravnyaadmin", tenantId: kid.tenantId, featureId: "extract-iep-goals" })
      },
      schema: buildSchema(validSkillIds, validGoalIds),
      maxRepairAttempts: 1
    });

    if (!result.success) return { error: "Couldn't read goals from this document right now -- try again, or add goals manually." };

    const tenantDisciplines = await prisma.tenantDiscipline.findMany({ where: { tenantId: kid.tenantId }, select: { disciplineId: true } });
    const enabledDisciplineIds = tenantDisciplines.map((d) => d.disciplineId);

    const skillById = new Map(skills.map((s) => [s.id, s]));
    const newGoals: IepGoalCandidate[] = result.value.newGoals.map((g) => {
      const skill = skillById.get(g.canonicalSkillId)!;
      const { disciplineId, modality } = deriveDisciplineAndModality(skill, enabledDisciplineIds);
      return {
        canonicalSkillId: skill.id,
        skillName: skill.name,
        domainName: skill.domain.name,
        measurementType: skill.measurementType,
        disciplineId,
        modality,
        title: g.title,
        confidence: g.confidence,
        sourceExcerpt: g.sourceExcerpt
      };
    });

    const goalById = new Map(activeGoals.map((g) => [g.id, g]));
    const statusUpdates: EvidenceCandidate[] = result.value.statusUpdates.map((e) => {
      const goal = goalById.get(e.goalId)!;
      return { ...e, goalTitle: goal.title, skillName: goal.canonicalSkill.name, measurementType: goal.canonicalSkill.measurementType };
    });

    return { statusUpdates, newGoals };
  }
};
