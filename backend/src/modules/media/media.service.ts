import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import type { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid, kidVisibilityFilter } from "../../common/access/kidAccess";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { badRequest, notFound } from "../../common/errors/AppError";
import { objectStorage } from "../../common/storage/objectStorage";

// Pictures staff or parents upload (photos for visual schedules) -- often of a child or their home,
// so kept apart per child:
// - Every picture belongs to one child (or, for a centre's templates, to the centre) and is stored
//   under media/<centre>/<child>/<id> in a private bucket.
// - On upload it's re-encoded: location (EXIF/GPS) and other metadata are dropped, size is capped,
//   and anything that isn't really a picture is refused.
// - It's only ever shown through a link made for one viewer (a parent or a staff member), which
//   expires within about an hour; every request re-checks that this viewer may still see that
//   child, so removing someone's access works at once.
// - Pictures no schedule or template uses any more are deleted after 7 days. Uploads and deletions
//   are recorded in MediaAuditEvent.

export const MAX_PICTURE_BYTES = 3 * 1024 * 1024;
/** Longest side after re-encoding. */
const MAX_SIDE = 1600;
/** Refuse decompression bombs: at most this many pixels in. */
const MAX_INPUT_PIXELS = 40_000_000;
export const UNUSED_DAYS = 7;
/** A recorded word or short phrase (the apps stop recording at 10 seconds). */
export const MAX_AUDIO_BYTES = 1024 * 1024;

export type AudioType = "audio/webm" | "audio/mp4" | "audio/ogg";

/**
 * Detects a voice recording from its first bytes: WebM (Chrome, Android), MP4/M4A (Safari, iPhone)
 * or Ogg. Anything else, pictures included, is refused.
 */
export function sniffAudio(buf: Buffer): AudioType | null {
  if (buf.length > 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return "audio/webm";
  if (buf.length > 12 && buf.toString("ascii", 4, 8) === "ftyp" && /^(M4A |mp4|iso|MSNV|3gp)/.test(buf.toString("ascii", 8, 12))) return "audio/mp4";
  if (buf.length > 4 && buf.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  return null;
}

/** Who a link is for. */
export type Viewer = { kind: "parent"; id: string } | { kind: "staff"; id: string };

/** Detects the picture type from its first bytes -- never trusts the mime type the client sent. */
export function sniffPicture(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Decodes and re-encodes the picture: upright, at most MAX_SIDE, no metadata (EXIF/GPS/XMP/ICC). */
export async function reencode(bytes: Buffer): Promise<{ body: Buffer; mimeType: "image/jpeg" | "image/png" }> {
  try {
    const meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new Error("not a picture");
    const pipeline = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true });
    // sharp writes no metadata unless asked to (withMetadata/keepExif), so none is carried over.
    return meta.hasAlpha
      ? { body: await pipeline.png({ compressionLevel: 9 }).toBuffer(), mimeType: "image/png" }
      : { body: await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), mimeType: "image/jpeg" };
  } catch {
    throw badRequest("That file couldn't be read as a picture. Upload a JPEG, PNG or WebP photo.", "NOT_A_PICTURE");
  }
}

const signingKey = () => createHmac("sha256", env.JWT_SECRET).update("media-links-v2").digest();
const viewerTag = (v: Viewer) => `${v.kind === "parent" ? "p" : "s"}.${v.id}`;
const sign = (id: string, tag: string, exp: number) => createHmac("sha256", signingKey()).update(`${id}|${tag}|${exp}`).digest("base64url");

/** Links stay the same for 15 minutes (so the browser can cache them) and work for 60-75 minutes. */
const BUCKET_S = 15 * 60;
const LIFETIME_S = 60 * 60;

/** A link to the picture for this viewer only. */
export function mediaPath(id: string, viewer: Viewer, now = Date.now()) {
  const exp = Math.ceil(now / 1000 / BUCKET_S) * BUCKET_S + LIFETIME_S;
  const tag = viewerTag(viewer);
  return `/api/media/${id}?v=${encodeURIComponent(tag)}&exp=${exp}&sig=${sign(id, tag, exp)}`;
}

/** The viewer a link was made for, if the link is genuine and not expired. */
export function verifyMediaLink(id: string, v: string, exp: string, sig: string, now = Date.now()): { viewer: Viewer; exp: number } | null {
  const m = /^([ps])\.([0-9a-f-]{36})$/.exec(v);
  const expNum = Number(exp);
  if (!m || !Number.isInteger(expNum) || expNum * 1000 < now) return null;
  const want = Buffer.from(sign(id, v, expNum));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return { viewer: { kind: m[1] === "p" ? "parent" : "staff", id: m[2] }, exp: expNum };
}

