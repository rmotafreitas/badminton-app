import { AwsClient } from "aws4fetch";
import type { IObjectStorage } from "@/application/interfaces/IObjectStorage";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** S3-compatible adapter (R2 / SeaweedFS) using SigV4 query presigning. */
export class S3ObjectStorage implements IObjectStorage {
  readonly configured = true;
  private readonly client: AwsClient;

  constructor(private readonly cfg: S3Config) {
    this.client = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      service: "s3",
      region: cfg.region,
    });
  }

  /** Path-style URL (supported by R2 and SeaweedFS). */
  private url(key: string): URL {
    const base = this.cfg.endpoint.replace(/\/$/, "");
    return new URL(`${base}/${this.cfg.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  }

  private async presign(method: string, key: string, expiresS: number, headers?: Record<string, string>) {
    const url = this.url(key);
    url.searchParams.set("X-Amz-Expires", String(expiresS));
    const signed = await this.client.sign(new Request(url, { method, headers }), {
      aws: { signQuery: true },
    });
    return signed.url;
  }

  presignPut(key: string, contentType: string, expiresS = 3600): Promise<string> {
    return this.presign("PUT", key, expiresS, { "content-type": contentType });
  }

  presignGet(key: string, expiresS = 3600): Promise<string> {
    return this.presign("GET", key, expiresS);
  }

  async delete(key: string): Promise<void> {
    const res = await this.client.fetch(this.url(key), { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`Storage delete failed: ${res.status}`);
  }

  static fromEnv(env: Record<string, string | undefined> = process.env): IObjectStorage {
    const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
    if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
      return new UnconfiguredStorage();
    }
    return new S3ObjectStorage({
      endpoint: S3_ENDPOINT,
      region: S3_REGION ?? "auto",
      bucket: S3_BUCKET,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    });
  }
}

/** Used when no bucket is configured: stats still work, videos stay on-device. */
export class UnconfiguredStorage implements IObjectStorage {
  readonly configured = false;
  private fail(): never {
    throw new Error("Object storage is not configured (S3_* env vars)");
  }
  presignPut(): Promise<string> {
    this.fail();
  }
  presignGet(): Promise<string> {
    this.fail();
  }
  async delete(): Promise<void> {}
}
