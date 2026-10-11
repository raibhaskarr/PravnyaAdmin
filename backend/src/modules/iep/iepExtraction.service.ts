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
import type { IepSource } from "./iepExtraction.schemas";

// Unlike extractEvidenceService (which matches free text against a kid's own, already-small,
// already-curated set of ACTIVE goals), this matches against the FULL canonical taxonomy -- these
// are prospective NEW goals, so every one of the ~148 skills is a valid candidate. Schema-refined
// against the real id set, same discipline as goalSkillSuggestion.service.ts's single-title
// matcher and extractEvidenceService's goal matcher: the model physically cannot return an id
// outside the real taxonomy.
const SYSTEM_PROMPT =
  "You are helping a therapist turn an IEP (Individualized Education Plan) document into a list " +
  "of structured goals, each matched to the single best-fitting entry in a shared clinical skill " +
  "taxonomy. The source may be the raw text of an IEP document, or a list of goal titles a " +
  "therapist already wrote down (e.g. from a spreadsheet).\n\n" +
  "For each distinct goal you find, extract: which candidate skill it best matches (pick exactly " +
  "one canonicalSkillId from the list provided -- never invent an id that isn't in the candidate " +
  "list, and if nothing is a close match, still pick the closest one); a short, clear goal title " +
  "in plain language (clean up the source wording if needed, but don't invent a goal that isn't " +
  "actually there); a confidence score; and the exact excerpt of the source text that goal came " +
  "from, so the therapist can see exactly what you based it on.\n\n" +
  "Extract every distinct goal you find, up to 30. Don't merge clearly separate goals into one, " +
  "and don't split one goal into several just because it mentions multiple examples.\n\n" +
  "Respond with ONLY a single JSON object, no markdown fences, no prose before or after it, in " +
  'exactly this shape: {"goals": [{"canonicalSkillId": string, "title": string, "confidence": ' +
  'number between 0 and 1, "sourceExcerpt": string}]}. "goals" must be an empty array if no real ' +
  "goals are described in the source at all.";

function buildSchema(validSkillIds: Set<string>) {
  const goalItem = z.object({
    canonicalSkillId: z.string().refine((id) => validSkillIds.has(id), { message: "Must be one of the provided candidate skill ids" }),
    title: z.string().min(1).max(300),
    confidence: z.number().min(0).max(1),
    sourceExcerpt: z.string().min(1).max(500)
  });
  return z.object({ goals: z.array(goalItem).max(30) });
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
    const result = await parser.getText();
    return (result.text ?? "").trim();
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
  // normal POST /goals endpoint, once per approved candidate. The uploaded PDF/photo itself is
  // only ever forwarded to the AI provider for this one request (or, for PDF, parsed locally for
  // its text) -- never written to disk or kept anywhere after the response.
  async extract(user: AuthUser, kidId: string, source: IepSource): Promise<{ candidates: IepGoalCandidate[] } | { error: string }> {
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

    const validIds = new Set(skills.map((s) => s.id));
    const candidateLines = skills
      .map((s) => `${s.id}\t${s.domain.name} > ${s.name}${s.measurementType ? ` [measures: ${s.measurementType.toLowerCase()}]` : ""}`)
      .join("\n");
    const candidateBlock = `Candidate skills (id, domain > name):\n${candidateLines}`;

    let content: AiContentPart[];
    if (source.kind === "pdf") {
      const text = await extractPdfText(source.base64);
      if (!text) return { error: "Couldn't read any text from this PDF -- it may be a scanned image. Try uploading it as a photo instead." };
      content = [{ type: "text", text: `IEP document text:\n${text}\n\n${candidateBlock}` }];
    } else if (source.kind === "csv") {
      const goalListText = csvToGoalListText(source.csvText);
      if (!goalListText) return { error: "No rows found -- make sure the CSV has a \"title\" column with at least one goal." };
      content = [{ type: "text", text: `Goal list (one per line):\n${goalListText}\n\n${candidateBlock}` }];
    } else {
      content = [
        {
          type: "text",
          text: `The attached image is a page from an IEP document -- read the text in it and extract goals exactly as you would from typed text.\n\n${candidateBlock}`
        },
        { type: "image", data: { base64: source.base64 }, mimeType: source.mimeType }
      ];
    }

    const result = await orchestrator.executeStructured({
      name: "pravnyaadmin.extract-iep-goals",
      request: {
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        // Attributed to the kid's own tenant, not the (possibly guest) therapist's -- see
        // kidAccess.ts on cross-tenant support-team links.
        executionContext: createExecutionContext({ productId: "pravnyaadmin", tenantId: kid.tenantId, featureId: "extract-iep-goals" })
      },
      schema: buildSchema(validIds),
      maxRepairAttempts: 1
    });

    if (!result.success) return { error: "Couldn't read goals from this document right now -- try again, or add goals manually." };

    const tenantDisciplines = await prisma.tenantDiscipline.findMany({ where: { tenantId: kid.tenantId }, select: { disciplineId: true } });
    const enabledDisciplineIds = tenantDisciplines.map((d) => d.disciplineId);

    const skillById = new Map(skills.map((s) => [s.id, s]));
    const candidates: IepGoalCandidate[] = result.value.goals.map((g) => {
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

    return { candidates };
  }
};
