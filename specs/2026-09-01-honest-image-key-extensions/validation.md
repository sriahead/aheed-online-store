# Image keys carry the real file extension (validation)

Run from a fresh context. Nothing here touches production data or adds a migration.

> **Testing strategy.** This is pure-function work plus three one-line call-site changes, so unit
> tests carry it. The one thing a test cannot establish is the claim the whole slice rests on — that
> the key validators guard only the browser-upload path — so R6 is backed by reading every call
> site, not by a passing assertion.

| Req | How to verify |
|---|---|
| R1 | `npx vitest run tests/product-image.test.ts` — the mapping cases pass. |
| R2 | Same file: `IMAGE/PNG`, `image/jpeg; charset=binary` and `"  image/webp  "` each resolve. |
| R3 | Same file: `application/octet-stream`, `null`, `undefined` and `""` all return `.bin`. **This is the row that matters** — a `.webp` fallback would reintroduce the exact defect. |
| R4 | `buildProductImageKey(id)` and `buildCampaignImageKey(id)` with no second argument both match `/\.webp$/`. Confirms no browser-upload key changed. |
| R5 | Both builders with `image/png` match `/\.png$/`; with `image/jpeg`, `/\.jpg$/`. |
| R6 | `npx vitest run tests/product-image.test.ts tests/campaign-image.test.ts` — a PNG-typed key is **rejected** by both validators and a default key accepted. Then **read the call sites** to confirm the validators guard only the browser upload: `features/admin/campaign-image.ts:89`, `features/admin/product-image.ts:124` and `:180`. `grep -rn "isProductImageKey\|isCampaignImageKey" app/ lib/ features/ components/` must show no use on an AI or copy path. |
| R7 | Read `lib/product-image-pipeline.ts`: `buildProductImageKey(productId, contentType)` and `storage.putObject(key, imageBuffer, contentType)` use the same `contentType` binding. |
| R8 | Read the campaign route: one `const contentType = "image/png"` feeds both the builder and `putObject`. |
| R9 | Read `scripts/copy-product-images.ts`: one `copiedType` binding feeds `buildProductImageKey` and `putObject`. |
| R10 | Covered in `tests/product-image.test.ts` — a PNG-built key is not a placeholder. The placeholder rule keys on the `main` stem, not the extension. |
| R11 | The new cases import only from `@/lib/product-image` and `@/lib/campaign-image`; no `DATABASE_URL` or `S3_*` is read. |
| R12 | `git diff origin/staging --name-only -- prisma/` is empty; no key-rewriting script is added. |
| R13 | `git diff origin/staging -- CHANGELOG.md` shows an entry referencing #364. |
| R14 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` all exit 0. CI on the PR is the authority. |

## Optional live check

Not required, and not run during Build. Under `npm run preview` with Workers AI credentials, trigger
a campaign banner generation and confirm the resulting `DepartmentCampaign.imageKey` ends `.png` and
that the CDN serves it. Per `CLAUDE.md` this is exactly the kind of raster asset that cannot be
verified locally against the CDN (hotlink protection returns 403 for a `localhost` referer), so the
key shape is the checkable part locally and the render belongs on a deployed environment.

## Notes for the validator

- **R6 is the load-bearing claim of this slice, and it is a reading task.** The issue kept the
  `.webp` suffix because it believed the validators constrained it. They do not — they guard the
  browser upload only. If that turns out to be wrong somewhere, the correct response is to widen the
  validators deliberately, not to revert the builders to lying.
- **R3 is not pedantry.** The obvious default for an unknown type is `.webp`, and it would restore
  the original defect for exactly the inputs nobody anticipated.
- Existing objects are untouched: a PNG already stored under a `.webp` key keeps working, because
  the CDN serves on the stored content type. Keys are immutable here by design.
