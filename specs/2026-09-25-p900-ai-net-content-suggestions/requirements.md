# #900 — AI-suggested net content with image provenance (requirements / acceptance criteria)

This slice closes `#900`, split from `#697`, which stays open. It builds on `#398`'s net-content
columns and `components/product/unit-price.ts`. An offline script asks a configurable Workers AI
model to suggest each product's net content from its name, its unit label and any
**staff-sourced** photo. Every suggestion is validated and stored as a row. Staff accept, edit or
reject it on `/staff/net-content`, and nothing reaches `Product` without them. `ProductImage` gains
a `source` column so real photos can be told apart from generated ones. Read `plan.md` for why.

Terms used below:
- **Eligible photo source:** `STAFF_UPLOAD` or `STAFF_CONFIRMED_PHOTO`.
- **Default model:** `@cf/google/gemma-4-26b-a4b-it`.
- **Dev:** the database named by `.env`/`.dev.vars`, host `ep-dry-morning-zab7dx08`. Never staging
  or production.

## Schema and migration

R1. `prisma/schema.prisma` declares `enum ProductImageSource` with exactly the members `UNKNOWN`,
    `STAFF_UPLOAD`, `STAFF_CONFIRMED_PHOTO`, `OPEN_FOOD_FACTS`, `AI_GENERATED` and `PLACEHOLDER`.
    `model ProductImage` has a field `source ProductImageSource @default(UNKNOWN)`, which is
    non-optional.

R2. `prisma/schema.prisma` declares three enums and one model, with no `Json` field:
    - `enum NetContentSuggestionStatus` with members `PENDING`, `ACCEPTED`, `EDITED`, `REJECTED`,
      `NO_ANSWER`;
    - `enum NetContentEvidenceSource` with members `PHOTO`, `NAME`, `UNIT_LABEL`;
    - `enum UnitLabelCheck` with members `AGREES`, `DISAGREES`, `NOT_CHECKABLE`;
    - `model NetContentSuggestion`, with the fields below.

    | Field | Type | Notes |
    |---|---|---|
    | `id` | `String` | uuid |
    | `vendorId` | `String` | FK to `Vendor` |
    | `productId` | `String` | FK to `Product`, `onDelete: Cascade` |
    | `productImageId` | `String?` | FK to `ProductImage`, `onDelete: SetNull` |
    | `amount` | `Int?` | |
    | `unit` | `NetContentUnit?` | |
    | `confidence` | `Int?` | |
    | `evidenceSource` | `NetContentEvidenceSource?` | |
    | `evidenceText` | `String?` | |
    | `unitLabelCheck` | `UnitLabelCheck?` | |
    | `model` | `String` | |
    | `latencyMs` | `Int` | |
    | `inputTokens` | `Int?` | |
    | `outputTokens` | `Int?` | |
    | `status` | `NetContentSuggestionStatus` | |
    | `finalAmount` | `Int?` | |
    | `finalUnit` | `NetContentUnit?` | |
    | `reviewedByUserId` | `String?` | FK to `User` |
    | `reviewedAt` | `DateTime?` | |
    | `createdAt` | `DateTime` | `@default(now())` |

    The model carries `@@index([vendorId, status])` and `@@index([productId])`.

R3. Exactly one new directory is added under `prisma/migrations/` on this branch. Its
    `migration.sql`:
    - contains no `DROP` statement of any kind;
    - contains no `UPDATE` statement;
    - leaves the three `pg_trgm` indexes from `20260820143949_p7_5de_order_search_trigram`
      untouched.

    It is applied to dev, and `npx prisma migrate status` against dev reports the schema up to
    date.

## Provenance writes

R4. `setPrimaryProductImage` writes `source: "STAFF_UPLOAD"` on both branches: when it creates a
    row and when it replaces an existing primary row's `storageKey`. `addProductImage` also writes
    `source: "STAFF_UPLOAD"`. Both are in `lib/repositories/products.ts`.

R5. `runProductImagePipeline` returns a `source` field. It is `"OPEN_FOOD_FACTS"` when the image
    came from Open Food Facts and `"AI_GENERATED"` when it came from image generation.
    `saveGeneratedProductImage` takes a **required** `source` parameter and writes it on the row
    it creates. Every caller passes one:
    - `app/api/admin/product-images/generate/route.ts`
    - `app/api/admin/jobs/backfill-images/route.ts`
    - `scripts/fill-product-images.ts`
    - `scripts/copy-product-images.ts`, which passes the origin row's own `source`