/** May this viewer see this picture right now? Re-checked on every request. */
export async function canView(viewer: Viewer, asset: { kidId: string | null; tenantId: string }) {
  if (viewer.kind === "parent") {
    // Their own child's picture; or a centre picture (from a template) of a centre their child is at.
    const where = asset.kidId ? { id: asset.kidId, parentId: viewer.id } : { tenantId: asset.tenantId, parentId: viewer.id };
    return (await prisma.kid.count({ where })) > 0;
  }
  const user = await prisma.user.findUnique({ where: { id: viewer.id }, select: { id: true, role: true, tenantId: true } });
  if (!user || user.role === "SUPERADMIN" || !user.tenantId) return false;
  let filter: Awaited<ReturnType<typeof kidVisibilityFilter>>;
  try {
    filter = await kidVisibilityFilter(user as AuthUser);
  } catch {
    return false;
  }
  // AND, not a spread: the filter may itself carry a tenantId, which must not replace the picture's.
  if (asset.kidId) return (await prisma.kid.count({ where: { AND: [{ id: asset.kidId }, filter] } })) > 0;
  // A centre picture: staff of that centre, or someone on the team of one of its children (a guest therapist).
  return user.tenantId === asset.tenantId || (await prisma.kid.count({ where: { AND: [{ tenantId: asset.tenantId }, filter] } })) > 0;
}

type Actor = { kind: "STAFF" | "PARENT" | "SYSTEM"; id: string | null };

function recordEvent(asset: { id: string; tenantId: string; kidId: string | null }, action: "UPLOADED" | "DELETED_UNUSED" | "DELETED_WITH_ACCOUNT", actor: Actor) {
  return prisma.mediaAuditEvent.create({ data: { tenantId: asset.tenantId, mediaId: asset.id, kidId: asset.kidId, action, actorKind: actor.kind, actorId: actor.id } });
}

/** kid.id null: a centre-wide picture (for the centre's templates). */
async function store(kid: { id: string | null; tenantId: string }, base64: string, by: { uploadedByUserId?: string; uploadedByParentId?: string }, viewer: Viewer) {
  const raw = Buffer.from(base64, "base64");
  if (raw.length > MAX_PICTURE_BYTES) throw badRequest("That picture is too large (3 MB at most).", "TOO_LARGE");
  if (!sniffPicture(raw)) throw badRequest("Upload a JPEG, PNG or WebP picture.", "NOT_A_PICTURE");
  const { body, mimeType } = await reencode(raw);
  const id = randomUUID();
  const storageKey = `media/${kid.tenantId}/${kid.id ?? "centre"}/${id}`;
  await objectStorage.put(storageKey, body, mimeType);
  await prisma.mediaAsset.create({ data: { id, tenantId: kid.tenantId, kidId: kid.id, ...by, storageKey, mimeType, bytes: body.length } });
  await recordEvent({ id, tenantId: kid.tenantId, kidId: kid.id }, "UPLOADED", by.uploadedByParentId ? { kind: "PARENT", id: by.uploadedByParentId } : { kind: "STAFF", id: by.uploadedByUserId ?? null });
  return { id, url: mediaPath(id, viewer) };
}

/** A voice recording for one child's board. Always the child's (never centre-wide). */
async function storeAudio(kid: { id: string; tenantId: string }, base64: string, by: { uploadedByUserId?: string; uploadedByParentId?: string }, viewer: Viewer) {
  const body = Buffer.from(base64, "base64");
  if (body.length > MAX_AUDIO_BYTES) throw badRequest("That recording is too long. Keep it to a word or a short phrase.", "TOO_LARGE");
  const mimeType = sniffAudio(body);
  if (!mimeType) throw badRequest("That file isn't a voice recording.", "NOT_AUDIO");
  const id = randomUUID();
  const storageKey = `media/${kid.tenantId}/${kid.id}/${id}`;
  await objectStorage.put(storageKey, body, mimeType);
  await prisma.mediaAsset.create({ data: { id, tenantId: kid.tenantId, kidId: kid.id, ...by, storageKey, mimeType, bytes: body.length } });
  await recordEvent({ id, tenantId: kid.tenantId, kidId: kid.id }, "UPLOADED", by.uploadedByParentId ? { kind: "PARENT", id: by.uploadedByParentId } : { kind: "STAFF", id: by.uploadedByUserId ?? null });
  return { id, url: mediaPath(id, viewer) };
}

async function removeFiles(storageKeys: string[]) {
  for (const key of storageKeys) {
    try {
      await objectStorage.remove(key);
    } catch (e) {
      console.error(`[media] couldn't remove ${key}:`, e instanceof Error ? e.message : e);
    }
  }
}

