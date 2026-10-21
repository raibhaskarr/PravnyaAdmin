import { z } from "zod";

const pdfSourceSchema = z.object({ kind: z.literal("pdf"), base64: z.string().min(1) });
const imageSourceSchema = z.object({ kind: z.literal("image"), base64: z.string().min(1), mimeType: z.string().min(1).max(100) });

// No CSV source here -- that's a staff power-tool shape (paste a goal list), not something an
// onboarding parent would have. PDF/photo only.
export const parentIepExtractSchema = z.object({
  source: z.discriminatedUnion("kind", [pdfSourceSchema, imageSourceSchema])
});

export const parentIepParamsSchema = z.object({ kidId: z.string().uuid() });

// What the frontend already has from the extract response (IepGoalCandidate) -- echoed back
// verbatim for the ones the parent wants to keep, not re-derived. No per-field editing in this
// flow (no review UI), so the shape the frontend sends is exactly the shape it received.
const acceptedCandidateSchema = z.object({
  canonicalSkillId: z.string().uuid(),
  disciplineId: z.string().uuid().nullable(),
  modality: z.enum(["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL"]).nullable(),
  title: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1),
  sourceExcerpt: z.string().max(2000)
});

export const acceptIepGoalsSchema = z.object({
  candidates: z.array(acceptedCandidateSchema).min(1).max(30)
});

export type ParentIepExtractInput = z.infer<typeof parentIepExtractSchema>;
export type AcceptIepGoalsInput = z.infer<typeof acceptIepGoalsSchema>;
