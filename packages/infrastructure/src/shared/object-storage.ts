import type { ObjectStorage } from "@bb/application";
import { AwsClient } from "aws4fetch";

export interface S3Settings {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/** S3-compatible storage (R2 in production, SeaweedFS locally) with SigV4 query presigning. Path-style URLs. */
export class S3ObjectStorage implements ObjectStorage {
  readonly configured = true;
  private readonly client: AwsClient;

  constructor(private readonly settings: S3Settings) {
    this.client = new AwsClient({
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
      service: "s3",
      region: settings.region,
    });
  }

  private url(key: string): URL {
    const base = this.settings.endpoint.replace(/\/$/, "");
    return new URL(`${base}/${this.settings.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  }

  private async presign(method: string, key: string, expiresSeconds: number, headers?: Record<string, string>) {
    const url = this.url(key);
    url.searchParams.set("X-Amz-Expires", String(expiresSeconds));
    const signed = await this.client.sign(new Request(url.toString(), { method, headers }), { aws: { signQuery: true } });
    return signed.url;
  }

  presignPut(key: string, contentType: string, expiresSeconds: number): Promise<string> {
    return this.presign("PUT", key, expiresSeconds, { "content-type": contentType });
  }

  presignGet(key: string, expiresSeconds: number): Promise<string> {
    return this.presign("GET", key, expiresSeconds);
  }

  async delete(key: string): Promise<void> {
    const res = await this.client.fetch(this.url(key), { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`Storage delete failed: ${res.status}`);
  }
}

/** No bucket configured: stats still work, videos stay on the device. */
export const unconfiguredStorage: ObjectStorage = {
  configured: false,
  presignPut: () => Promise.reject(new Error("Object storage is not configured (S3_* variables).")),
  presignGet: () => Promise.reject(new Error("Object storage is not configured (S3_* variables).")),
  delete: async () => {},
};
