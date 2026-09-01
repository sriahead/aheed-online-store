# Image keys carry the real file extension (build notes)

Written at the end of Build, before the Clear. Branch `fix/image-key-extension`, cut from a
freshly-fetched `origin/staging`.

No data changes, no migration, nothing run against production.

## What changed and why

- **`lib/product-image.ts`** — `imageExtensionForContentType` (pure), and `buildProductImageKey`
  gains an optional `contentType` defaulting to `IMAGE_CONTENT_TYPE`.
- **`lib/campaign-image.ts`** — same for `buildCampaignImageKey`; it now imports the shared helper
  rather than redeclaring the rule, which its own header already said was the intent.
- **`lib/product-image-pipeline.ts`**, **`app/api/admin/campaign-images/generate/route.ts`**,
  **`scripts/copy-product-images.ts`** — each passes the content type it is about to store.

## The finding that made this small

`#364` had recorded that the `.webp` suffix "has to keep passing `isCampaignImageKey`, which the
browser-upload path enforces on every attach", and framed the fix as either a server-side transcode
or a widening of the validators that "touches the validation both upload paths depend on".

**Checking the call sites showed that constraint does not exist.** `isProductImageKey` and
`isCampaignImageKey` are called in exactly three places —
`features/admin/campaign-image.ts:89`, `features/admin/product-image.ts:124` and `:180` — all on the
browser attach path. A server-generated key never passes through either. So the suffix was being
held hostage by a check the AI code path does not run.

That collapses the issue's two options into a third, smaller one: leave the validators alone, leave
the browser path alone, and let only the three server-side call sites say what they actually store.

**The transferable bit: an issue's own account of *why* something was deferred is a claim, not a
constraint.** This one was written by whoever accepted the trade in P8.5f, repeated verbatim into
the campaign route's comment, and read as settled by every slice after it — including two of mine
this session, which propagated the defect while quoting the same reasoning.

## Decisions taken during the build

**`.bin` for an unknown content type, not `.webp`.** The obvious default is the one that recreates
the bug for precisely the inputs nobody anticipated. The extension is cosmetic to serving — the CDN
answers on the stored content type — so an honest `.bin` costs nothing and is visible if it ever
appears.

**The validators stay WebP-only**, with docstrings now saying so deliberately rather than by
omission. Widening them would let a client claim a non-WebP key on the one path that genuinely is
WebP-only.

**Existing keys are not rewritten.** A PNG already stored under a `.webp` name keeps working; keys
are immutable here by design, and renaming would mean new objects and repointed rows for no
user-visible gain.

## Two stale docstrings fixed in passing

- `isPlaceholderImageKey` asserted that `buildProductImageKey` "only ever emits
  `products/{productId}/{uuid}.webp`" — the basis for its own reasoning, and no longer true. Reworded
  to key on the `main` stem, which is what actually distinguishes a placeholder.
- The campaign route's comment described the mismatch as accepted and pointed at
  `lib/product-image-pipeline.ts` as precedent. Both now describe the fix.

## What ran during Build

| Row | Result |
|---|---|
| R1–R5, R10 | `tests/product-image.test.ts` — 34 passed |
| R6 | both validators reject a PNG-built key and accept a default one; call sites read and confirmed browser-path-only |
| R11 | `tests/campaign-image.test.ts` — 15 passed |
| R14 | lint, typecheck, format:check green; **865 tests across 72 files** |

## Deviations from the spec

None.

## Known-shaky areas

- **No live check was run.** Nothing here needs a database, but the campaign-generation path has not
  been exercised end to end with real Workers AI credentials to see a `.png` key land in
  `DepartmentCampaign.imageKey`. `validation.md` names it as an optional live check and notes that
  the CDN half of it cannot be done locally at all — `CLAUDE.md` records raster assets returning 403
  for a `localhost` referer.
- **The `.bin` branch has never fired in practice.** It is unit-tested, but no real content type has
  reached it; if one ever does, the key is honest but the pipeline arguably should have refused the
  bytes earlier, which is deliberately a separate question.
