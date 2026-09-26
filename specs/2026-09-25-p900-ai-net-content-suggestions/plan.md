---
id: p900-ai-net-content-suggestions-plan
title: "#900 — AI-suggested net content with image provenance (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-25
visibility: internal
summary: An offline, model-agnostic AI step suggests each product's net content from its name, unit label and confirmed real photos. Staff accept, edit or reject each suggestion; nothing writes to a product without them. Image provenance becomes data.
tags: [catalogue, net-content, ai, workers-ai, staff-panel, pilot, p9-2]
related: [architecture]
---

# #900 — AI-suggested net content with image provenance (plan)

`requirements.md` holds the checkable acceptance criteria. This file holds the reasoning a reader
needs to trust that they are the right ones.

**Goal:** give real products net content without typing it by hand, and without any path by which
a wrong value reaches a shopper unreviewed. Ship the tooling, then pilot it on production's real
catalogue and measure accuracy, review rate, time and cost before deciding whether to scale.

## Why this slice exists

`#398` added `Product.netContentAmount`/`netContentUnit` so the displayed price per kg or litre is
**derived** from the pack size rather than typed freehand in `unitLabel`. That matters because of
the UK Price Marking Order. `#397`'s pack-size facet and `#664`'s unit-price sort read the same
columns. `#697` measured that no product carries them, so all three features are inert.

`#877` fixed this for the generated demo catalogue only. `#697`'s remaining question was how real
products get net content. At `/propose` (2026-09-25) the owner chose **AI suggestions that staff
confirm**, over a deterministic parser and over plain hand entry. The owner then asked for the
**cheapest capable model** and a **model-agnostic design**.

## What production actually holds (measured 2026-09-25)

The owner ran a read-only measurement against production (`ep-young-glitter`):

| | Aheed | SriMart |
|---|---|---|
| Products (all active) | 80 | 11 |
| With net content | 0 | 0 |
| Pack size in the name / in `unitLabel` / in either | 61 / 41 / 62 | 0 / 0 / 0 |
| With images / images reviewed | 80 / 20 | 11 / 3 |

**The "~2,080 real Aheed products" figure was a misattribution.** It was measured on dev, where
2,000 rows are the generated catalogue (corrected on `#697` and recorded on `#900`). Production
holds the curated seed catalogue. Aheed's real range has not been loaded. So the pilot is **80
products**, not the 50–100 real products first proposed.

## Design

### 1. Image provenance becomes data

`ProductImage` cannot currently tell a staff upload from an AI-generated or Open Food Facts image,
so no image can be trusted as evidence. A new non-null `ProductImage.source` column fixes that:

- `UNKNOWN`: the default, which every **existing** row receives. There is no backfill. Guessing
  provenance from a storage key is exactly the unverified inference this slice exists to avoid.
- `STAFF_UPLOAD`: written by the two staff upload paths (`setPrimaryProductImage`,
  `addProductImage` in `lib/repositories/products.ts`).
- `STAFF_CONFIRMED_PHOTO`: set by staff on an `UNKNOWN` image from the product page, meaning "this
  is a real photo of this product's pack". It is reversible back to `UNKNOWN`.
- `OPEN_FOOD_FACTS` / `AI_GENERATED`: written by the image pipeline
  (`lib/product-image-pipeline.ts`), which now reports which path produced the image.
- `PLACEHOLDER`: written by `prisma/seed.ts` for new seed rows.

**Only `STAFF_UPLOAD` and `STAFF_CONFIRMED_PHOTO` count as photo evidence.** An AI-generated image
is rendered *from the product name*, so a size read off it only repeats the name. An Open Food
Facts keyword match can be a different product or size. Staff therefore cannot mark either of those
as a confirmed photo.

`saveGeneratedProductImage` gains a **required** `source` parameter, so the type checker finds all
four callers (two API routes and two scripts). `scripts/copy-product-images.ts` carries the origin
row's source across environments rather than inventing one.

### 2. A model-agnostic suggester

`lib/net-content-suggester.ts` defines a `NetContentSuggester` interface. The only implementation
calls the Cloudflare Workers AI REST API with the existing `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`, the same transport as `lib/search-synonym-proposals.ts`. There is no AI
binding and no new credential.

