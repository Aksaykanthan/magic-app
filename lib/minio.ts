import "server-only";
import type { Readable } from "node:stream";
import { Client } from "minio";
import { env } from "@/lib/env";

/**
 * MinIO singleton — S3-compatible object storage (docker-compose service:
 * minio). Use for user uploads, avatars, exports, etc.
 */
const globalForMinio = globalThis as unknown as {
  minio: Client | undefined;
};

export const minioClient =
  globalForMinio.minio ??
  new Client({
    endPoint: env.MINIO_ENDPOINT ?? "localhost",
    port: env.MINIO_PORT ?? 9000,
    useSSL: env.MINIO_USE_SSL ?? false,
    accessKey: env.MINIO_ACCESS_KEY ?? "minioadmin",
    secretKey: env.MINIO_SECRET_KEY ?? "minioadmin",
  });

if (env.NODE_ENV !== "production") globalForMinio.minio = minioClient;

export const DEFAULT_BUCKET = env.MINIO_BUCKET ?? "app-uploads";

/** Ensures the default bucket exists. Safe to call repeatedly (idempotent). */
export async function ensureBucket(bucket = DEFAULT_BUCKET): Promise<void> {
  const exists = await minioClient.bucketExists(bucket).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(bucket);
  }
}

/** Uploads a buffer/stream and returns the object key. */
export async function uploadObject(
  key: string,
  data: Buffer | Readable,
  size?: number,
  bucket = DEFAULT_BUCKET,
): Promise<string> {
  await ensureBucket(bucket);
  if (Buffer.isBuffer(data)) {
    await minioClient.putObject(bucket, key, data, data.length);
  } else {
    await minioClient.putObject(bucket, key, data, size);
  }
  return key;
}

/** Returns a presigned, time-limited download URL (default 1 hour). */
export async function getPresignedUrl(
  key: string,
  expirySeconds = 60 * 60,
  bucket = DEFAULT_BUCKET,
): Promise<string> {
  return minioClient.presignedGetObject(bucket, key, expirySeconds);
}

export async function deleteObject(
  key: string,
  bucket = DEFAULT_BUCKET,
): Promise<void> {
  await minioClient.removeObject(bucket, key);
}
