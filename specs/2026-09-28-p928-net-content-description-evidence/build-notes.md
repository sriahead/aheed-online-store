# #928 — Product description as net-content evidence (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

Branch `feature/928-net-content-description-evidence`, cut from `origin/staging` at `aa7b3d4`
(PR #931 merge). Commits:

- `c1a0b5b`: the spec;
- `25b2b3a`: the build;
- the build-notes commit.

Project #2: `#928` moved to **In Progress**. Gate 1 is on `#928` (comment, 2026-09-28).

## What changed and why

- **`prisma/schema.prisma`, `prisma/migrations/20260928160000_p928_net_content_description_evidence/`.**
  `DESCRIPTION` is added to `NetContentEvidenceSource`. The SQL was produced by
  `prisma migrate diff --from-schema-datamodel <origin/staging schema> --to-schema-datamodel
  prisma/schema.prisma --script`. Its output was exactly the one `ALTER TYPE … ADD VALUE` line,
  with **no** `pg_trgm` index drops this time. `migrate dev` was not used (`#895`).
  **Applied to dev** (`ep-dry-morning-zab7dx08`) with `npx prisma migrate deploy`, after checking
  that `.env` and `.dev.vars` both point at dev and differ from `secrets/staging.vars` and
  `secrets/production.vars`. `migrate status` then reported "61 migrations found … Database schema
  is up to date!". Staging and production are **not** migrated; their deploy workflows do that on
  merge.
- **`lib/net-content-suggester.ts`.**
  - `DESCRIPTION_EXCERPT_CHARS`, `descriptionExcerpt()` and `metricSizesIn()` are new.
  - `SuggesterInput.description`, and `buildNetContentPrompt`'s `description` input, are new.
  - `validateNetContentReply`'s context gains `descriptionSent`, and the validator has a
    `DESCRIPTION` branch: rules (a)–(d) of R5, applied after the existing NAME/UNIT_LABEL literal
    checks and before the EACH rule, so EACH still applies.
  - The type union, `EVIDENCE_SOURCES` and the header comment are updated.
- **`lib/net-content-run.ts`.** `RunProduct.description` is new. `descriptionSent` is computed once
  per product and passed to both `suggest()` and `validateNetContentReply()` (R9).
- **`lib/repositories/net-content-suggestions.ts`.** Two added lines: `EligibleProduct.description`
  and `description: true` in `listEligibleProductsForNetContent`'s select. Both entry points (the
  script and `#927`'s service) pass that list straight to the run loop, so neither file changed
  (R11's diff is empty; checked at Build).
- **`app/(admin)/staff/net-content/page.tsx`.** `EVIDENCE_TEXT` gains `DESCRIPTION: "description"`
  and is reformatted onto several lines.
- **Tests.**
  - `tests/net-content-suggester.test.ts` and `tests/net-content-run.test.ts`: new describe blocks
    for R3, R4, R5, R7, R8 and R9.
  - `tests/store-description-prompts.test.ts`: `description: ""` added to fixtures only.
  - Existing fixtures gained `description: ""` / `descriptionSent: ""`, so the pre-existing cases
    exercise the unchanged no-description path. No assertion was changed or removed.
  - At Build, every `it(` title from `origin/staging` was still present in both files (R6's check
    printed `missing=0`).
- **Docs.**
  - `specs/architecture.md` 1.37.0 → 1.38.0: the `#900` "Model-agnostic" bullet, covering the
    literal-quote rule and the two guards, with `#928`.
  - `docs/staff-playbook/staff-tabs-guide.md` 2.8.0 → 2.9.0: the **From the …** sentence names
    "description", plus one check-the-quote sentence.

Local results at Build (not a validation):

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | exit 0 |
| `npx vitest run` on the 4 net-content/prompt test files | 106/106 |

The **full** suite was not run at Build; R20 runs it alone.

## Decisions taken during the build

- **The R8 literal was generated, not hand-typed.** `origin/staging`'s `lib/net-content-suggester.ts`
  was copied to a temporary `lib/__p928_staging_suggester.ts`, and its `buildNetContentPrompt`
  output for `{ name: "Test", unitLabel: "£1 / each", storeDescription: null }` was printed for
  both photo flags. The test's `before()` literal was written from that output. Both temporary
  files were deleted (`git status` clean of them). Validation's R8 row repeats this independently.
- **Wording of the no-photo line when a description is sent:** "No photo is available; use only the
  name, unit label and description." R7(f) only forbids the old wording. This form keeps the
  sentence's shape.
- **Where the three description rules sit in the prompt:** straight after the existing
  "evidenceSource NAME or UNIT_LABEL …" rule, and only when a description is sent (R8 needs the
  empty case to be byte-identical).
- **`metricSizesIn` regex:**
  `/(?<![\p{L}\d])\d+(?:[.,]\d+)?\s*(?:kg|grams|gram|g|ml|cl|litres|litre|l)(?!\p{L})/giu`.
  - `\s*`, not `\s?`, so `400  ml` still counts. R4 says "optional whitespace" and does not limit
    it to one character.
  - Normalisation uses `.replace(",", ".")` (first comma only). A match can contain at most one
    comma, so this is exact.
- **`descriptionExcerpt` always cuts back to the last whitespace** once the text is over 500
  characters, even when character 500 itself is whitespace. That follows R3(c) literally. The cost
  is that in the exact-boundary case one whole word is dropped, which is harmless.
- **Order of the validator's DESCRIPTION checks:** (a) empty → (b) literal quote → (c) name size →
  (d) two sizes. All four return `null`, so the order only affects which rule a failing reply trips
  first, never the outcome.

## Deviations from the spec

- **`app/(admin)/staff/runbook/docs.ts` changed. `plan.md`'s exclusion wrongly said nothing
  regenerates it.** `npm run kms:build-index`, which R18 requires, writes both `ARTIFACT_INDEX.md`
  and this file, and it rewrote the staff guide's `/staff/net-content` body with the 2.9.0 text.
  This is generated output, not a hand edit, and it is needed: `kms:check-generated` in CI fails
  if it is stale. `plan.md`'s bullet is corrected in place and marked as a correction. No
  requirement names this file; R11's no-diff list does not include it.

## Known-shaky areas

- **Live model behaviour is unproven.** Nothing at Build called Workers AI. R13–R15 are the first
  real calls. Two things are open:
  - Gemma 4 (reasoning off) may still prefer NO_ANSWER for `pack of 4` / `box of 6`. The prompt's
    EACH example already says `'pack of 4'`, which should help.
  - It may return `evidenceSource: "NAME"` while quoting description text. The literal check would
    then store NO_ANSWER, which is safe but misses the value. If R13(b) fails, look at the raw reply
    (the script logs each outcome) before changing the validator. A prompt wording fix is the
    expected remedy, not loosening a rule.
- **Do not run the suggester on the three target products before R13.** The three are dev's
  `coconut-milk`, `croissants` and `free-range-eggs`. Build deliberately did not run it, so they
  keep whatever state earlier slices left. Any of them may already carry a NO_ANSWER row from
  `#900`/`#927` validation, which is why R13 uses `--include-attempted`. One may have a PENDING row
  or a net content (for example, accepted during `#900`'s validation). R13 then treats it as
  ineligible; do not reject a row to make room.
- **R15 on dev:** `Orange Juice 1L` exists in the seed, but may already have net content on dev
  from `#900`/`#927` validation. The validator may need another product with a sized name, or may
  fall back as R15 allows.
- **Guard (c) checks the name only.** A product named without a size, whose unit label is
  `£0.80 / 100g`, can still take a description size. That is intended (see `plan.md`), and the
  unit-label cross-check badge still runs.
- **The `ALTER TYPE … ADD VALUE` migration inside Prisma's migration transaction.** It applied
  cleanly on dev (Postgres 12+ allows it when the new value is not used in the same transaction).
  Staging and production will apply it through CI's `migrate deploy`. Their first successful
  deploy is the proof.
- **`app/(admin)/staff/runbook/docs.ts`** was regenerated by `kms:build-index` (see Deviations).
  Check `git diff origin/staging --stat -- "app/(admin)/staff/runbook/docs.ts"`: the change is
  confined to the staff guide's entry and the artifact list, not a wholesale re-encoding. The file
  already carried mojibake such as `â€”` on `origin/staging`, so compare against that, not against
  clean UTF-8.

## R13 live results (Validate, 2026-09-28)

All three target products were eligible (before-snapshot: all active, `netContentAmount` null, no
PENDING row — only settled `NO_ANSWER` rows from earlier slices). None of the "known-shaky areas"
above materialised: Gemma 4 answered `DESCRIPTION` for all three EACH/ml cases on the first try, no
prompt fix was needed.

```
-- coconut-milk --
  suggested Coconut Milk -> 400 MILLILITRE (DESCRIPTION)
attempted: 1  pending: 1  no answer: 0  failed: 0  tokens in/out: 775/43  neurons (est.): 8.2  mean latency: 1605 ms

-- croissants --
  suggested Croissants -> 4 EACH (DESCRIPTION)
attempted: 1  pending: 1  no answer: 0  failed: 0  tokens in/out: 509/38  neurons (est.): 5.7  mean latency: 986 ms

-- free-range-eggs --
  suggested Free Range Eggs -> 6 EACH (DESCRIPTION)
attempted: 1  pending: 1  no answer: 0  failed: 0  tokens in/out: 508/38  neurons (est.): 5.7  mean latency: 1668 ms
```

(a) all three rows carry the expected value, unit and `DESCRIPTION` evidence — none wrong. (b) 3/3
PENDING (only 2 required). (c) all three products' `netContentAmount` re-read as still `null`
afterward.

**R15:** ran against `Apple Juice 1L` (id `945a184a-2969-4892-9d15-c4fac3d6efd2`, `metricSizesIn(name)
= ["1l"]`, chosen over the spec's `Orange Juice 1L` example because that exact product does not
exist in the Aheed catalogue) — result `1 LITRE`, `evidenceSource: "NAME"`, not `DESCRIPTION`.

**R14:** curl against `npm run preview` on `:8787`, signed in as `demo-store-admin@example.com`. The
rendered HTML contains `from the <!-- -->description<!-- -->: "<!-- -->400ml tin<!-- -->"` (and the
same for `pack of 4` / `box of 6`) — React SSR splits static text from interpolated values with
`<!-- -->` comment markers, so a literal `grep -o "from the description"` finds nothing even though
the page is correct; grep for `from the <!-- -->description` instead.
