---
id: p928-net-content-description-evidence-plan
title: "#928 — Product description as net-content evidence (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-28
visibility: internal
summary: The net-content suggester also reads the first 500 characters of a product's description, so a size stated only there becomes a suggestion quoting it. Two deterministic guards keep the name first and refuse an ambiguous description. One additive enum value.
tags: [catalogue, net-content, ai, workers-ai, staff-panel, p9-2]
related: [architecture, p900-ai-net-content-suggestions-plan, p927-net-content-suggest-button-plan]
---

# #928 — Product description as net-content evidence (plan)

`#900` built an AI step that proposes a product's net content (pack size). It reads the product's
**name**, its free-text **unit label** and, when one exists, a staff-sourced **photo**. `#927` added a
staff button that runs the same loop. Nothing reaches a product until staff accept it on
`/staff/net-content`.

The production pilot (`#901`, 2026-09-28) tried 35 products. Three of them state their size **only
in the description**, so they came back NO_ANSWER even though the data exists:

| Product | Unit label | Description |
|---|---|---|
| Coconut Milk | `£1.29 / tin` | "Rich, creamy coconut milk, 400ml tin." |
| Croissants | `£2.40 / pack` | "Buttery, flaky croissants, pack of 4." |
| Free Range Eggs | `£2.10 / box` | "Free range eggs, box of 6." |

All three are `prisma/seed.ts` fixtures, so they exist on dev too. This slice's live proof uses them.

**Goal:** a size stated only in a product's description becomes a PENDING suggestion quoting that
description. The name and unit label keep precedence, and "propose, never apply" is unchanged.