/** Ids of photos and recordings some schedule, AAC board or template still uses. */
async function referencedPhotoIds() {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT (e->'picture'->>'mediaId') AS id FROM "VisualSchedule" v, jsonb_array_elements(v.steps) e WHERE e->'picture'->>'kind' = 'photo'
    UNION
    SELECT DISTINCT (e->'picture'->>'mediaId') AS id FROM "VisualScheduleTemplate" t, jsonb_array_elements(t.steps) e WHERE e->'picture'->>'kind' = 'photo'
    UNION
    SELECT DISTINCT (c->'picture'->>'mediaId') AS id FROM "AacBoard" b, jsonb_array_elements(b.pages) p, jsonb_array_elements(p->'cells') c WHERE c->'picture'->>'kind' = 'photo'
    UNION
    SELECT DISTINCT (c->'picture'->>'mediaId') AS id FROM "AacBoardTemplate" b, jsonb_array_elements(b.pages) p, jsonb_array_elements(p->'cells') c WHERE c->'picture'->>'kind' = 'photo'
    UNION
    SELECT DISTINCT (c->'audio'->>'mediaId') AS id FROM "AacBoard" b, jsonb_array_elements(b.pages) p, jsonb_array_elements(p->'cells') c WHERE c->'audio'->>'mediaId' IS NOT NULL`;
  return rows.map((r) => r.id).filter((id): id is string => !!id);
}

export const mediaService = {
  async upload(user: AuthUser, input: { kidId?: string; base64: string }) {
    const viewer: Viewer = { kind: "staff", id: user.id };
    if (input.kidId) return store(await assertCanAccessKid(user, input.kidId), input.base64, { uploadedByUserId: user.id }, viewer);
    // Centre-wide (template photos).
    return store({ id: null, tenantId: user.tenantId! }, input.base64, { uploadedByUserId: user.id }, viewer);
  },

  /** A recording (a therapist saying a word) for a child's board. */
  async uploadAudio(user: AuthUser, input: { kidId: string; base64: string }) {
    return storeAudio(await assertCanAccessKid(user, input.kidId), input.base64, { uploadedByUserId: user.id }, { kind: "staff", id: user.id });
  },

  /** A parent's recording for their own child's board. */
  async uploadAudioForParent(parentId: string, kidId: string, base64: string) {
    return storeAudio(await assertOwnsKid(parentId, kidId), base64, { uploadedByParentId: parentId }, { kind: "parent", id: parentId });
  },

  /** A parent's photo for their own child's schedule. */
  async uploadForParent(parentId: string, kidId: string, base64: string) {
    return store(await assertOwnsKid(parentId, kidId), base64, { uploadedByParentId: parentId }, { kind: "parent", id: parentId });
  },

  /** The picture, if this viewer may see it now. Anything else is "not found", never "forbidden". */
  async read(id: string, viewer: Viewer) {
    const asset = await prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || !(await canView(viewer, asset))) throw notFound();
    const body = await objectStorage.get(asset.storageKey);
    if (!body) throw notFound();
    return { body, mimeType: asset.mimeType };
  },

  /** Deletes the files and rows of these pictures, recording why. */
  async removeAssets(assets: { id: string; tenantId: string; kidId: string | null; storageKey: string }[], action: "DELETED_UNUSED" | "DELETED_WITH_ACCOUNT") {
    if (!assets.length) return;
    await removeFiles(assets.map((a) => a.storageKey));
    await prisma.mediaAsset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } });
    for (const a of assets) await recordEvent(a, action, { kind: "SYSTEM", id: null });
  },

  /** Marks pictures nothing uses any more, and deletes those unused for UNUSED_DAYS. */
  async cleanUpUnused(now = new Date()) {
    const used = await referencedPhotoIds();
    await prisma.mediaAsset.updateMany({ where: { id: { in: used }, unusedSince: { not: null } }, data: { unusedSince: null } });
    await prisma.mediaAsset.updateMany({ where: { id: { notIn: used }, unusedSince: null }, data: { unusedSince: now } });
    const expired = await prisma.mediaAsset.findMany({
      where: { id: { notIn: used }, unusedSince: { lte: new Date(now.getTime() - UNUSED_DAYS * 86_400_000) } },
      select: { id: true, tenantId: true, kidId: true, storageKey: true }
    });
    await this.removeAssets(expired, "DELETED_UNUSED");
    return { deleted: expired.length };
  }
};

let timer: NodeJS.Timeout | null = null;

/** Runs the clean-up every 6 hours. Never in tests. */
export function startMediaCleanup() {
  if (timer || env.NODE_ENV === "test") return;
  const run = () => void mediaService.cleanUpUnused().catch((e) => console.error("[media clean-up] failed:", e instanceof Error ? e.message : e));
  setTimeout(run, 5 * 60_000).unref();
  timer = setInterval(run, 6 * 60 * 60_000);
  timer.unref();
}
