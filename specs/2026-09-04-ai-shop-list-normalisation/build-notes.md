# P2.6 slice 4 — AI Shop List normalisation over the existing matcher (build notes)

Written at the end of Build, before the Clear. Branch `feature/ai-shop-list-normalisation`,
commits `770d5bf` (spec) and `f9c4af2` (implementation).

## What changed and why

**`lib/list-normalisation.ts` (new).** The pre-pass. Everything except one `fetch` is pure:
`buildNormalisationPrompt`, `parseNormalisationResponse`, `mergeNormalisedItems`,
`isNormalisationConfigured`. `normaliseList` is the only function that touches the network, and it
returns `null` on every failure rather than throwing, so no caller ever has to handle an AI error.

The shape worth understanding is **how a model's reply is folded back onto the shopper's lines**.
The model is asked for one object per line carrying its own `index`, and that index is *validated,
not believed* — out of range, non-integer, or a repeat of one already seen is dropped. So a reply
can never move an item onto a line the shopper did not write, and `mergeNormalisedItems` returns
exactly one entry per input line, leaving any unclaimed line on its untouched deterministic parse.
A garbage, short, long, prose-wrapped or fenced reply therefore degrades **line by line** rather
than corrupting the review. That is the whole reason the merge is a separate pure function instead
of inline in the action: it is the part most worth testing and least worth trusting.

**`lib/shopping-list.ts`.** `ParsedLine` gains two *optional* fields, `measure` and `brand`, so
every pre-slice construction site still type-checks and behaves identically. `resolveLines` gains
the pack-size rule: when a line carries a measure and no candidate's name contains it, the line
resolves to `ambiguous` — never `matched`. Placed inside the `fullMatches.length > 0` branch, after
the early returns, because the zero-match paths are already ambiguous or unmatched and the rule has
nothing to add there.

The case this exists for is the **single-candidate** one. With one product matching the name, the
old code returned `matched` — so `2kg atta` against a shop stocking only a 5kg bag would have
silently charged someone for 5kg. There is a test named for exactly that.

**`lib/repositories/list-normalisation-rate-limit.ts` + `lib/list-normalisation-service.ts`
(new).** A per-caller fixed-window counter, deliberately a near-copy of
`order-lookup-rate-limit.ts` rather than anything cleverer: 60s window, 5 attempts, SHA-256 hashed
IP, vendor-scoped, 1% retention sweep (the sweep exists because `OrderLookupAttempt` grew unbounded
until `#468`). Split across a pure repository module and a request-scoped facade because that is
what `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` enforce, and
because a cost control that can only run inside a live Workers request is one nobody can prove.

**`features/cart/match-list.ts`.** Orchestrates: parse → pre-pass (or not) → single candidate query
→ resolve. The pre-pass lives in a non-exported `normaliseParsed` helper so the `"use server"`
module keeps exporting only `matchList` (`#159`).

**`components/cart/ShopYourList.tsx`.** The ambiguous branch now asks a different question when the
line carries a measure — `We don't stock a 2kg pack — choose a size` rather than
`Which one did you mean?` — with a matching `aria-label`. Asking the generic question there would
read as though we had not understood the shopper. We did; we just cannot fill it exactly.

**`prisma/schema.prisma` + migration.** One additive table. `git diff -w` confirms 29 real
insertions and zero deletions; the rest of that file's churn is `prisma format` realigning the
`Vendor` relation block.

**`specs/architecture.md` → 1.24.0.** This slice makes the standing rule *"AI never sits on a
public request path"* false as written, so the rule was rewritten rather than left to be
contradicted by the code. It now states the default, records that `#567` is a deliberate exception,
and gives the four conditions that made it acceptable — degrades without it, bounded in every
direction, the model decides nothing a shopper receives, output validated not trusted — as the test
a future exception must meet. Left unamended, it would have been exactly the failure `CLAUDE.md`
describes: a ruling nobody can reconcile with the repo.

## Decisions taken during the build

- **Ordering of the three skip checks, which the spec did not fix.** Both free checks (prompt over
  `MAX_AI_INPUT_CHARS`, no credential configured) run *before* the throttle, because the throttle
  writes a row every time it admits a caller. Consulting it first would spend a shopper's budget on
  a submission that was never going to reach the model — and on an environment with no AI
  credential, on *every* submission forever. This is what R22 asks for; the order is the mechanism.
