import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import type { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { badRequest, notFound } from "../../common/errors/AppError";
import { objectStorage } from "../../common/storage/objectStorage";

// Pictures staff or parents upload (photos for visual schedules). Stored in object storage; served only through
// a signed link that expires, so an <img> tag can show one without the app's login token.

export const MAX_PICTURE_BYTES = 3 * 1024 * 1024;

/** Detects the picture type from its first bytes -- never trusts the mime type the client sent. */
export function sniffPicture(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const signingKey = () => createHmac("sha256", env.JWT_SECRET).update("media-links").digest();
const sign = (id: string, exp: number) => createHmac("sha256", signingKey()).update(`${id}.${exp}`).digest("base64url");

/**
 * A link to the picture, valid for at least a day. The expiry is rounded to the next whole day so
 * the same picture keeps the same link all day and the browser can cache it.
 */
export function mediaPath(id: string, now = Date.now()) {
  const day = 86_400;
  const exp = (Math.floor(now / 1000 / day) + 2) * day;
  return `/api/media/${id}?exp=${exp}&sig=${sign(id, exp)}`;
}

export function verifyMediaLink(id: string, exp: string, sig: string, now = Date.now()) {
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum * 1000 < now) return false;
  const want = Buffer.from(sign(id, expNum));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** kid.id null: a centre-wide picture (for the centre's templates). */
async function store(kid: { id: string | null; tenantId: string }, base64: string, by: { uploadedByUserId?: string; uploadedByParentId?: string }) {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > MAX_PICTURE_BYTES) throw badRequest("That picture is too large (3 MB at most).", "TOO_LARGE");
  const mimeType = sniffPicture(bytes);
  if (!mimeType) throw badRequest("Upload a JPEG, PNG or WebP picture.", "NOT_A_PICTURE");
  const id = randomUUID();
  const storageKey = `media/${kid.tenantId}/${id}`;
  await objectStorage.put(storageKey, bytes, mimeType);
  await prisma.mediaAsset.create({ data: { id, tenantId: kid.tenantId, kidId: kid.id, ...by, storageKey, mimeType, bytes: bytes.length } });
  return { id, url: mediaPath(id) };
}

export const mediaService = {
  async upload(user: AuthUser, input: { kidId?: string; base64: string }) {
    if (input.kidId) return store(await assertCanAccessKid(user, input.kidId), input.base64, { uploadedByUserId: user.id });
    // Centre-wide (template photos).
    return store({ id: null, tenantId: user.tenantId! }, input.base64, { uploadedByUserId: user.id });
  },

  /** A parent's photo for their own child's schedule. */
  async uploadForParent(parentId: string, kidId: string, base64: string) {
    return store(await assertOwnsKid(parentId, kidId), base64, { uploadedByParentId: parentId });
  },

  async read(id: string) {
    const asset = await prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw notFound();
    const body = await objectStorage.get(asset.storageKey);
    if (!body) throw notFound();
    return { body, mimeType: asset.mimeType };
  },

  /** Removes the stored files of these pictures (rows are removed by the caller or by cascade). */
  async removeFiles(storageKeys: string[]) {
    for (const key of storageKeys) {
      try {
        await objectStorage.remove(key);
      } catch (e) {
        console.error(`[media] couldn't remove ${key}:`, e instanceof Error ? e.message : e);
      }
    }
  }
};
