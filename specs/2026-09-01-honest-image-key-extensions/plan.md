---
id: honest-image-key-extensions
title: "Image keys carry the real file extension (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-01
visibility: internal
summary: Both image key builders always suffixed .webp while the AI and copy paths store PNG or whatever a remote server sent, so every server-generated key asserted a format its object was not; the extension now follows the real content type.
tags: [images, storage, ai, keys]
related: [roadmap, architecture, adr-003-storage-abstraction]
---

# Image keys carry the real file extension (plan)

**Goal:** make a stored image key true. This repo's standing rule is that image keys are meaningful
and immutable — and a meaningful key cannot also be wrong.

Issue **#364**, open since P8.5f and propagated (not introduced) by every image slice since,
including the 62 images this session's `#521` filled.

## What was wrong

`buildProductImageKey` and `buildCampaignImageKey` both suffixed `.webp` unconditionally:

```ts
const key = buildCampaignImageKey(categoryId);            // always ".webp"
await getStorage().putObject(key, image, "image/png");    // Workers AI returns PNG
```

Nothing rendered incorrectly. The object is stored with its **real** content type and the CDN
answers on that, so the browser was always told the truth. The key was the only thing lying — which
is why this survived three slices without anyone noticing from the outside.

Three paths were affected, all server-side:

- `lib/product-image-pipeline.ts` — Workers AI (PNG) or Open Food Facts (whatever the remote sent).
- `app/api/admin/campaign-images/generate/route.ts` — Workers AI (PNG).
- `scripts/copy-product-images.ts` — copies the source object's bytes and content type verbatim.

## The reasoning that kept it, and why it did not hold

`#364` records the original justification: the `.webp` suffix "has to keep passing
`isCampaignImageKey`, which the browser-upload path enforces on every attach."

**That was checked and it is not true.** `isCampaignImageKey` and `isProductImageKey` guard exactly
one path — the browser upload — and a server-generated key never passes through either. Verified by
reading every call site: `features/admin/campaign-image.ts:89`, `features/admin/product-image.ts:124`
and `:180`, all on the attach path. So the suffix was being constrained by a check the AI code path
never runs.

That is what makes this a small change rather than the larger one the issue anticipated. Neither
option it proposed was needed in full: no server-side transcode (option 1), and no widening of the
validators (the expensive half of option 2).

## Scope (this slice)

**`imageExtensionForContentType(contentType)`** in `lib/product-image.ts` — pure, mapping the types
this app actually stores, tolerating parameters (`image/jpeg; charset=binary`) and case.

**An unknown type gets `.bin`, not `.webp`.** Falling back to `.webp` would quietly reintroduce the
exact lie this function was written to remove. The extension is cosmetic to serving, so an honest
`.bin` costs nothing and is a visible signal that something unexpected arrived.

**Both builders take an optional `contentType`, defaulting to `IMAGE_CONTENT_TYPE`.** Every
browser-upload call site is therefore unchanged, byte for byte — that path is WebP end to end, its
presigned PUT pinned to `IMAGE_CONTENT_TYPE` and its attach step re-checking `headObject`'s content
type.

**The three server-side paths pass the real type.**

**The validators stay WebP-only, deliberately.** Widening them would let a client claim a
non-WebP key on the one path that is genuinely WebP-only, and buy nothing.

## Deliberately excluded

- **Server-side transcoding to WebP** (`#364`'s option 1). It burns Worker CPU on a path already
  waiting on an external AI call, and cannot serve the browser-upload path at all, since the Worker
  never sees those bytes — the client encodes on a canvas.
- **Rewriting existing keys.** Keys are immutable by design; the objects already stored under a
  `.webp` name with PNG bytes keep working exactly as they do today, because the CDN serves on the
  stored content type. Renaming them would mean new objects, repointed rows, and no user-visible
  gain.
- **Rejecting an unexpected content type outright.** Arguably the pipeline should refuse a
  non-image; that is a different decision about what the pipeline accepts, not about what a key is
  called.

## Open items carried forward

- **`#511`** — shop-row scrollers, still blocked on a page-cost decision about row width.
- The six S3/CDN secrets for the `production` GitHub environment, outstanding from `#518`.