- **`isNormalisationConfigured()` and `buildNormalisationPrompt()` became exported.** The spec
  implied the caller would apply the character cap, but an estimate from the shopper's own
  characters ignores the prompt preamble, so caller and callee would disagree near the boundary —
  a submission could pass the caller's guard, consume a rate-limit slot, then be refused inside
  `normaliseList` anyway. Exporting the real prompt builder makes both apply the same number.
  `normaliseList` still re-applies both checks, so the bound holds for any caller that skips them.
- **The skip log is one `console.warn` with `reason=` and `lines=`**, deliberately greppable
  (`list-normalisation`), because the only way to observe a skip live is the Worker log store —
  the same technique `CLAUDE.md` records for the webhook-binding refusals.
- **No 429 backoff, unlike `lib/image-generation.ts`.** That file retries 2s then 4s, which is
  right for a staff-triggered batch and wrong here: a shopper is blocked on this call, and waiting
  six seconds to enrich a form submit is worse than not enriching it. A 6s abort deadline replaces
  it.
- **`await response.json()` is wrapped in try/catch**, which
  `lib/search-synonym-proposals.ts` does not do. A 200 carrying a non-JSON body would throw there;
  on a request path it must degrade. Filed as `#589` for the slice-3 module rather than fixed here.
- **Brand is retained but never added to `terms`.** `Product` has no brand column until
  `#397`/`#569`, so a brand term could only match incidentally through a product name — adding it
  to an already-strict AND could only turn a findable product into an unmatched line. R9 pins this.
- **The measure comparison is case-insensitive** (`5KG` matches `Basmati Rice 5kg`). The spec
  didn't say; a shopper typing capitals should not get a different answer.

## Deviations from the spec

- **`validation.md`'s R29 verification step was corrected during Build.** It grepped the bare name
  `matchListTerms` expecting `1`; the file legitimately names that function in a slice-3 comment as
  well as calling it, so it prints `2` — and printed `2` before this slice too, meaning the row
  could never have passed. Changed to `grep -c 'repo.matchListTerms('`. **The requirement itself is
  unchanged**; only the step that checks it was wrong. Same class as the two spec measurement errors
  caught at Build in slice 1, and recorded in the file itself as well as here.
- **`brand` is captured and retained on the line but not displayed** in the review step. No
  requirement asks for it, and `mergeNormalisedItems`'s docstring says the review step *can* show
  it, not that it does. Filed as `#590` rather than widened into this slice.
- No other deviation. Requirements R1–R33 were built as written.

## Known-shaky areas

- **No live AI call has ever run.** This is the big one. Every assertion about `normaliseList` in
  `tests/list-normalisation.test.ts` is against a stubbed `fetch`, and the harness uses a
  hard-coded reply. `/orient` put real credentials in `.dev.vars`, so `npm run preview` can now
  exercise the real thing for the first time — **do that before trusting any of it.** What has
  never been observed: the model's actual reply shape from `@cf/meta/llama-3.1-8b-instruct` for
  this prompt (does it honour `index`? does it return JSON without prose?), real latency against
  the 6s deadline, and whether the interpretation is any good. `CLAUDE.md` is emphatic that a
  hand-constructed double proves nothing about what a real adapter returns — that lesson was
  learned on Prisma error codes and applies exactly here.
- **The pack-size rule is inert without AI**, because only the pre-pass ever sets `measure`. So on
  a degraded path `2kg atta` behaves as it does today (`2kg` stays a search term and the line goes
  unmatched). That is intended and pinned by a test, but it means the protection is only as
  available as the AI is. Filed as `#591`.
- **`checkListNormalisationAllowed()` is called on every submission that reaches it**, so
  `/shop-your-list` now writes a row per matched list. Worth confirming under `npm run preview`
  that the count moves exactly once per submission and not once per line — and that it does *not*
  move for the two pre-throttle skip paths (R22), which is the assertion most likely to be wrong if
  the ordering was misread.
- **The throttle is best-effort, not compare-and-set.** Two concurrent submissions can both read an
  under-threshold count and both be admitted. Same trade as the order-lookup throttle; worst case
  is one extra AI call per window.
- **The rate limiter has never run against a real database.** Its test uses a mock Prisma client.
  `scripts/verify-repository-injection.ts` is the pattern for exercising a repository function live
  if validation wants that confidence.
- **`prisma generate` takes over five minutes on this machine** and is what made `prisma migrate
  dev` appear to hang; the migration had already applied. Not a defect, but budget for it.
- **GAP-011 fired a fifth time** — the generated migration proposed dropping all three
  hand-authored `pg_trgm` indexes. They were removed by hand before applying, and a live query
  against the dev branch confirmed all three indexes still exist. Re-confirming that on any other
  environment the migration reaches is cheap and worth doing.
