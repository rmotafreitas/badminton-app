/**
 * Object storage port (Cloudflare R2 in prod, SeaweedFS in dev — both S3
 * compatible). Clients upload/download directly with presigned URLs so large
 * videos never pass through the serverless API (4.5 MB body limit).
 */
export interface IObjectStorage {
  readonly configured: boolean;
  presignPut(key: string, contentType: string, expiresS?: number): Promise<string>;
  presignGet(key: string, expiresS?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
