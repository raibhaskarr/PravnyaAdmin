import type { Prisma, VisualScheduleTemplate } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { AppError, badRequest, forbidden, notFound } from "../../common/errors/AppError";
import { draftScheduleWithAi } from "./visualSchedules.ai";
import { assertPhotosFitTemplate, copySteps, present } from "./visualSchedules.present";
import { STEP_LIMITS, type Kind, type Step } from "./visualSchedules.schemas";
import { TEMPLATES } from "./visualSchedules.templates";

// Picture schedule templates: Pravnya's (the built-in ones plus any a superadmin adds) and each
// centre's own. Therapists and parents start from one; what they get is a copy to change freely.

type Language = "en" | "hi";
export type TemplateFields = { title: string; kind: Kind; language: Language; steps: Step[]; days: string[]; time: string | null };

/** Creates the built-in Pravnya templates (English and Hindi) that don't exist yet. Never overwrites. */
export async function ensureBuiltInTemplates() {
  const existing = new Set((await prisma.visualScheduleTemplate.findMany({ where: { builtInKey: { not: null } }, select: { builtInKey: true } })).map((t) => t.builtInKey));
  const missing = TEMPLATES.flatMap((t) => (["en", "hi"] as const).map((lang) => ({ t, lang, key: `${t.id}:${lang}` }))).filter((x) => !existing.has(x.key));
  if (!missing.length) return;
  await prisma.visualScheduleTemplate.createMany({
    data: missing.map(({ t, lang, key }) => ({
      builtInKey: key,
      title: t.title[lang],
      kind: t.kind,
      language: lang,
      createdByName: "Pravnya",
      steps: t.steps.map((s) => ({ key: crypto.randomUUID(), label: s[lang], say: null, minutes: s.minutes ?? null, picture: { kind: "symbol", symbolId: s.symbolId } })) as unknown as Prisma.InputJsonValue
    })),
    skipDuplicates: true
  });
}

function canEdit(user: AuthUser, t: VisualScheduleTemplate) {
  if (user.role === "SUPERADMIN") return t.tenantId === null;
  if (t.tenantId !== user.tenantId) return false;
  if (user.role === "TENANT_ADMIN") return true;
  return user.role === "THERAPIST" && t.createdByUserId === user.id;
}

function view(t: VisualScheduleTemplate, editable = false) {
  return {
    id: t.id,
    scope: t.tenantId ? ("CENTRE" as const) : ("PRAVNYA" as const),
    builtIn: t.builtInKey !== null,
    builtInKey: t.builtInKey,
    title: t.title,
    kind: t.kind,
    language: t.language,
    steps: present(t.steps as unknown as Step[]),
    days: t.days,
    time: t.time,
    createdByName: t.createdByName,
    canEdit: editable,
    updatedAt: t.updatedAt
  };
}

function assertStepCount(kind: Kind, steps: Step[]) {
  const [min, max] = STEP_LIMITS[kind];
  if (steps.length < min || steps.length > max) throw badRequest(kind === "FIRST_THEN" ? "First/Then has exactly 2 steps" : `This template needs ${min} to ${max} steps`);
}

/** Pravnya's templates, plus a centre's when given; English/Hindi or both. */
async function visible(tenantId: string | null, language?: Language) {
  await ensureBuiltInTemplates();
  return prisma.visualScheduleTemplate.findMany({
    where: { archived: false, OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])], ...(language ? { language } : {}) },
    // A centre's own first, then Pravnya's; newest first within each.
    orderBy: [{ tenantId: { sort: "asc", nulls: "last" } }, { builtInKey: { sort: "asc", nulls: "first" } }, { updatedAt: "desc" }]
  });
}

async function findEditable(user: AuthUser, id: string) {
  const t = await prisma.visualScheduleTemplate.findFirst({ where: { id, archived: false } });
  if (!t) throw notFound("Template not found");
  if (!canEdit(user, t)) throw forbidden(t.tenantId ? "Only a centre admin or whoever made this template can change it" : "Only Pravnya can change Pravnya's templates");
  return t;
}

