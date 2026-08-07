---
id: adr-003-storage-abstraction
title: "ADR-003 — Object Storage Abstraction (S3-compatible)"
audience: [dev]
type: adr
status: approved
version: "1.0.0"
updated: 2026-08-06
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
- The database stores **relative keys only** (e.g. `products/{sku}/main.webp`) — **never full
  URLs**. The public URL is composed at read time as `${CDN_BASE_URL}/${key}`.
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