The model id resolves from the script's `--model` flag, then the optional `NET_CONTENT_AI_MODEL`
setting in `lib/config`, then a default constant. Every suggestion row records the model that made
it, so two models can be compared on the same products later.

**Default model: `@cf/google/gemma-4-26b-a4b-it`.** On 2026-09-25 it was the cheapest multimodal
text model in the Workers AI catalogue: 9,091 neurons per million input tokens and 27,273 per
million output tokens, about 2.7 times cheaper than `@cf/meta/llama-4-scout-17b-16e-instruct`
(24,545 / 77,273). `@cf/meta/llama-3.2-11b-vision-instruct` has cheaper input but was not chosen,
because its Meta licence has to be accepted per account before first use. No Workers AI model is
free per call. Every account gets **10,000 neurons per day at no charge**, shared with the image
pipeline, synonym proposals and the shop-your-list pre-pass, then pays $0.011 per 1,000 neurons.

**The docs do not show Gemma 4's image input shape.** Build therefore proves it with one real call
before relying on it, including whether it accepts **WebP**, the format staff uploads are stored
in. If Gemma 4 rejects images, Build stops and reports it. Switching the default to Llama 4 Scout
is then a one-constant change, but it needs owner sign-off because it costs more.

### 3. Output is validated, not trusted

This follows the precedent in `lib/search-synonym-proposals.ts` and `specs/architecture.md`'s AI
rule. A suggestion is kept only if:

- the amount is a whole number of at least 1;
- the unit is one of the five `NetContentUnit` values;
- confidence is a whole number from 0 to 100;
- the evidence source is `PHOTO`, `NAME` or `UNIT_LABEL`.

Two further checks are the anti-hallucination guard:

- For `NAME` or `UNIT_LABEL`, the quoted evidence must literally appear (case-insensitive) in the
  product's name or unit label. A model cannot cite text that isn't there.
- `PHOTO` is accepted only when a photo was actually sent.
- An `EACH` suggestion is accepted only when its quoted evidence contains the suggested count as
  a number. The model cannot turn "not applicable" into `1 EACH` (owner decision, see Deliberately
  excluded).

Anything else becomes a `NO_ANSWER` row. It is recorded rather than dropped, so coverage is
measurable and the same product is not re-attempted on every run.

### 4. A free cross-check against the unit label

Many real labels state a price per kg or litre (`£6.98 / kg`), or a pack price for a stated size
(`£4.49 / 500g`). `lib/net-content-label-check.ts` compares the suggestion against that and
records `AGREES`, `DISAGREES` or `NOT_CHECKABLE`. It is deterministic, costs nothing, and shows
staff the one fact most likely to catch a wrong suggestion.

Worked examples from production:

- `Chicken Nuggets 500g`, 349p, `£6.98 / kg`. A 500 g suggestion derives 698p per kg, so
  `AGREES`.
- `Shampoo 400ml`, 299p, `£7.48 / litre`. A 400 ml suggestion derives 747.5p per litre, within the
  1p tolerance, so `AGREES`.

### 5. Runs out of band, bounded

`scripts/suggest-net-content.ts` runs in Node against a named env file, following
`scripts/fill-product-images.ts`: an explicit `--env-file`, a printed host, and a bare
`@prisma/client`. It writes **only** `NetContentSuggestion` rows and never touches `Product` or
`ProductImage`. It is bounded twice:

- `--limit`: default 10, maximum 100.
- `--neuron-budget`: default 5,000, half the shared daily free allowance. The run stops starting
  new calls once its estimate, from reported token usage times a per-model rate table, reaches the
  budget.

A model missing from the rate table refuses to run unless `--unpriced-ok` is passed, and then
`--limit` is the only bound.

Failures are kept separate from answers:
- **Missing credentials:** the run refuses before writing anything.
- **Transport error** (a throttle, a non-OK response, or a call over the 60-second deadline): no
  row is written for that product. Recording it as `NO_ANSWER` would permanently mark the product
  as attempted over a transient fault. The run stops after 3 consecutive transport errors. There is no staff button, schedule or request-path call, which keeps
