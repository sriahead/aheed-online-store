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
  /**
   * `GetObject` (#518) — read an object's bytes back, or null if it isn't there.
   *
   * The port had no read primitive at all until this slice: the app composes a
   * public CDN URL for display (`publicUrl`) and never needed the bytes
   * server-side. Copying an image between environments does — and it cannot go
   * through the CDN instead, because both zones enforce hotlink/referer
   * protection (see CLAUDE.md), so the bytes have to come from the S3 API.
   *
   * Returns null on 404 rather than throwing, matching `headObject`'s posture:
   * a missing object is a legitimate answer to "is this key backed by
   * anything?", and a row outliving its object is a case this repo has already
   * hit for real (#502).
   */
  getObject(key: string): Promise<ArrayBuffer | null>;
  /**
   * `DeleteObject` (#211) — decided as an inline delete over a scheduled sweep:
   * simpler, no new infra (wrangler.toml still has no cron triggers). Covers
   * superseded/removed images; does NOT cover an abandoned upload (an object
   * with no ProductImage row ever written), which stays open under #174. A
   * missing key is not an error — S3's DeleteObject is idempotent on a
   * not-found key, and callers here always pass a key they just confirmed
   * existed, so this is a courtesy rather than a load-bearing check.
   */
  deleteObject(key: string): Promise<void>;
}

/** Pure helper (unit-tested): compose a public URL from a base + relative key. */
export function composePublicUrl(cdnBase: string, key: string): string {
  return `${cdnBase.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}

/**
 * Pure helper (unit-tested): how a `GetObject` response becomes bytes-or-null.
 *
 * Extracted for the same reason `composePublicUrl` is. The decision callers
 * actually depend on — "a missing object is null, any other failure throws" —
 * is the part worth pinning, and pulling it out is what lets a test reach it
 * with no credentials, no network and no Worker request context.
 */
export async function readGetObjectResponse(res: Response): Promise<ArrayBuffer | null> {
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`storage getObject failed: ${res.status}`);
  return await res.arrayBuffer();
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

    async getObject(key) {
      return readGetObjectResponse(await client.fetch(objectUrl(key), { method: "GET" }));
    },

    async deleteObject(key) {
      const res = await client.fetch(objectUrl(key), { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        throw new Error(`storage deleteObject failed: ${res.status}`);
      }
    },
  };
}