R6. Every `ProductImage` row that `prisma/seed.ts` creates is written with `source: "PLACEHOLDER"`:
    both nested `images.create` sites and the generated catalogue's `productImage.createMany`.

R7. The only code in `lib/`, `features/`, `app/` and `scripts/` that changes an **existing**
    `ProductImage` row's `source` is the R8 action, plus `setPrimaryProductImage`'s replace branch
    (R4).

R8. A server action in `features/admin/product-image.ts` behaves as follows:
    - It is gated by `requireVendorRole("STAFF", "ADMIN")` and scoped to the caller's vendor.
    - It changes an image's `source` from `UNKNOWN` to `STAFF_CONFIRMED_PHOTO`, and from
      `STAFF_CONFIRMED_PHOTO` back to `UNKNOWN`.
    - It refuses, without writing, for any other starting source, and for an image belonging to
      another vendor's product.

    `components/staff/ProductImageManager.tsx` shows each image's source as text. It renders the
    confirm/unconfirm control only on images whose source is `UNKNOWN` or `STAFF_CONFIRMED_PHOTO`.

## Suggester (model-agnostic)

R9. `lib/net-content-suggester.ts` exports:
    - a `NetContentSuggester` interface;
    - a factory that takes a model id and returns a Workers AI implementation;
    - `DEFAULT_NET_CONTENT_MODEL = "@cf/google/gemma-4-26b-a4b-it"`.

    `lib/config.ts`'s AI schema adds an optional `NET_CONTENT_AI_MODEL` setting. The model is
    resolved in this order: the script's `--model` flag, then `NET_CONTENT_AI_MODEL`, then
    `DEFAULT_NET_CONTENT_MODEL`.

    No file other than `lib/net-content-suggester.ts` builds a Workers AI request for net content.

