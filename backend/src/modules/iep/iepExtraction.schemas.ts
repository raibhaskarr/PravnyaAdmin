import { z } from "zod";

const pdfSourceSchema = z.object({ kind: z.literal("pdf"), base64: z.string().min(1) });
const imageSourceSchema = z.object({ kind: z.literal("image"), base64: z.string().min(1), mimeType: z.string().min(1).max(100) });
const csvSourceSchema = z.object({ kind: z.literal("csv"), csvText: z.string().min(1).max(200_000) });

export const extractIepGoalsSchema = z.object({
  kidId: z.string().uuid(),
  source: z.discriminatedUnion("kind", [pdfSourceSchema, imageSourceSchema, csvSourceSchema])
});

export type ExtractIepGoalsInput = z.infer<typeof extractIepGoalsSchema>;
export type IepSource = ExtractIepGoalsInput["source"];
