---
id: p2-6-ai-shop-list-normalisation-plan
title: "P2.6 slice 4 — AI Shop List normalisation over the existing matcher (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-04
visibility: internal
summary: An AI pre-pass turns pasted shop-list text into structured items before the existing deterministic matcher runs. Matching is unchanged; the AI only interprets input, is rate-limited per caller, and degrades to today's behaviour on any failure.
tags: [p2-6, search, ai, shopping-list, rate-limiting]
---

# P2.6 slice 4 — AI Shop List normalisation over the existing matcher (plan)

**Goal:** make "Shop your list" survive how people actually write a shopping list — spelling
mistakes, Desi and transliterated terms, brand names, and pack sizes — without letting a language
model anywhere near the decision of which product a shopper is buying.

This is an upgrade to a shipped feature, not a new one. P3d (`#114`) already delivers
`lib/shopping-list.ts`, `features/cart/match-list.ts`, `features/cart/add-list-to-cart.ts`,
`components/cart/ShopYourList.tsx` and `app/(storefront)/shop-your-list/page.tsx`, with
review-before-add, explicit unmatched flagging and a single candidate query for the whole list.
P2.6 slice 3 (`#566`) then widened matching through the approved synonym dictionary, on both the
query side (`matchProductListTerms`) and the per-line re-check (`resolveLines`). None of that is
rebuilt here.

**What is actually missing** is the step before matching. The matcher is literal substring
matching over product names, so `2kg atta` finds nothing: no product is named "atta", and the
deterministic parser reads `2kg` as a search term rather than a measure, because `LEADING_COUNT`
correctly refuses to treat a digit glued to a unit as a count.

## The split that is the whole design

Free text in, structured items out — `name`, `quantity`, `measure`, `brand` — which are then handed
to the **existing, unchanged** matcher, expanded through slice 3's synonym dictionary.

The AI interprets the shopper's text. The catalogue match is still made deterministically against
real rows. That split is what keeps the feature reviewable, offline-testable, and incapable of
inventing a product: a normalised name only ever becomes *search terms*, and every candidate still
comes from `matchProductListTerms`'s single vendor-scoped query.

Transport is settled by precedent rather than chosen here. `lib/search-synonym-proposals.ts`
(slice 3) already calls Cloudflare's REST API with the existing `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`, on `@cf/meta/llama-3.1-8b-instruct`, parsing the reply as untrusted input.
This slice is that same shape with a different prompt. No new credential, no new binding, no
proprietary AI binding — the vendor-agnostic constraint in ADR-003 and `lib/image-generation.ts`'s
docstring both hold.

## Scope (this slice)

- **`lib/list-normalisation.ts`** — the pre-pass. Prompt building, defensive parsing of the model's
  reply, merging the result back onto the deterministically parsed lines, and the single `fetch`.
  Everything except the `fetch` is pure and unit-tested, matching how `lib/search-ranking.ts` and
  `lib/search-expansion.ts` are split from their callers.
- **Positional realignment, not trust.** The model is asked for one object per input line carrying
  its own `index`. An item whose index is out of range or repeats an earlier one is dropped, and any
  original line left without a surviving item keeps its deterministic parse untouched. A model that
  returns garbage, fewer items, more items, or prose around its JSON degrades line-by-line rather
  than corrupting the review.
- **`lib/repositories/list-normalisation-rate-limit.ts`** plus
  **`lib/list-normalisation-service.ts`** — a per-caller fixed-window counter in Postgres, reusing
  `OrderLookupAttempt`'s exact shape: vendor-scoped, SHA-256 hashed IP, and the low-probability
  retention sweep `#468` had to add after that table grew unbounded. Split across a pure repository
  module and a request-scoped facade because that is the rule `tests/repository-purity.test.ts` and
  `tests/repository-client-injection.test.ts` enforce.
- **A new `ListNormalisationAttempt` model** and its additive migration.
- **Cost bounded from both directions.** `MAX_LIST_LINES` (100) already caps lines and the matcher
  already issues one query; this slice adds `MAX_AI_INPUT_CHARS` so one submission's prompt is
  bounded by characters too, and asserts the pre-pass makes at most one `fetch` per submission
  however long the list is.
- **Degrade, never refuse.** Missing credential, rate limit hit, input over the character cap,
  non-OK response, a 429 that survives backoff, unparseable output, or any thrown error all fall
  through to exactly today's deterministic behaviour. Unlike most rate-limited endpoints this one
  has a real non-AI path — it shipped without AI in P3d and still works — so a limit never produces
  an error page.
