import type { Prisma, VisualSchedule } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { AppError, badRequest, conflict, notFound } from "../../common/errors/AppError";
import { authorFor } from "../progress-updates/progressUpdates.service";
import { SYMBOL_CREDIT } from "../symbols/symbols";
import { assertPhotosFitKid, copySteps, present } from "./visualSchedules.present";
import { findTemplateForUse } from "./scheduleTemplates.service";
import { draftScheduleWithAi } from "./visualSchedules.ai";
import { STEP_LIMITS, type EditInput, type Kind, type Step } from "./visualSchedules.schemas";
import { effectiveTiming, inIndia, LEARN_FROM_DAYS, todayStatus, type Use } from "./visualSchedules.timing";

type Language = "en" | "hi";
type Fields = { title: string; kind: Kind; language: Language; steps: Step[]; days: string[]; time: string | null; remind: boolean };

const recentUses = () => ({ where: { startedAt: { gte: new Date(Date.now() - LEARN_FROM_DAYS * 86_400_000) } }, select: { startedAt: true, completedAt: true }, orderBy: { startedAt: "desc" as const } });

function presentSchedule(s: VisualSchedule & { uses?: Use[] }) {
  const { uses = [], ...rest } = s;
  return {
    ...rest,
    steps: present(s.steps as unknown as Step[]),
    // When it's done (set, or learned from use) and how much it's used, for the therapist.
    timing: effectiveTiming(s, uses),
    usedDays: new Set(uses.map((u) => inIndia(u.startedAt).date)).size,
    lastUsedAt: uses[0]?.startedAt ?? null
  };
}

function assertStepCount(kind: Kind, steps: Step[]) {
  const [min, max] = STEP_LIMITS[kind];
  if (steps.length < min || steps.length > max) throw badRequest(kind === "FIRST_THEN" ? "First/Then has exactly 2 steps" : `This schedule needs ${min} to ${max} steps`);
}

async function findForStaff(user: AuthUser, id: string) {
  const schedule = await prisma.visualSchedule.findUnique({ where: { id } });
  if (!schedule) throw notFound("Schedule not found");
  await assertCanAccessKid(user, schedule.kidId);
  return schedule;
}

async function findForParent(parentId: string, kidId: string, id: string) {
  await assertOwnsKid(parentId, kidId);
  const schedule = await prisma.visualSchedule.findFirst({ where: { id, kidId, status: "ACTIVE" } });
  if (!schedule) throw notFound("Schedule not found");
  return schedule;
}

async function create(user: AuthUser, kidId: string, data: Fields & { aiDrafted?: boolean }) {
  const kid = await assertCanAccessKid(user, kidId);
  assertStepCount(data.kind, data.steps);
  await assertPhotosFitKid(kid, data.steps);
  const author = await authorFor(user);
  const row = await prisma.visualSchedule.create({
    data: { tenantId: kid.tenantId, kidId: kid.id, authorUserId: user.id, ...author, ...data, steps: data.steps as unknown as Prisma.InputJsonValue }
  });
  return presentSchedule(row);
}

function aiUnavailable() {
  return new AppError(503, "AI_UNAVAILABLE", "Pravnya couldn't draft this right now. Try again, or start from a template or a blank schedule.");
}

function editData(input: EditInput) {
  return {
    title: input.title,
    kind: input.kind,
    language: input.language,
    days: input.days,
    time: input.time,
    remind: input.remind,
    steps: input.steps as unknown as Prisma.InputJsonValue | undefined
  };
}

/** For the parent app: the schedule and where it stands today. */
function forParent(s: VisualSchedule & { uses: Use[] }, parentId: string, now: Date) {
  const timing = effectiveTiming(s, s.uses, now);
  return {
    id: s.id,
    title: s.title,
    kind: s.kind,
    language: s.language,
    source: s.source,
    /** The parent made it, so they can change everything (otherwise only its time and reminder). */
    mine: s.source === "PARENT" && s.createdByParentId === parentId,
    authorName: s.authorName,
    centreName: s.centreName,
    days: s.days,
    time: s.time,
    remind: s.remind,
    timing,
    ...todayStatus(timing, s.uses, now),
    steps: present(s.steps as unknown as Step[])
  };
}