R10. The Workers AI implementation:
    - POSTs to `https://api.cloudflare.com/client/v4/accounts/<id>/ai/run/<model>` using
      `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from `getAiEnv()`;
    - includes image bytes in the request only when it is given a photo;
    - aborts any call that has not completed within 60 seconds;
    - returns a typed result, never a thrown error, in each of these cases: **not configured**
      (either credential absent); **transport error** (the request throws, times out, or the
      response is not OK); **reply** (the model's raw text, which R11 then validates).

R11. `lib/net-content-suggester.ts` exports a pure function that validates the model's raw text
    reply into either a suggestion or a no-answer. It tolerates prose around a single JSON object.
    It accepts a reply only if all of these hold:
    - `amount` is a whole number of at least 1;
    - `unit` is one of `GRAM`, `KILOGRAM`, `MILLILITRE`, `LITRE`, `EACH`;
    - `confidence` is a whole number from 0 to 100 inclusive;
    - `evidenceSource` is `PHOTO`, `NAME` or `UNIT_LABEL`;
    - `evidence` is a non-empty string of at most 200 characters;
    - when `evidenceSource` is `NAME` or `UNIT_LABEL`, `evidence` appears case-insensitively
      within the product's `name` or `unitLabel` respectively;
    - when `evidenceSource` is `PHOTO`, a photo was sent;
    - when `unit` is `EACH`, `evidence` contains `amount` written as a whole number that is not
      part of a larger number. For example, `6 pack` supports 6, but `16 pack` does not support
      6.

    Every other reply is a no-answer. That includes malformed JSON, missing fields, a fractional
    amount, an explicit null answer, and `1 EACH` for a product whose evidence states no count.

    The prompt tells the model to return a null answer when net content does not apply to the
    product, and never to use `EACH` for that case. A product where net content does not apply
    therefore ends with no net-content value (owner decision, 2026-09-25).

R12. `lib/net-content-label-check.ts` exports a pure function. It takes `basePrice` in pence,
    `unitLabel` and a suggested net content, and returns `AGREES`, `DISAGREES` or
    `NOT_CHECKABLE`. A price means a `£` amount, and a unit token is matched case-insensitively.
    - **Per-reference form.** `unitLabel` is a price followed by `/` and one of `kg`, `L`,
      `litre`, `100g` or `100ml`. If the suggestion's dimension (mass or volume) matches the
      label's, the function compares the suggestion's derived price per that reference unit with
      the stated price, in exact pence. It returns `AGREES` when they differ by at most 1p and
      `DISAGREES` otherwise. A dimension mismatch, or an `EACH` suggestion, is `DISAGREES`.
    - **Pack form.** `unitLabel` is a price followed by `/` and a number with `g`, `kg`, `ml` or
      `L`, and its price equals `basePrice`. The function compares that quantity, normalised to
      grams or millilitres, with the suggestion: equal is `AGREES`, and otherwise `DISAGREES`.
    - Every other label is `NOT_CHECKABLE`. That includes `/ pack`, `each`, `/ tin`, and a pack
      form whose price differs from `basePrice`.

    The unit test asserts at least these rows:

    | Name | Price | Label | Suggestion | Result |
    |---|---|---|---|---|
    | Chicken Nuggets 500g | 349p | `£6.98 / kg` | 500 GRAM | `AGREES` |
    | Shampoo 400ml | 299p | `£7.48 / litre` | 400 MILLILITRE | `AGREES` |
    | Halal Beef Mince 500g | 449p | `£4.49 / 500g` | 500 GRAM | `AGREES` |
    | Basmati Rice 5kg | 899p | `£8.99 / 5kg` | 5000 GRAM | `AGREES` |
    | Chicken Nuggets 500g | 349p | `£6.98 / kg` | 1 KILOGRAM | `DISAGREES` |
    | Coconut Milk | 129p | `£1.29 / tin` | 400 MILLILITRE | `NOT_CHECKABLE` |

## Run script

R13. `scripts/suggest-net-content.ts` takes these flags:
    - `--env-file <path>`: required, and the script exits non-zero without it;
    - `--limit N`: default 10, and exits non-zero for a value below 1 or above 100;
    - `--vendor <slug>`;
    - `--product <id>`;
    - `--model <id>`;
    - `--neuron-budget N`: default 5000;
    - `--unpriced-ok`;
    - `--include-attempted`.

    It prints the database host before any query. It creates rows only in `NetContentSuggestion`.
    It issues no create, update or delete against `Product` or `ProductImage`.

R14. A product is eligible when all of these hold:
    - `isActive` is true;
    - `netContentAmount` is null;
    - it has no `PENDING` suggestion;
    - it has no suggestion row at all, unless `--include-attempted` is given, in which case earlier
      non-`PENDING` rows are allowed.

    Its photo is its lowest-`sortOrder` image with an eligible photo source. If it has none, it
    has no photo and the model receives name and unit label only.

    Both rules live in pure, exported functions: one builds the eligibility filter from the
    options, and one chooses the photo from a product's images. Both have unit tests.

R15. If the suggester reports **not configured**, the script exits non-zero before writing any
    row. A **transport error** writes no row for that product and counts as "failed" in the
    summary. After 3 consecutive transport errors, the script stops starting new calls. Every
    **reply** produces exactly one `NetContentSuggestion` row:
    - `PENDING`, with `amount`, `unit`, `confidence`, `evidenceSource`, `evidenceText` and
      `unitLabelCheck` set, when R11 accepts the reply;
    - `NO_ANSWER`, with those six fields null, otherwise.

    Every row records `model`, `latencyMs`, `inputTokens`/`outputTokens` (null when the response
    reports no usage), and `productImageId` when a photo was sent.

R16. The script holds a per-model neuron rate table. It has entries for at least
    `@cf/google/gemma-4-26b-a4b-it` (9091 input, 27273 output neurons per million tokens) and
    `@cf/meta/llama-4-scout-17b-16e-instruct` (24545, 77273). The script:
    - exits non-zero before any AI call when the resolved model is not in the table and
      `--unpriced-ok` is absent;
    - stops starting new AI calls once the estimated neurons used so far reach `--neuron-budget`;
    - ends by printing: products attempted, `PENDING` count, `NO_ANSWER` count, failed count,
      total input and output tokens, estimated neurons, and mean latency.

## Staff review queue

R17. `app/(admin)/staff/net-content/page.tsx` calls `requireVendorRole("STAFF", "ADMIN")`. A
    `401` redirects to `/login`. Any other refusal renders `PanelRefusal`.

R18. The page lists only the caller's vendor's `PENDING` suggestions. Each row shows:
    - the product name, linked to `/staff/products/<productId>`;
    - `unitLabel` and the formatted `basePrice`;
    - the suggested pack size via `formatPackSize`;
    - the unit price it would produce via `deriveUnitPriceLabel`;
    - `confidence`, `evidenceSource` and `evidenceText`;
    - `unitLabelCheck`;
    - an image thumbnail when `productImageId` is set.

R19. **Accept**, in one `getPrismaWs()` transaction:
    - sets the product's `netContentAmount` and `netContentUnit` to the suggestion;
    - sets `unitPricePencePerBaseUnit` from `deriveUnitPricePenceForSort`;
    - sets the suggestion's `status` to `ACCEPTED`, `finalAmount`/`finalUnit` to the suggestion,
      and `reviewedByUserId`/`reviewedAt`.

    It writes nothing and returns an error message when any of these hold: the suggestion is not
    `PENDING`, it belongs to another vendor, or the product's `netContentAmount` is already
    non-null.

R20. **Edit** takes an amount and a unit, validated exactly as the product form validates net
    content (`lib/catalogue-form.ts`: whole number of at least 1, unit in `NetContentUnit`). It
    applies R19's transaction and refusals, using the staff values and status `EDITED`. When the
    staff values equal the suggestion's, the status is `ACCEPTED`.

R21. **Reject** sets `status` to `REJECTED` and records `reviewedByUserId`/`reviewedAt`. It never
    writes `Product`, and it refuses a non-`PENDING` or other-vendor suggestion.

R22. The page shows a pilot summary computed from the caller's vendor's rows:
    - counts per status;
    - the acceptance rate, `ACCEPTED ÷ (ACCEPTED + EDITED + REJECTED)`, shown as `n/a` when the
      divisor is 0;
    - the `NO_ANSWER` share of all rows;
    - `AGREES`/`DISAGREES`/`NOT_CHECKABLE` counts among reviewed rows;
    - mean `latencyMs`;
    - total `inputTokens` and `outputTokens`;
    - the distinct `model` values.

R23. `/staff/net-content` appears:
    - in `components/staff/PanelNav.tsx`'s staff-tier and admin-tier branches;
    - as a card on `app/(admin)/staff/page.tsx`;
    - as a section of `docs/staff-playbook/staff-tabs-guide.md` carrying all seven labelled parts,
      with "Who can access" reading `Staff and store admins`.

    `tests/staff-nav-parity.test.ts`, `tests/panel-refusal-coverage.test.ts` and
    `tests/operator-doc-coverage.test.ts` pass.

R24. The new repository module under `lib/repositories/` passes
    `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts`. Each new or
    changed `"use server"` file exports only async functions.

## Persistent docs

R25. `specs/architecture.md`'s AI bullet ("AI does not sit on a public request path…") gains a
    paragraph covering three things:
    - net-content suggestions as an offline, proposed-never-applied use;
    - the model-agnostic suggester with a configurable model id;
    - the rule that only `STAFF_UPLOAD`/`STAFF_CONFIRMED_PHOTO` images count as photo evidence.

R26. `docs/developer-portal/env-setup.md` documents two things:
    - `NET_CONTENT_AI_MODEL`: optional, what it overrides, and the default;
    - how to run `scripts/suggest-net-content.ts`, including its two bounds.

## Live proof (dev only)

R27. Build records in `build-notes.md` the exact request body shape the default model accepted for
    an image, and whether it accepted a WebP image. This comes from at least one real call against
    the Workers AI REST API. If the default model rejects image input or WebP, Build stops before
    the staff UI and reports it rather than changing the default model.

R28. A run against dev with `--limit 5` behaves as follows:
    - it writes exactly as many `NetContentSuggestion` rows as its `PENDING` plus `NO_ANSWER`
      counts;
    - it changes no `Product` row: the count of products with non-null `netContentAmount` is
      identical before and after;
    - a second identical run attempts none of the same products.

R29. A real pack photo uploaded through `/staff/products/<id>` under `npm run preview` produces a
    `ProductImage` row with `source = STAFF_UPLOAD`. A later run with `--product <id>` writes a row
    whose `productImageId` is that image's id.

R30. Under `npm run preview`, signed in as a store staff account on dev:
    - one Accept on `/staff/net-content` leaves the product with the suggested net content, a
      non-null `unitPricePencePerBaseUnit`, and a derived unit price on its storefront product
      page;
    - one Edit leaves status `EDITED` with the staff values on the product;
    - one Reject leaves status `REJECTED` and the product's net content still null.

R31. Under `npm run preview`, `/staff/net-content` redirects a signed-out request to `/login`, and
    renders the `PanelRefusal` message for a signed-in customer account.

## Gates

R32. `npm run kms:validate` exits 0 with no failing files. `npm run kms:build-index` leaves
    `ARTIFACT_INDEX.md` listing this slice's `plan.md`. `npm run kms:assemble:internal` followed by
    `npx next build --webpack` in `kms/site-internal` exits 0.

R33. `CHANGELOG.md` has an entry under `## [Unreleased]` citing `#900` (Gate 4).

R34. `npm run lint`, `npm run typecheck`, `npm run format:check` and `npx vitest run` (run alone)
    all exit 0 after this slice.