**Gate 1:** approved by the owner on 2026-09-28, recorded as a comment on `#928`. This spec does not
widen that scope. Two deterministic guards (Scope item 3) enforce the approved prompt rules in the
validator. The design rule is that "a prompt is a request, not a guarantee" (see
`buildNetContentPrompt`'s doc comment), so each rule is enforced in code as well as in the prompt.

## Scope (this slice)

1. **Schema.** One additive migration adds `DESCRIPTION` to the `NetContentEvidenceSource` enum
   (`prisma/schema.prisma`). Its SQL is a single `ALTER TYPE … ADD VALUE`, with no `DROP` of any
   kind. `CLAUDE.md` warns that Prisma keeps proposing to drop the hand-authored `pg_trgm` indexes,
   and `#895` warns that `migrate dev --create-only` against dev offers a reset. So the migration
   is generated with `prisma migrate diff`, as `#876`/`#613` did, and read before it applies.

2. **Excerpt.** A new pure function `descriptionExcerpt(description)` and a constant
   `DESCRIPTION_EXCERPT_CHARS = 500`, both in `lib/net-content-suggester.ts`:
   - the description is trimmed;
   - if it is 500 characters or fewer, it is used as-is;
   - otherwise it is cut to 500 characters, then back to the last whitespace, so no partial word
     (such as `400m` from `400ml`) is sent.

   The run loop (`lib/net-content-run.ts`) computes the excerpt **once** per product. It passes the
   same string to the suggester (the prompt) and to the validator (the literal-quote check). What
   the model saw and what its quote is checked against therefore cannot differ.

3. **Validator** (`validateNetContentReply`). It accepts `evidenceSource: "DESCRIPTION"` under four
   rules:
   - (a) the excerpt is non-empty. This mirrors "PHOTO only when a photo was sent".
   - (b) the quoted evidence literally occurs in the excerpt, under the same normalisation as the
     NAME and UNIT_LABEL checks.
   - (c) **Name first:** refused when the product name itself states a metric size. In that case
     the model should have quoted the name.
   - (d) **Ambiguity:** refused when the excerpt states two or more **distinct** metric sizes, for
     example "400ml tin, also available in 1L".

   A new pure helper `metricSizesIn(text)` implements (c) and (d). The existing rule that `EACH`
   needs a stated count applies to DESCRIPTION evidence unchanged.

   Rule (c) checks the **name only**, not the unit label. Unit labels such as `£0.80 / 100g` state a
   price per quantity, not a pack size. Checking them would wrongly block a real description size.

4. **Prompt** (`buildNetContentPrompt`):
   - a `Description: <excerpt>` line appears only when the excerpt is non-empty;
   - `DESCRIPTION` appears in the allowed `evidenceSource` list only when the excerpt is non-empty;
   - three new rules: use the description only when the name, unit label and photo state no size;
     DESCRIPTION evidence is copied exactly from the description text above; if the description
     states more than one size, answer null;
   - the no-photo line stops saying "use only the name and unit label" when a description is sent.

   An empty description leaves the prompt exactly as it is today.

5. **Data path.** `listEligibleProductsForNetContent` also selects `description`, and `RunProduct`
   / `EligibleProduct` carry it. Both entry points get it automatically, because both pass this list
   straight to `runNetContentSuggestions`:
   - `scripts/suggest-net-content.ts`;
   - `runNetContentSuggestionsForVendor` (`#927`'s button).

   Eligibility, the product limit, the neuron budget, the model and the stop rules are unchanged.

6. **Review page.** On `/staff/net-content`, the evidence label map `EVIDENCE_TEXT` in
   `app/(admin)/staff/net-content/page.tsx` gains `DESCRIPTION: "description"`. A row therefore
   reads `from the description: "…"`. `NetContentReviewRow` needs no change.

7. **Docs.**
   - `specs/architecture.md`'s net-content paragraph currently says evidence "must literally occur
     in the name or unit label". It is updated to cover the description excerpt and the two
     guards.
   - `docs/staff-playbook/staff-tabs-guide.md`'s `/staff/net-content` section gains "description" in
     its **From the …** list. It also gains one sentence: the AI reads the start of the product's
     description, so a size written there can be suggested, and staff should check the quote.

## Why these choices

- **The literal-quote rule is the safety net, not the prompt.** A hallucinated "400ml" that is not
  in the text sent is refused, exactly as it is for the name today. That is why the excerpt is
  computed once and shared.
- **The two guards are deterministic and cheap.** Descriptions are free prose written by staff, and
  more likely than a name to mention another size. Refusing an ambiguous description (NO_ANSWER)
  loses little. Staff can still type the value on the product page. A wrong accepted value shows a
  wrong unit price to shoppers.
- **500 characters.** All three pilot descriptions are under 45 characters. 500 characters is
  roughly 125 tokens, about 1 neuron per call on Gemma 4, well inside `#927`'s 150-neuron click
  budget. It also stops a long description from dominating the prompt.
- **No retry code.** The script already has `--include-attempted`. After deploy, the owner runs it
  once on production for the roughly 12 existing NO_ANSWER products. A button would re-send
  products that have no answer by design (electricals) on every click. That was rejected at
  Gate 1.

## Deliberately excluded

- **A re-attempt button or automatic re-admission** of earlier NO_ANSWER products, including a
  "prompt version" column. The retry stays a script action.
- **Parsing the description without the model** (regex extraction). This is the free-text guessing
  `#697` rejects for `unitLabel`. `metricSizesIn` is used only to **refuse**, never to produce a
  value.
- **Showing the full description on the review row.** The quoted evidence is shown, and the
  product link opens the full product.
- **The unit label in guard (c)** (see Scope 3). The unit-label cross-check badge
  (`checkSuggestionAgainstUnitLabel`) is unchanged and still runs on every suggestion.
- **Non-metric sizes in a description** (pints, oz). The existing "do not convert" rule already
  covers them.
- **Staging or production data changes.** No suggestion run happens on staging or production in
  this slice.
- **Changes to `#927`'s limits, the model, eligibility, or the pilot summary.**
- **Hand edits to `app/(admin)/staff/runbook/docs.ts`.** It is generated. _Corrected at
  build-notes: an earlier draft of this bullet said no script regenerates it. `npm run
  kms:build-index` does, so it picks up the staff-guide change as generated output (see
  `build-notes.md`, "Deviations"). Its size problem stays `#865`'s._
- **`#695`.** It stays Deferred.

## Open items carried forward

- **`#901` is paused** until this reaches production. After that:
  1. the owner reviews the 25 PENDING rows;
  2. the owner runs `scripts/suggest-net-content.ts --env-file secrets/production.vars --include-attempted`
     once, via `!` (auto mode refuses production database commands);
  3. the button walks the roughly 45 products never attempted.
  `#901` records the final summary.
- **`#697`** stays open: the not-applicable marker, loose-by-weight products, and real-stock
  coverage all depend on `#901`'s final numbers.
