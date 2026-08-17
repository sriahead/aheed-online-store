---
id: adr-003-storage-abstraction
title: "ADR-003 — Object Storage Abstraction (S3-compatible)"
audience: [dev]
type: adr
status: approved
version: "1.2.0"
updated: 2026-08-17
visibility: internal
summary: Access object storage only via the S3-compatible API behind a StorageService port; the DB stores relative keys and URLs are composed at read time.
tags: [adr, storage, r2, s3, portability]
related: [architecture, adr-001-hosting]
---

# ADR-003 — Object Storage Abstraction (S3-compatible)

- **Status:** Accepted.
- **Related:** ADR-001 (hosting), `specs/architecture.md` §3.3, §4.2.

## Context

Product and content images must be cheap to serve and **portable across storage providers**. The
MVP uses Cloudflare R2 (zero egress), but the store must not be locked to it: a later move to AWS S3,
GCP Cloud Storage, MinIO, or self-hosted must be trivial.

## Decision

- Access object storage **only through the standard S3-compatible API** (AWS SDK v3 S3 client
  pointed at the provider endpoint). **No R2-specific SDK or feature** is used.
- Wrap all storage operations in an abstracted **`StorageService` port** (`put`, `get`, `delete`,
  presigned URLs) implemented once in `lib/storage`. Application and domain code depend on the port,
  never on the S3 client.
- The database stores **relative keys only** (e.g. `products/{productId}/{uuid}.webp`) — **never
  full URLs**. The public URL is composed at read time as `${CDN_BASE_URL}/${key}`.
- All configuration comes from env: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
  `S3_REGION`, `CDN_BASE_URL`.

## Consequences

- **Positive:** switching providers is an **env change plus an object copy** (`rclone`/`aws s3
  sync`); because keys are relative and identical across buckets, **no DB rows change and no code
  changes**. Zero image egress on R2 keeps cost low. CDN can be repointed independently of the
  bucket.
- **Constraints accepted:** we forgo R2-only conveniences (bindings, R2-specific APIs) to keep the
  S3 contract clean. Any provider-specific optimisation must live behind the port and must not leak
  into the domain.
- **Rule of thumb:** if a change to the storage provider would require editing anything outside
  `lib/storage` and environment variables, the abstraction has been violated.

## Implementation note (2026-08-12, P6b2 / #167)

Additive only — **no decision above is reopened or superseded.** Recorded here because the port
gained its first write-side capability and the key convention became concrete.

- **The port's actual methods** are `putObject`, `publicUrl`, `presignPut` and `headObject`. The
  Decision section's `(put, get, delete, presigned URLs)` was a sketch of intent, not a signature
  list; `presignPut` is the "presigned URLs" it anticipated. **There is deliberately no delete
  method** — see below.
- **The client is `aws4fetch`, not the AWS SDK v3 S3 client** named in the Decision. Same standard
  S3-compatible API, same SigV4, chosen for Worker bundle size — the same reasoning that put raw
  `fetch` in front of Stripe in P3c. The portability guarantee is unaffected: it rests on the API
  and the relative keys, not on which signer calls it.
- **The concrete product image key is `products/{productId}/{uuid}.webp`.** The
  `products/{sku}/main.webp` example this ADR carried until now was illustrative and **wrong in two
  ways**: `Product` has no `sku` field and never has, and the seed actually writes
  `products/{slug}/main.svg`. Corrected in place above; recorded here so the change is explained
  rather than merely made.
- **Keys are immutable.** Replacing an image writes a new object and repoints
  `ProductImage.storageKey`; nothing is ever overwritten. This keeps a CDN cache purge out of the
  design entirely — overwriting at a fixed key would require one, which would mean a purge-scoped
  Cloudflare API token as a Worker secret and a provider-specific call inside this port, violating
  the rule of thumb above.
- **Consequence accepted:** superseded objects are never deleted and accumulate. That is the price
  of the immutability, tracked in **#174** along with the orphan an abandoned upload leaves between
  the presigned PUT and the row write. A delete method stays absent from the port until that issue
  chooses between an inline delete and a scheduled sweep.
- **Browser-direct upload is the write path.** The Worker signs a short-lived `PUT` and the browser
  uploads to storage directly, so no image byte transits the Worker. This requires **bucket CORS**
  allowing `PUT` from the vendor origins — a per-bucket, per-environment prerequisite invisible to
  the repo, so it is documented in each slice that depends on it rather than assumed.

## Implementation note (2026-08-17, catalogue debt bucket / #211)

Additive only. **#174 was decided, partially:** the port gains a `deleteObject(key)` method (same
`aws4fetch` client, standard S3 `DeleteObject`), called synchronously wherever an image is removed
or replaced. This closes the "delete method stays absent" line above — but only for the
superseded/removed-object half of #174. The abandoned-upload half (an object with no `ProductImage`
row ever written, because the browser tab closed between the presigned `PUT` and the row write)
still has no cleanup path; a scheduled sweep (`wrangler.toml`'s first cron trigger) was considered
and deliberately deferred as bigger infrastructure than this slice's scope, so #174 stays open for
that narrower remainder.
