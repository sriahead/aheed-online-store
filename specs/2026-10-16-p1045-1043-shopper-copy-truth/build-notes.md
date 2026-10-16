# Shopper copy that contradicts the system (build notes)

Written at the end of Build, **before** the Clear. The validating context is fresh and has only
the spec, the artifact, and this file.

Commits on `feature/p1045-1043-shopper-copy-truth`, off `staging` at `735dc46`:

- `56a7d86` — the three spec files, on their own.
- `69d11bd` — the implementation, 11 files.

## What changed and why

**`#1045`.** `lib/help-facts.ts` gains `pointsExpirySentence(months)`, and three surfaces stop
describing per-point aging:

- `app/(storefront)/help/page.tsx:281` — the loyalty section's Expiry line now renders the helper.
- `lib/assistant-content.ts:182` — `rewardsEntry()` pushes the same helper's output.
- `components/staff/LoyaltyConfigForm.tsx:111` — the months input is relabelled.

The reason the wording was wrong is worth carrying: `lib/loyalty.ts`'s `isLapsed()` lapses the
**whole balance** once `lastActivityAt + pointsExpiryMonths` passes. A shopper who keeps ordering
never loses a point; one who stops loses everything at once, including points earned the day before
their last order. That design is deliberate — it makes expiry derivable from one column at read
time with no scheduled sweep, which P5a chose because this codebase has no cron surface — so the
**copy** was the defect, never the rule.

`lib/help-facts.ts` was chosen as the home because it is **already imported by both shopper
surfaces** and already exists to hold facts shared by exactly that pair (`helpDeliveryFacts`). The
new sentence names the thing no surface previously stated: that placing an order resets the clock.
Without it a shopper cannot know the deadline moves. `/account/loyalty` shows each shopper their own
computed date; neither of these two callers has a shopper in context, so both state the rule rather
than a date.

**`#1043`.** `app/(storefront)/orders/lookup/page.tsx` built its order-number placeholder from a
hardcoded three-letter prefix belonging to one vendor. No prefix is a platform constant:
`lib/order-totals.ts:158` `vendorOrderPrefix()` derives each from the vendor slug
(`aheed-food-centre` → `AHE`, `srimart` → `SRI`), so every other store showed guests an example
order number that could not exist there. The page now derives it via `getCurrentVendorProfile()`,
which is `cache()`-wrapped and **already called by the `(storefront)` layout on the same request**,
so this adds no query. `profile?.slug ?? ""` yields the helper's own `ORD` fallback for an
unresolved host — a host the layout redirects to `/coming-soon` before this page renders.

**Tests.** `tests/help-vendor-facts.test.tsx` asserted `/expire 12 months/i`, which the **wrong**
sentence also satisfied — the defect sat under a green test from `#1015` onward. Both that file and
`tests/assistant-content.test.ts` now assert the exact sentence, plus a new case pinning
`pointsExpirySentence(12)` with `toBe`. `tests/vendor-neutral-copy.test.ts` denies the hardcoded
prefix literal; it passed immediately after the change, which is itself the evidence that no other
shipped `.tsx` carried it.

## Decisions taken during the build

- **One shared helper rather than two reworded literals plus a drift test.** `#1045` asked for "a
  test that pins both sentences to the same wording so they cannot drift apart again". A single
  source makes drift **impossible** instead of detected, at the same cost, because the module both
  surfaces already import was sitting right there. Rejected: rewording each surface separately and
  adding a cross-file test — it would have left two literals that a future edit can still separate.
- **`toBe`, not a regex, for the copy assertions.** This is the decision that matters most here.
  The old assertions (`/expire/i`, `"12 months"`) were satisfied by the defective sentence, which is
  precisely why the bug survived three slices under green tests. A regex would still admit a longer
  sentence that re-introduced per-point aging. String equality is the only form that pins a rule.
- **Derive the prefix rather than take the issue's neutral-placeholder option.** `#1043` offered
  both. The neutral option exists only to avoid a query, and there is no query to avoid — so it
  buys nothing and loses the useful example.
- **Kept the forbidden literals out of the codebase entirely, including comments.** See the next
  section; the alternative was a looser check, and a dumb strict grep is worth more to a fresh
  validator.
