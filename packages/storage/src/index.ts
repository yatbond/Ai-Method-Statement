// =============================================================================
// File storage abstraction
// Local filesystem for dev; S3-compatible for production.
// =============================================================================

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
}

export { LocalStorageProvider } from "./local-provider";
export { S3StorageProvider } from "./s3-provider";

export function createStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? "local";

  if (provider === "s3") {
    const { S3StorageProvider } = require("./s3-provider");
    return new S3StorageProvider({
      bucket: process.env.AWS_S3_BUCKET!,
      region: process.env.AWS_REGION ?? "eu-west-2",
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT, // for MinIO
    });
  }

  const { LocalStorageProvider } = require("./local-provider");
  return new LocalStorageProvider(
    process.env.LOCAL_STORAGE_PATH ?? "./.storage"
  );
}
