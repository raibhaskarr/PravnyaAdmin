import { z } from "zod";

export const createDomainSchema = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  sortOrder: z.number().int().default(0)
});

export const updateDomainSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional()
});

export const createDisciplineSchema = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200)
});

export const updateDisciplineSchema = z.object({
  name: z.string().min(1).max(200).optional()
});

export const createSkillSchema = z.object({
  domainId: z.string().uuid(),
  key: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  defaultDisciplineId: z.string().uuid().optional(),
  supportsItems: z.boolean().default(false),
  sourceTag: z.enum(["PROD", "FRAMEWORK"]).default("FRAMEWORK")
});

export const updateSkillSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).nullable().optional(),
  defaultDisciplineId: z.string().uuid().nullable().optional(),
  supportsItems: z.boolean().optional(),
  sourceTag: z.enum(["PROD", "FRAMEWORK"]).optional()
});

export const createItemSchema = z.object({
  key: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200),
  semanticGroup: z.string().min(1).max(100).default("OTHER"),
  aliases: z.array(z.string()).optional()
});

export const updateItemSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  semanticGroup: z.string().min(1).max(100).optional(),
  aliases: z.array(z.string()).optional()
});

export const idParamsSchema = z.object({ id: z.string().uuid() });
export const skillIdParamsSchema = z.object({ skillId: z.string().uuid() });
