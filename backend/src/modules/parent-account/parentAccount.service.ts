import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError, unauthorized } from "../../common/errors/AppError";
import { invitationEmailService } from "../therapist-invitations/invitationEmail.service";

export const DELETION_GRACE_DAYS = 30;
const DAY = 86_400_000;
const EXPORT_LINK_MINUTES = 5;

function day(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** Everything the parent can see in the app, as one readable JSON document. */
async function gatherExport(parentId: string) {
  const parent = await prisma.parent.findUniqueOrThrow({
    where: { id: parentId },
    select: {
      email: true,
      displayName: true,
      fatherName: true,
      motherName: true,
      mobile: true,
      addressLine1: true,
      city: true,
      createdAt: true,
      kids: {
        select: {
          firstName: true,
          lastName: true,
          dob: true,
          gender: true,
          selfReportedTherapies: true,
          selfReportedScheduleDays: true,
          tenant: { select: { name: true } },
          goals: {
            orderBy: { createdAt: "asc" },
            select: {
              title: true,
              status: true,
              notes: true,
              createdAt: true,
              items: {
                select: {
                  customText: true,
                  canonicalSkillItem: { select: { displayName: true } },
                  evidence: {
                    orderBy: { logDate: "asc" },
                    select: {
                      logDate: true,
                      createdAt: true,
                      outcome: true,
                      supportLevel: true,
                      modality: true,
                      centreName: true,
                      centre: { select: { name: true } },
                      measurementValue: true,
                      measurementUnit: true,
                      measurementBoolean: true,
                      measurementText: true
                    }
                  }
                }
              }
            }
          },
          scheduleSlots: { select: { label: true, dayOfWeek: true, startTime: true } },
          companionMessages: { orderBy: { createdAt: "asc" }, select: { role: true, content: true, createdAt: true } },
          progressUpdates: { where: { status: "SENT" }, orderBy: { sentAt: "asc" }, select: { authorName: true, centreName: true, sentAt: true, body: true } },
          iepPlans: { where: { sharedAt: { not: null } }, orderBy: { sharedAt: "asc" }, select: { title: true, authorName: true, centreName: true, planStart: true, reviewDate: true, content: true } }
        }
      }
    }
  });

  return {
    exportedAt: new Date().toISOString(),
    about: "Your data from Pravnya: your account details and everything about your children that you can see in the app.",
    account: {
      email: parent.email,
      name: parent.displayName,
      fatherName: parent.fatherName,
      motherName: parent.motherName,
      mobile: parent.mobile,
      address: parent.addressLine1,
      city: parent.city,
      createdAt: parent.createdAt
    },
    children: parent.kids.map((k) => ({
      firstName: k.firstName,
      lastName: k.lastName,
      dateOfBirth: k.dob,
      gender: k.gender,
      centre: k.tenant.name,
      therapiesYouToldUsAbout: k.selfReportedTherapies,
      goals: k.goals.map((g) => ({
        title: g.title,
        status: g.status,
        notes: g.notes,
        addedOn: g.createdAt,
        entries: g.items.flatMap((i) =>
          i.evidence.map((e) => ({
            date: e.logDate ?? e.createdAt,
            item: i.canonicalSkillItem?.displayName ?? i.customText,
            outcome: e.outcome,
            support: e.supportLevel,
            howTheyResponded: e.modality,
            where: e.centre?.name ?? e.centreName ?? "home",
            measurement: e.measurementValue ?? e.measurementBoolean ?? e.measurementText ?? null,
            unit: e.measurementUnit
          }))
        )
      })),
      weeklySchedule: k.scheduleSlots,
      conversationWithPravnya: k.companionMessages.map((m) => ({ from: m.role === "PARENT" ? "you" : "Pravnya", text: m.content, at: m.createdAt })),
      updatesFromTherapists: k.progressUpdates,
      educationPlans: k.iepPlans
    }))
  };
}

export const parentAccountService = {
  async requestDeletion(parentId: string, password: string) {
    const parent = await prisma.parent.findUniqueOrThrow({ where: { id: parentId }, select: { email: true, passwordHash: true, scheduledPurgeAt: true } });
    if (!parent.passwordHash || !(await bcrypt.compare(password, parent.passwordHash))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "That password isn't right");
    }
    if (parent.scheduledPurgeAt) return { scheduledPurgeAt: parent.scheduledPurgeAt };

    const now = new Date();
    const scheduledPurgeAt = new Date(now.getTime() + DELETION_GRACE_DAYS * DAY);
    await prisma.parent.update({ where: { id: parentId }, data: { deletionRequestedAt: now, scheduledPurgeAt } });
    await invitationEmailService
      .sendParentAccountNotice({
        to: parent.email,
        subject: "Your Pravnya account will be deleted",
        text:
          `You asked us to delete your Pravnya account. It will be deleted on ${day(scheduledPurgeAt)}.\n\n` +
          `Changed your mind? Sign in before then and tap "Keep my account": ${env.PARENT_APP_URL}\n\n` +
          "If you didn't ask for this, sign in and keep your account, then change your password."
      })
      .catch((e) => console.error("[parent account] deletion email failed:", e instanceof Error ? e.message : e));
    return { scheduledPurgeAt };
  },

  async cancelDeletion(parentId: string) {
    const parent = await prisma.parent.findUniqueOrThrow({ where: { id: parentId }, select: { email: true, scheduledPurgeAt: true } });
    if (!parent.scheduledPurgeAt) return { cancelled: false };
    await prisma.parent.update({ where: { id: parentId }, data: { deletionRequestedAt: null, scheduledPurgeAt: null } });
    await invitationEmailService
      .sendParentAccountNotice({ to: parent.email, subject: "Your Pravnya account won't be deleted", text: "You cancelled the deletion of your Pravnya account. Everything stays as it was." })
      .catch(() => {});
    return { cancelled: true };
  },

  /** A short-lived link the app opens to download the export (works in a browser and from the Android app). */
  exportLink(parentId: string) {
    const token = jwt.sign({ kind: "parent-export", id: parentId }, env.JWT_SECRET, { expiresIn: `${EXPORT_LINK_MINUTES}m` });
    return { path: `/api/parent-account/export?token=${encodeURIComponent(token)}`, expiresInMinutes: EXPORT_LINK_MINUTES };
  },

  async exportFromLink(token: string) {
    let payload: { kind?: string; id?: string };
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as typeof payload;
    } catch {
      throw unauthorized("This download link has expired. Go back to the app and try again.");
    }
    if (payload.kind !== "parent-export" || !payload.id) throw unauthorized("This download link isn't valid");
    return gatherExport(payload.id);
  }
};
