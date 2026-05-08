// =============================================================================
// File storage abstraction
// Local filesystem for dev; S3-compatible for production.
// =============================================================================

import { resolveLocalStoragePath } from "./local-path";

export interface UploadResult {
  key: string;
  size: number;
  contentType: string;
  url?: string;
}

export interface StorageProvider {
  upload(key: string, buffer: Buffer, contentType: string): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  presignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  presignedUploadUrl?(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
}

export { LocalStorageProvider } from "./local-provider";
export { S3StorageProvider } from "./s3-provider";

export function createStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? "local";

  if (provider === "s3") {
    const { S3StorageProvider } = require("./s3-provider");
    const bucket = process.env.AWS_S3_BUCKET ?? process.env.STORAGE_BUCKET;
    const endpoint =
      process.env.S3_ENDPOINT ??
      process.env.STORAGE_ENDPOINT ??
      (process.env.CLOUDFLARE_R2_ACCOUNT_ID
        ? `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : undefined);
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

    if (!bucket) {
      throw new Error("S3 storage is enabled, but AWS_S3_BUCKET is not configured.");
    }
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("S3 storage is enabled, but S3/R2 access key credentials are not configured.");
    }

    return new S3StorageProvider({
      bucket,
      region: process.env.AWS_REGION ?? (process.env.CLOUDFLARE_R2_ACCOUNT_ID ? "auto" : "eu-west-2"),
      accessKeyId,
      secretAccessKey,
      endpoint,
      forcePathStyle:
        process.env.S3_FORCE_PATH_STYLE === "true" ||
        Boolean(endpoint && /localhost|127\.0\.0\.1|minio/i.test(endpoint)),
    });
  }

  const { LocalStorageProvider } = require("./local-provider");
  return new LocalStorageProvider(
    resolveLocalStoragePath({
      configuredPath: process.env.LOCAL_STORAGE_PATH,
      repoRoot: process.env.AMS_REPO_ROOT,
    })
  );
}