- **Pack sizes resolve to a customer choice, never a guess.** See below.
- **`components/cart/ShopYourList.tsx`** distinguishes the pack-size case in the review step.

## Pack sizes: the decision this slice encodes

`2kg atta` against a catalogue holding 1kg, 5kg and 10kg bags has no defined resolution. Two small
bags, the nearest single pack, and a refusal are all defensible and none of them are equivalent to
the shopper. `Product` carries no pack-size field; `unitLabel` is free text of the form
`GBP 2.40 per kg`, unusable for arithmetic. The unit model is `#398`, whose halves sit in P9.3 and
P10 — both after P2.6.

So this slice **constrains itself to count quantities** and encodes exactly one new matching rule:

> When a line carries a measure and no candidate product's name contains that measure, the line
> resolves to `ambiguous` — never to `matched`.

The shopper picks the pack in the review step that already exists for this purpose. Nothing is
substituted, nothing is guessed, and `#398` stays free to build the real model later without
unpicking an assumption made here. `5kg basmati rice` still resolves outright, because
*Basmati Rice 5kg* does contain the measure — the existing behaviour that `LEADING_COUNT` was
written to protect is preserved, and this rule is what protects it once an AI is extracting the
measure explicitly.

Decided at `/propose` on 2026-09-04 against two alternatives: pulling `#398` forward, which reopens
the sequencing decision that put P2.6 ahead of P9; and resolving to the nearest single pack with a
disclaimer, which is guessing with disclosure in the one place a wrong answer charges the customer
for the wrong weight of food.

## Cost and abuse: why this needs its own answer

`#571` ruled that an AI call reachable from a public, unauthenticated endpoint is
attacker-controlled cost against a Workers AI quota already shared with the product-image pipeline
(`lib/image-generation.ts` carries a 429 backoff because that quota is really hit in practice). It
was resolved for `#565` by moving AI offline behind an authenticated staff action.

**That resolution cannot transfer here.** `/shop-your-list` is public, the pre-pass runs on
arbitrary submitted text, and interpreting the list *is* the feature — the shopper is waiting for
their basket, so it cannot move offline. No middleware layer can hold a central limit either:
`CLAUDE.md` records that no `proxy.ts` can ship on this stack at all, and no KV, D1, queue or
rate-limiting binding is provisioned in `wrangler.toml`. So the limit is per route, in Postgres,
following the two existing precedents.

Requiring sign-in was considered and rejected at `/propose`: it is the strongest control and needs
no table, but it puts the phase's headline feature behind a login on a storefront built around a
fast basket, and guest checkout is a supported flow.

## Deliberately excluded

- **A pack-size or unit-of-measure model** — `#398`. This slice detects a measure and routes it to
  a human choice; it never converts, compares or aggregates one.
- **Substitution suggestions for out-of-stock items** beyond identifying them, which is what the
  review step already does. That is `#399` and ADR-005's undecided substitution territory.
- **Saved or reusable weekly lists** — `#116`, still P10.
- **Any change to the review-then-confirm flow.** Nothing reaches the basket until the shopper
  confirms, and `features/cart/add-list-to-cart.ts` is untouched.
- **Logging list submissions.** `SearchQueryLog` covers `/search`; extending it to lists is a
  separate personal-data question of the kind `#570` raised, and nothing in this slice needs it.
- **Bulk or staff-side tooling** for lists.
- **`#588`** — `scripts/configure-env.mjs` routes the Workers AI credentials to GitHub environment
  secrets only and never to the Worker runtime. Both are set on staging and production today, so
  this slice is unaffected; filed at `/orient`, fixed elsewhere.
- **Test coverage for `lib/search-synonym-proposals.ts`** — that is `#583`, and it is a slice 3
  artifact. This slice's own AI module gets its own tests.

## Open items carried forward

- **`#583`** is partly unblocked by this slice's groundwork but not closed by it. `/orient` copied
  `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from `secrets/staging.vars` into `.dev.vars`
  (gitignored), so an AI path is now live-exercisable under `npm run preview` for the first time.
  Proposal *quality* for slice 3's synonym run remains unverified and stays with `#583`.
- **Prompt quality is not a gate here.** The requirements below check that the pre-pass is bounded,
  degrades safely, cannot invent a product, and routes pack sizes to a human. How good the model's
  interpretation is on a given list is judged live at `/validate` against the worked example, not
  asserted by a unit test that would only encode the author's guess at the model's output.
