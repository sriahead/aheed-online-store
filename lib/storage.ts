import { AwsClient } from "aws4fetch";
import { getEnv } from "./config";

/**
 * StorageService port (ADR-003). Object storage via the S3-compatible API ONLY,
 * using aws4fetch (tiny SigV4 signer) to keep the Worker bundle small and stay
 * portable (R2 -> S3/GCS by env change). The DB stores RELATIVE KEYS only;
 * public URLs are composed at read time from CDN_BASE_URL.
 */
/** What `headObject` reports about a stored object. Null contentType/length = header absent. */
export interface StoredObjectHead {
  contentType: string | null;
  contentLength: number | null;
}

export interface StorageService {
  putObject(
    key: string,
    body: ArrayBuffer | Uint8Array | string,
    contentType?: string,
  ): Promise<void>;
  publicUrl(key: string): string;
  /**
   * A short-lived, presigned PUT for ONE key with ONE content type (P6b2, #167).
   *
   * Standard SigV4 query signing — `PutObject` with `X-Amz-Signature` in the
   * query string, nothing R2-specific (ADR-003). The browser uploads straight to
   * storage with this, so no image byte ever transits the Worker and Workers'
   * request-size and CPU limits are not in the upload path.
   */
  presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  /**
   * `HeadObject` — the object's own account of itself, or null if it isn't there.
   *
   * This exists because a presigned PUT cannot police a body the Worker never
   * sees. The client is not trusted to be the only guard, so the attach path
   * asks storage what actually landed before it writes a row.
   */
  headObject(key: string): Promise<StoredObjectHead | null>;
}

/**
 * NOTE: there is deliberately no delete on this port. P6b2 uses immutable keys,
 * so a replaced image's object is superseded rather than overwritten and nothing
 * ever needs removing at write time. Cleaning up superseded and orphaned objects
 * is #174, and it needs its own decision (an inline delete vs a scheduled sweep,
 * the latter being the first cron trigger in wrangler.toml) rather than a method
 * added speculatively here.
 */

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
  const objectUrl = (key: string) => `${base}/${key.replace(/^\/+/, "")}`;

  return {
    async putObject(key, body, contentType) {
      const res = await client.fetch(objectUrl(key), {
        method: "PUT",
        body: body as BodyInit,
        headers: contentType ? { "content-type": contentType } : undefined,
      });
      if (!res.ok) throw new Error(`storage putObject failed: ${res.status}`);
    },
    publicUrl(key) {
      return composePublicUrl(env.CDN_BASE_URL ?? "", key);
    },

    async presignPut(key, contentType, expiresInSeconds) {
      const url = new URL(objectUrl(key));
      url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));

      const signed = await client.sign(url.toString(), {
        method: "PUT",
        headers: { "content-type": contentType },
        aws: {
          signQuery: true,
          // aws4fetch lists `content-type` in UNSIGNABLE_HEADERS, so without
          // this it would be dropped from the signature and the presigned URL
          // would accept a body of ANY type. Signing it pins the upload to
          // exactly the content type we asked for — the browser must send the
          // same value or the signature fails. It is not the only guard
          // (headObject re-checks what landed), but it is the cheapest one.
          allHeaders: true,
        },
      });
      return signed.url;
    },

    async headObject(key) {
      const res = await client.fetch(objectUrl(key), { method: "HEAD" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`storage headObject failed: ${res.status}`);

      const length = res.headers.get("content-length");
      return {
        contentType: res.headers.get("content-type"),
        contentLength: length === null ? null : Number(length),
      };
    },
  };
}
