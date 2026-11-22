import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../config/env";

/** Where uploaded files live. Keys look like "media/<tenantId>/<uuid>". */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** null when there's no such object. */
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

function localStorage(root: string): ObjectStorage {
  const base = resolve(root);
  const pathOf = (key: string) => {
    const p = resolve(base, key);
    if (!p.startsWith(base + sep)) throw new Error("Bad storage key");
    return p;
  };
  return {
    async put(key, body) {
      const p = pathOf(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    async get(key) {
      try {
        return await readFile(pathOf(key));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async remove(key) {
      await rm(pathOf(key), { force: true });
    }
  };
}

function s3Storage(): ObjectStorage {
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! }
  });
  const Bucket = env.S3_BUCKET!;
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return out.Body ? Buffer.from(await out.Body.transformToByteArray()) : null;
      } catch (e) {
        if ((e as { name?: string }).name === "NoSuchKey") return null;
        throw e;
      }
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    }
  };
}

export const objectStorage: ObjectStorage = env.STORAGE_DRIVER === "s3" ? s3Storage() : localStorage(env.LOCAL_STORAGE_DIR);

if (env.NODE_ENV === "production" && env.STORAGE_DRIVER === "local") {
  console.warn("[storage] STORAGE_DRIVER=local in production: uploaded pictures are kept on this server's disk.");
}