async function authorName(user: AuthUser) {
  const [u, therapist] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } }),
    prisma.therapist.findUnique({ where: { userId: user.id }, select: { name: true } })
  ]);
  return user.role === "SUPERADMIN" ? "Pravnya" : (therapist?.name ?? u.name);
}

/** A template a child's schedule can be made from: Pravnya's, or this centre's. */
export async function findTemplateForUse(id: string, tenantId: string | null) {
  const t = await prisma.visualScheduleTemplate.findFirst({ where: { id, archived: false } });
  if (!t || (t.tenantId !== null && t.tenantId !== tenantId)) throw notFound("Template not found");
  return t;
}

export const scheduleTemplatesService = {
  async list(user: AuthUser, language?: Language) {
    const rows = await visible(user.role === "SUPERADMIN" ? null : user.tenantId, language);
    return rows.map((t) => view(t, canEdit(user, t)));
  },

  async listForParent(parentId: string, kidId: string, language?: Language) {
    const kid = await assertOwnsKid(parentId, kidId);
    return (await visible(kid.tenantId, language)).map((t) => view(t));
  },

  async create(user: AuthUser, input: TemplateFields) {
    const tenantId = user.role === "SUPERADMIN" ? null : user.tenantId!;
    assertStepCount(input.kind, input.steps);
    await assertPhotosFitTemplate(tenantId, input.steps);
    const t = await prisma.visualScheduleTemplate.create({
      data: { tenantId, ...input, steps: input.steps as unknown as Prisma.InputJsonValue, createdByUserId: user.id, createdByName: await authorName(user) }
    });
    return view(t, true);
  },

  async draft(user: AuthUser, input: { kind: Kind | null; language: Language; request: string }) {
    const drafted = await draftScheduleWithAi({ kidName: "the child", kind: input.kind, language: input.language, request: input.request, tenantId: user.tenantId ?? "pravnya", featureId: "schedule-template-draft" });
    if (!drafted) throw new AppError(503, "AI_UNAVAILABLE", "Pravnya couldn't draft this right now. Try again, or start blank.");
    return this.create(user, { title: drafted.title, kind: drafted.kind, language: input.language, steps: drafted.steps, days: drafted.days, time: drafted.time });
  },

  async edit(user: AuthUser, id: string, input: Partial<TemplateFields>) {
    const t = await findEditable(user, id);
    const kind = input.kind ?? t.kind;
    const steps = input.steps ?? (t.steps as unknown as Step[]);
    assertStepCount(kind, steps);
    if (input.steps) await assertPhotosFitTemplate(t.tenantId, input.steps);
    const row = await prisma.visualScheduleTemplate.update({
      where: { id },
      data: { title: input.title, kind: input.kind, language: input.language, days: input.days, time: input.time, steps: input.steps as unknown as Prisma.InputJsonValue | undefined }
    });
    return view(row, true);
  },

  /** Built-in ones are hidden rather than deleted, so they don't come back. */
  async remove(user: AuthUser, id: string) {
    const t = await findEditable(user, id);
    if (t.builtInKey) await prisma.visualScheduleTemplate.update({ where: { id }, data: { archived: true } });
    else await prisma.visualScheduleTemplate.delete({ where: { id } });
  },

  /** Saves a child's schedule as a centre template. Photos of the child are left out (they're that child's). */
  async fromSchedule(user: AuthUser, scheduleId: string, title?: string) {
    if (!user.tenantId) throw forbidden();
    const schedule = await prisma.visualSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw notFound("Schedule not found");
    await assertCanAccessKid(user, schedule.kidId);
    const { steps, droppedPhotos } = await copySteps(schedule.steps as unknown as Step[], (a) => a.kidId === null && a.tenantId === user.tenantId);
    const t = await prisma.visualScheduleTemplate.create({
      data: {
        tenantId: user.tenantId,
        title: title ?? schedule.title,
        kind: schedule.kind,
        language: schedule.language,
        steps: steps as unknown as Prisma.InputJsonValue,
        days: schedule.days,
        time: schedule.time,
        createdByUserId: user.id,
        createdByName: await authorName(user)
      }
    });
    return { ...view(t, true), droppedPhotos };
  }
};
