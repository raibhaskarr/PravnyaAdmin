import { prisma } from "../../config/prisma";
import { badRequest } from "../../common/errors/AppError";
import { mediaPath } from "../media/media.service";
import { getSymbol } from "../symbols/symbols";
import type { Step } from "./visualSchedules.schemas";

/** Steps as the apps show them: each picture with a link to it. */
export function present(steps: Step[]) {
  return steps.map((s) => {
    if (!s.picture) return { ...s, picture: null };
    if (s.picture.kind === "photo") return { ...s, picture: { ...s.picture, url: mediaPath(s.picture.mediaId) } };
    const sym = getSymbol(s.picture.symbolId);
    return { ...s, picture: sym ? { ...s.picture, url: sym.url } : null };
  });
}

const photoIds = (steps: Step[]) => [...new Set(steps.flatMap((s) => (s.picture?.kind === "photo" ? [s.picture.mediaId] : [])))];

/** A child's schedule may use photos uploaded for that child, or centre-wide ones from its centre (templates). */
export async function assertPhotosFitKid(kid: { id: string; tenantId: string }, steps: Step[]) {
  const ids = photoIds(steps);
  if (!ids.length) return;
  const found = await prisma.mediaAsset.count({ where: { id: { in: ids }, OR: [{ kidId: kid.id }, { kidId: null, tenantId: kid.tenantId }] } });
  if (found !== ids.length) throw badRequest("A photo on this schedule wasn't uploaded for this child");
}

/** A template may use only centre-wide photos of its own centre; Pravnya's templates use symbols only. */
export async function assertPhotosFitTemplate(tenantId: string | null, steps: Step[]) {
  const ids = photoIds(steps);
  if (!ids.length) return;
  if (!tenantId) throw badRequest("Pravnya templates use symbols only (photos belong to a centre)");
  const found = await prisma.mediaAsset.count({ where: { id: { in: ids }, kidId: null, tenantId } });
  if (found !== ids.length) throw badRequest("A photo on this template isn't one of this centre's template photos");
}

/** Copies steps with fresh keys, dropping photos that don't fit where they're going. */
export async function copySteps(steps: Step[], keepPhoto: (asset: { kidId: string | null; tenantId: string }) => boolean) {
  const ids = photoIds(steps);
  const assets = ids.length ? await prisma.mediaAsset.findMany({ where: { id: { in: ids } }, select: { id: true, kidId: true, tenantId: true } }) : [];
  const ok = new Set(assets.filter(keepPhoto).map((a) => a.id));
  let dropped = 0;
  const out = steps.map((s) => {
    const picture = s.picture?.kind === "photo" && !ok.has(s.picture.mediaId) ? (dropped++, null) : s.picture;
    return { ...s, key: crypto.randomUUID(), picture };
  });
  return { steps: out, droppedPhotos: dropped };
}