- **Did not add a component test for the placeholder.** `requirements.md` verifies R6 by grep, R8 by
  the denylist test and R9 end-to-end against two vendors, and the denylist is the regression guard.
  A fourth check of the same one-line string would be duplicate coverage under the 80/20 model.

## Deviations from the spec

Two, both corrections to **verification mechanics** rather than to requirement intent. Both were
found by running `validation.md`'s own commands, and both are committed in `69d11bd`.

1. **R4 and R6 failed on comments this build wrote.** The explanatory comments quoted the two
   literals those requirements forbid (`months after you earn` in `lib/help-facts.ts`'s docstring,
   and the hardcoded prefix in the lookup page's). The requirements say "contains the substring",
   with no comment exemption. **Resolved in the code, not the spec:** both comments were reworded so
   the literals appear nowhere in the repo, keeping the greps strict. Worth knowing:
   `tests/vendor-neutral-copy.test.ts` passed throughout, because it strips comments before
   matching — it would never have caught this, and R6's grep is therefore stricter than the test.
2. **R7's and R10's validation commands did not test what their requirements stated.**
   - R7's `grep -n "lib/repositories"` flagged a **pre-existing** `import type { GuestLookupOrder }`
     — type-only, erased at compile time, issuing no query. The requirement says this slice *adds*
     no such import. The row now requires exactly that one line and fails on any match that is not
     `import type`.
   - R10's `grep -rn "after you earn" tests/` flagged both files' explanatory comments **and** the
     deliberate `.not.toMatch(/after you earn/i)` assertion, which is the guard itself. The row now
     greps for `toMatch(/expire 12 months` instead.

No requirement's intent changed, no scope was widened, and the user was told about both.

## Known-shaky areas

- **R9 is the only requirement no automated check covers, and the only one that can pass falsely.**
  It needs `npm run preview` and **both** hosts. The Aheed half passes against a hardcoded prefix —
  `SRI-` on `srimart.localhost:8787` is the actual test. Use `curl -H "Host: ..."`: Windows does not
  resolve `*.localhost`, and `lib/tenant.ts` reads the header anyway. Afterwards kill the whole
  `node`/`workerd` chain, or the next build fails with `EBUSY`.
- **`#1125` makes a clean `vitest` run unreliable in a specific, quiet way.** A full run can fail to
  start forks workers for jsdom (`.tsx`) files and never execute them, while still printing a
  plausible `N passed` line. **Four of this slice's five touched test files are `.tsx` or jsdom
  consumers**, so they are in exactly the population that goes missing. R12 therefore requires the
  reported `Test Files` total to equal `git ls-files '*.test.ts' '*.test.tsx' | grep -v '^\.claude/'
  | wc -l` — **259** at the time of writing, recount rather than trusting it. A lower count is a
  failed run even with no failures printed.
- **`npm run kms:coverage` fails locally for an unrelated reason and must not be re-baselined.** It
  walks the filesystem rather than git, so the **gitignored** `misc/issue-club-a.md`
  (`.gitignore:62`) makes it report `misc: baseline 0, measured 1 (increased)`. CI checks out from
  git and never sees that file, so `--update` would commit a baseline describing one machine's
  scratch directory. Confirm any complaint names a tracked file (`git ls-files <path>` prints
  something) first. Now also recorded in `docs/developer-portal/local-dev-playbook.md`.
- **`npm run kms:check-generated` reports "stale" for uncommitted artefacts, by design.** It
  compares against `git show HEAD:<path>` (its own docstring explains why), so running it between
  `kms:build-index` and the commit always reports stale. It went green immediately after `69d11bd`.
  Not a defect; don't chase it.
- **The staff label is the one change outside `#1045`'s stated scope**, included by explicit
  approval. If scope is being audited, that is the line to look at
  (`components/staff/LoyaltyConfigForm.tsx:111`).
- **Not shaky, but it will look wrong:** `docs/model-handoff.md:945` still describes `#1045` as an
  open defect, quoting the old wording. It is accurate until this merges. The final `/document` must
  retire it — `plan.md` records this under "Reconciliation this slice creates".