it inside `specs/architecture.md`'s rule that AI runs offline and proposes, never applies.

### 6. The staff review queue: `/staff/net-content`

Staff and store admins can open it, matching `/staff/products`. Each PENDING suggestion shows:

- the product (linked), its unit label and price;
- the suggested pack size and the unit price it would produce;
- confidence, evidence source and the quoted evidence;
- the label check result;
- a photo thumbnail when a photo was used.

The actions:

- **Accept** writes the suggestion to the product.
- **Edit** writes corrected values. Identical values count as Accept.
- **Reject** records the decision and leaves the product alone.

Accept and Edit refuse when the product already has net content, so the queue can never silently
overwrite a value a person entered. They write the product, its derived `unitPricePencePerBaseUnit`
and the suggestion's outcome in one `getPrismaWs()` transaction.

A pilot summary at the top of the page, computed from the rows, shows:

- counts per status;
- the acceptance rate;
- the no-answer share;
- how the label check split among reviewed suggestions;
- mean latency;
- total tokens;
- the model ids used.

That is the measurement the owner asked for, and it lives in the product, not in a script's
scrollback.

The page lands on all three surfaces `CLAUDE.md` requires (`PanelNav` in both tiers, the hub, and
`docs/staff-playbook/staff-tabs-guide.md`), and its refusal branch renders `PanelRefusal`.

## Deliberately excluded

- **Running the production pilot.** This slice ships the tooling and proves it on dev. The
  production run, 80 Aheed products starting with `--limit 10`, is an owner action after promotion.
  Its results are recorded on a follow-up issue filed at `/build-notes`. The assistant cannot read
  production under auto mode.
- **Scaling beyond the pilot.** That is a separate decision made from the pilot's numbers.
- **Any automatic write to `Product`.** This is the whole safety property. There is no auto-accept
  above a confidence threshold, and no bulk accept.
- **A deterministic parser as a suggester.** The owner declined it at `/propose` in favour of AI.
  The label check (§4) is a cross-check shown to staff, not a suggester.
- **A barcode column, and Open Food Facts' `quantity` field.** `Product` has no barcode, so the
  exact-match lookup cannot happen. That would need its own issue.
- **Backfilling `ProductImage.source` on existing rows.** Existing rows stay `UNKNOWN` until staff
  confirm them (§1).
- **Letting staff mark a `STAFF_UPLOAD` image as "not a pack photo".** A staff upload is the
  owner-approved proxy for a real photo. Refining it waits for the pilot to show whether it
  matters.
- **Pack-quantity semantics for multipacks** (`Still Water 6 x 1.5L`). The model proposes and
  staff decide. No rule is encoded here.
- **A "not applicable" state, and no automatic `1 EACH`.** Owner decision at spec approval
  (2026-09-25): a product where net content does not apply, such as a phone charger, **stays
  without a net-content value** for this pilot. "Known to be one item" must not be confused with
  "not applicable". So the prompt tells the model to give no answer when net content does not
  apply, and the validator (R11) accepts an `EACH` suggestion only when its quoted evidence
  literally states that count, such as `6 pack` or `pack of 4`. Anything else becomes
  `NO_ANSWER`. Staff can still enter `EACH` by hand on the product form. A dedicated
  not-applicable marker is left to the pilot's findings.
- **Re-attempt policy beyond `--include-attempted`.** A product with any earlier suggestion row is
  skipped by default. The flag re-attempts products with no PENDING row, for example after staff
  confirm a photo.
- **`#664` (sort by unit price)** and **`#397`'s facet**: neither changes. Both start working on
  whatever data this slice lets staff accept.

## Open items carried forward

- **Gemma's terms of use.** The Workers AI model page links Google's Gemma 4 licence. It is not a
  blocker for an internal pilot, but the owner should read it before the tooling is used at scale.
- **Image input shape and WebP support** for the default model are unproven until Build's probe
  (§2).
- **The production pilot run and its results.** A follow-up issue is filed at `/build-notes`.
- **The daily free allowance is shared.** A pilot run on a day the image pipeline is busy can still
  exceed it. The budget flag bounds only this script's own share.