export const visualSchedulesService = {
  async list(user: AuthUser, kidId: string) {
    await assertCanAccessKid(user, kidId);
    const rows = await prisma.visualSchedule.findMany({ where: { kidId }, orderBy: { createdAt: "desc" }, include: { uses: recentUses() } });
    return rows.map(presentSchedule);
  },

  create(user: AuthUser, input: Fields & { kidId: string }) {
    const { kidId, ...data } = input;
    return create(user, kidId, data);
  },

  /** A copy of a template (Pravnya's, or the user's centre's) as a draft for this child, to change as needed. */
  async fromTemplate(user: AuthUser, input: { kidId: string; templateId: string }) {
    const kid = await assertCanAccessKid(user, input.kidId);
    const t = await findTemplateForUse(input.templateId, user.tenantId);
    // A guest therapist's own centre's photos don't travel to another centre's child.
    const { steps } = await copySteps(t.steps as unknown as Step[], (a) => a.kidId === null && a.tenantId === kid.tenantId);
    return create(user, kid.id, { title: t.title, kind: t.kind, language: t.language as Language, steps, days: t.days, time: t.time, remind: true });
  },

  async draft(user: AuthUser, input: { kidId: string; kind: Kind; language: Language; request: string }) {
    const kid = await assertCanAccessKid(user, input.kidId);
    const drafted = await draftScheduleWithAi({ kidName: kid.firstName, kind: input.kind, language: input.language, request: input.request, tenantId: kid.tenantId });
    if (!drafted) throw aiUnavailable();
    return create(user, kid.id, { ...drafted, language: input.language, remind: true, aiDrafted: true });
  },

  async edit(user: AuthUser, id: string, input: EditInput) {
    const schedule = await findForStaff(user, id);
    if (schedule.status === "ARCHIVED") throw conflict("This schedule is archived", "ARCHIVED");
    if (schedule.source === "PARENT") throw conflict("The parent made this schedule; only they can change it", "MADE_BY_PARENT");
    const kind = input.kind ?? schedule.kind;
    const steps = input.steps ?? (schedule.steps as unknown as Step[]);
    assertStepCount(kind, steps);
    if (input.steps) await assertPhotosFitKid({ id: schedule.kidId, tenantId: schedule.tenantId }, input.steps);
    return presentSchedule(await prisma.visualSchedule.update({ where: { id }, data: editData(input) }));
  },

  async publish(user: AuthUser, id: string) {
    const schedule = await findForStaff(user, id);
    if (schedule.status !== "DRAFT") throw conflict("Only a draft can be published", "NOT_DRAFT");
    return presentSchedule(await prisma.visualSchedule.update({ where: { id }, data: { status: "ACTIVE", publishedAt: new Date() } }));
  },

  async archive(user: AuthUser, id: string) {
    const schedule = await findForStaff(user, id);
    if (schedule.source === "PARENT") throw conflict("The parent made this schedule; only they can remove it", "MADE_BY_PARENT");
    return presentSchedule(await prisma.visualSchedule.update({ where: { id }, data: { status: "ARCHIVED" } }));
  },

  async remove(user: AuthUser, id: string) {
    const schedule = await findForStaff(user, id);
    if (schedule.status !== "DRAFT") throw conflict("Only a draft can be deleted; archive a published schedule instead", "NOT_DRAFT");
    await prisma.visualSchedule.delete({ where: { id } });
  },

  // ---------- Parent ----------

  async listForParent(parentId: string, kidId: string, now = new Date()) {
    await assertOwnsKid(parentId, kidId);
    const rows = await prisma.visualSchedule.findMany({ where: { kidId, status: "ACTIVE" }, orderBy: { publishedAt: "desc" }, include: { uses: recentUses() } });
    return { credit: SYMBOL_CREDIT, schedules: rows.map((s) => forParent(s, parentId, now)) };
  },

  /** Pravnya drafts a schedule from what the parent typed or said. Not saved: the parent checks it first. */
  async draftForParent(parentId: string, kidId: string, input: { text?: string; audio?: { mimeType: string; base64: string }; kind: Kind | null; language: Language }) {
    const kid = await assertOwnsKid(parentId, kidId);
    const kidRow = await prisma.kid.findUniqueOrThrow({ where: { id: kid.id }, select: { firstName: true } });
    const drafted = await draftScheduleWithAi({
      kidName: kidRow.firstName,
      kind: input.kind,
      language: input.language,
      request: input.text,
      audio: input.audio,
      tenantId: kid.tenantId,
      featureId: "visual-schedule-parent-draft"
    });
    if (!drafted) throw aiUnavailable();
    return { ...drafted, language: input.language, steps: present(drafted.steps) };
  },

  async createForParent(parentId: string, kidId: string, data: Fields, now = new Date()) {
    const kid = await assertOwnsKid(parentId, kidId);
    assertStepCount(data.kind, data.steps);
    await assertPhotosFitKid(kid, data.steps);
    const parent = await prisma.parent.findUniqueOrThrow({ where: { id: parentId }, select: { displayName: true, fatherName: true, motherName: true } });
    const row = await prisma.visualSchedule.create({
      data: {
        tenantId: kid.tenantId,
        kidId: kid.id,
        authorName: parent.displayName ?? parent.motherName ?? parent.fatherName ?? "Parent",
        centreName: "",
        source: "PARENT",
        createdByParentId: parentId,
        status: "ACTIVE",
        publishedAt: now,
        ...data,
        steps: data.steps as unknown as Prisma.InputJsonValue
      },
      include: { uses: recentUses() }
    });
    return forParent(row, parentId, now);
  },

  /** Their own schedule: anything. A therapist's: only its time and reminder (the family knows when). */
  async editForParent(parentId: string, kidId: string, id: string, input: EditInput, now = new Date()) {
    const schedule = await findForParent(parentId, kidId, id);
    const mine = schedule.source === "PARENT" && schedule.createdByParentId === parentId;
    if (!mine && (["title", "kind", "language", "steps", "days"] as const).some((k) => input[k] !== undefined)) {
      throw conflict("Your therapist made this schedule. You can change its time and reminder.", "MADE_BY_THERAPIST");
    }
    const kind = input.kind ?? schedule.kind;
    const steps = input.steps ?? (schedule.steps as unknown as Step[]);
    assertStepCount(kind, steps);
    if (input.steps) await assertPhotosFitKid({ id: kidId, tenantId: schedule.tenantId }, input.steps);
    const row = await prisma.visualSchedule.update({ where: { id }, data: editData(input), include: { uses: recentUses() } });
    return forParent(row, parentId, now);
  },

  async removeForParent(parentId: string, kidId: string, id: string) {
    const schedule = await findForParent(parentId, kidId, id);
    if (schedule.source !== "PARENT" || schedule.createdByParentId !== parentId) throw conflict("Only schedules you made can be deleted", "MADE_BY_THERAPIST");
    await prisma.visualSchedule.delete({ where: { id } });
  },

  /** The family opened the schedule ("start") or got to the end ("complete"). */
  async recordUse(parentId: string, kidId: string, id: string, event: "start" | "complete", now = new Date()) {
    await findForParent(parentId, kidId, id);
    const today = inIndia(now).date;
    const last = await prisma.visualScheduleUse.findFirst({ where: { scheduleId: id }, orderBy: { startedAt: "desc" } });
    const lastIsToday = last && inIndia(last.startedAt).date === today;
    if (event === "start") {
      // Opening it again within a few minutes is the same use.
      if (last && lastIsToday && !last.completedAt && now.getTime() - last.startedAt.getTime() < 15 * 60_000) return { ok: true };
      await prisma.visualScheduleUse.create({ data: { scheduleId: id, startedAt: now } });
    } else if (last && lastIsToday && !last.completedAt) {
      await prisma.visualScheduleUse.update({ where: { id: last.id }, data: { completedAt: now } });
    } else if (!(last && lastIsToday && last.completedAt)) {
      await prisma.visualScheduleUse.create({ data: { scheduleId: id, startedAt: now, completedAt: now } });
    }
    return { ok: true };
  }
};
