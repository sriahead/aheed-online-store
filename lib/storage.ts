import { AwsClient } from "aws4fetch";
import { getEnv } from "./config";

/**
 * StorageService port (ADR-003). Object storage via the S3-compatible API ONLY,
 * using aws4fetch (tiny SigV4 signer) to keep the Worker bundle small and stay
 * portable (R2 -> S3/GCS by env change). The DB stores RELATIVE KEYS only;
 * public URLs are composed at read time from CDN_BASE_URL.
 */
export interface StorageService {
  putObject(
    key: string,
    body: ArrayBuffer | Uint8Array | string,
    contentType?: string,
  ): Promise<void>;
  publicUrl(key: string): string;
}

/** Pure helper (unit-tested): compose a public URL from a base + relative key. */
export function composePublicUrl(cdnBase: string, key: string): string {
  return `${cdnBase.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}

export function getStorage(): StorageService {
  const env = getEnv();
  const client = new AwsClient({
    accessKeyId: env.S3_ACCESS_KEY ?? "",
    secretAccessKey: env.S3_SECRET_KEY ?? "",
    region: env.S3_REGION ?? "auto",
    service: "s3",
  });
  const base = `${env.S3_ENDPOINT}/${env.S3_BUCKET}`;

  return {
    async putObject(key, body, contentType) {
      const res = await client.fetch(`${base}/${key.replace(/^\/+/, "")}`, {
        method: "PUT",
        body: body as BodyInit,
        headers: contentType ? { "content-type": contentType } : undefined,
      });
      if (!res.ok) throw new Error(`storage putObject failed: ${res.status}`);
    },
    publicUrl(key) {
      return composePublicUrl(env.CDN_BASE_URL ?? "", key);
    },
  };
}
