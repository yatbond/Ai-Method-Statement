import fs from "fs/promises";
import path from "path";
import type { StorageProvider, UploadResult } from "./index";

export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  private resolve(key: string): string {
    // Prevent path traversal
    const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    return path.join(this.basePath, safe);
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<UploadResult> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return { key, size: buffer.length, contentType };
  }

  async download(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.resolve(key)).catch(() => {});
  }

  async exists(key: string): Promise<boolean> {
    return fs
      .access(this.resolve(key))
      .then(() => true)
      .catch(() => false);
  }

  async presignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    // Local: return a file:// path — in a real app this would be a signed URL
    return `file://${this.resolve(key)}`;
  }

  async presignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 900
  ): Promise<string> {
    throw new Error("Direct browser uploads are available only with S3-compatible storage.");
  }
}
