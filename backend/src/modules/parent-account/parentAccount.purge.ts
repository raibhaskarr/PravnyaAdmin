import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { invitationEmailService } from "../therapist-invitations/invitationEmail.service";
import { mediaService } from "../media/media.service";

// What deleting a parent account removes, after the 30-day grace period:
// - A child the parent registered themselves (on the retail tenant, no centre owns the record):
//   deleted completely -- goals, entries, messages, schedule, everything (Kid cascades).
// - A child a centre registered: the centre keeps its therapy record. The child is unlinked from
//   the parent, and what only the parent used -- their conversation with Pravnya, the weekly
//   schedule they kept, picture schedules they made and photos they uploaded -- is deleted.
// - The parent's own record (email, names, phone, address, password) and any verification code.
// Invitations the parent sent keep existing for the centre, with the sender cleared (SetNull).

export async function purgeParent(parentId: string) {
  const parent = await prisma.parent.findUnique({ where: { id: parentId }, select: { id: true, email: true, kids: { select: { id: true, tenantId: true } } } });
  if (!parent) return null;
  const own = parent.kids.filter((k) => env.RETAIL_TENANT_ID && k.tenantId === env.RETAIL_TENANT_ID).map((k) => k.id);
  const centre = parent.kids.filter((k) => !own.includes(k.id)).map((k) => k.id);
  // Pictures uploaded for a child who is deleted completely: their rows go with the Kid (cascade),
  // the stored files are removed below.
  // Photos the parent uploaded for a centre's child go too (the centre's own uploads stay).
  const ownPictures = await prisma.mediaAsset.findMany({ where: { OR: [{ kidId: { in: own } }, { uploadedByParentId: parentId }] }, select: { storageKey: true } });

  await prisma.$transaction([
    prisma.kid.deleteMany({ where: { id: { in: own } } }),
    prisma.companionMessage.deleteMany({ where: { kidId: { in: centre } } }),
    prisma.scheduleSlot.deleteMany({ where: { kidId: { in: centre } } }),
    prisma.visualSchedule.deleteMany({ where: { kidId: { in: centre }, source: "PARENT" } }),
    prisma.mediaAsset.deleteMany({ where: { uploadedByParentId: parentId } }),
    prisma.kid.updateMany({ where: { id: { in: centre } }, data: { parentId: null } }),
    prisma.parentVerificationCode.deleteMany({ where: { email: parent.email } }),
    prisma.parent.delete({ where: { id: parentId } })
  ]);
  await mediaService.removeFiles(ownPictures.map((p) => p.storageKey));
  return { email: parent.email, kidsDeleted: own.length, kidsUnlinked: centre.length };
}

/** Deletes every account whose grace period has ended. Safe to run repeatedly. */
export async function runParentPurge(now = new Date()) {
  const due = await prisma.parent.findMany({ where: { scheduledPurgeAt: { lte: now } }, select: { id: true } });
  let purged = 0;
  for (const { id } of due) {
    try {
      const result = await purgeParent(id);
      if (!result) continue;
      purged++;
      // Logged by id only: the email is gone from the database now and shouldn't live on in logs.
      console.log(`[parent purge] deleted parent ${id}: ${result.kidsDeleted} child record(s) deleted, ${result.kidsUnlinked} unlinked from a centre`);
      await invitationEmailService
        .sendParentAccountNotice({
          to: result.email,
          subject: "Your Pravnya account has been deleted",
          text: "Your Pravnya account and the information in it have been deleted, as you asked.\n\nIf your child's centre also uses Pravnya, the centre keeps its own therapy records. Contact them about those.\n\nThank you for using Pravnya."
        })
        .catch(() => {});
    } catch (e) {
      console.error(`[parent purge] parent ${id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { purged };
}

let timer: NodeJS.Timeout | null = null;

/** Runs the purge shortly after startup and then every hour. */
export function startParentPurgeScheduler() {
  if (timer || env.NODE_ENV === "test" || !env.PARENT_PURGE_ENABLED) return;
  const run = () => void runParentPurge().catch((e) => console.error("[parent purge] run failed:", e instanceof Error ? e.message : e));
  setTimeout(run, 60_000).unref();
  timer = setInterval(run, 60 * 60_000);
  timer.unref();
}
