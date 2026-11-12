---
id: 2026-11-12-net-content-rules-plan
title: "Net content for the live catalogue: a free rule step before the AI, and no HIGH guess on ambiguous sizes (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-12
visibility: internal
summary: "Adds a no-AI rule step to the staff Suggest net content run (fixed size in the name, or a per-kg label matching the price) that queues PENDING suggestions, and stops the extractor calling ranges, minimums and 'Pack of N' beside one weight HIGH confidence."
tags: [catalogue, net-content, pricing-law]
related: [2026-11-12-shared-pagination-plan]
---

# Net content for the live catalogue (plan)

Issue #697. Owner: "do #697 next" (2026-11-12). #900 already settled the route for real products in
September: suggestions, reviewed by a person on `/staff/net-content`. What #697 still lacked was data
for the products shoppers actually see.

## Measured (AFC staging, which equals production's catalogue since the 2026-11-12 copy)

| | All products | Live (73) |
| --- | --- | --- |
| Net content set | 1,912 of 6,238 | **0** |
| Name readable as HIGH | 48 | 40 |
| Nothing readable | 4,278 | 33 |

Of the 40 "readable" live names, several were wrong at HIGH confidence. These are the Price Marking
Order risk the issue warns about:

- "Tilapia 500–800g" was read as 800g.
- "Tilapia 800g+" was read as 800g.
- "Diamond … Prawns – 400g (Pack of 2)" was read as 400g.

The 1,912 already-set values were checked for the same patterns. Only "OVALTINE 200G+50%" (stored as
200g) is doubtful. It is not changed here; it is reported to the owner.

Many of the 33 unreadable lines are priced per kg ("£6.49 / kg" at a base price of £6.49), which
means a 1 kg pack.

## Change

1. **`lib/catalogue-import/net-content.ts`.** `extractDetailedNetContent` downgrades a HIGH result to
   LOW when the text has:
   - a range whose lower bound is smaller (a size grade like "31/40 – 400g" is excluded);
   - an amount followed by "+";
   - "Pack of N" beside a single, un-multiplied weight.

   The importer and the batch scripts get the same protection, because they only auto-apply HIGH.
2. **`lib/net-content-rules.ts`** (pure). `suggestNetContentByRule` returns a value in two cases:
   - a HIGH name gives confidence 90 and evidence `NAME`;
   - a per-kg unit label equal to the base price gives 1 kg, confidence 95 and evidence
     `UNIT_LABEL`.

   Each value carries the existing unit-label check.
3. **`runNetContentSuggestionsForVendor`** runs the rule step first, over up to 500 eligible products,
   with no AI needed. Each answer is a PENDING `NetContentSuggestion` with model `rules (no AI)`,
   which also removes that product from the model's list. The model step then runs unchanged, and the
   result carries `ruled`. `describeStaffNetContentRun` leads with the rule count and folds a
   model-step refusal into the notice, because the form shows an error or a notice, not both.
4. **Copy and docs.** The button text and the page intro are updated, the staff guide is 2.21.0, and
   env-setup is 1.37.0.

## Not changed

- No product is written without a person.
- No schema change.
- The offline `scripts/suggest-net-content.ts` keeps its AI-only behaviour.
