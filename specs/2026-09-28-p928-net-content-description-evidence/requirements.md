# #928 — Product description as net-content evidence (requirements / acceptance criteria)

This slice closes `#928` and refers to `#697`. The `#900` net-content suggester (and `#927`'s staff
button, which runs the same loop) also reads the first 500 characters of a product's
`description`. A size stated only there can therefore become a PENDING suggestion whose evidence
quotes the description. Four validator rules keep that safe:

- a non-empty excerpt;
- a literal quote;
- the name goes first;
- no ambiguous description.

Nothing reaches a `Product` without a staff decision, as before. Narrative, rationale and exclusions
are in `plan.md`. Gate 1 approval is on `#928` (owner, 2026-09-28).

Terms used below:

- **excerpt**: the value `descriptionExcerpt(product.description)` returns (R3).
- **metric size**: a match of the pattern R4 defines.

## Schema

R1. `prisma/schema.prisma`'s `enum NetContentEvidenceSource` lists exactly `PHOTO`, `NAME`,
    `UNIT_LABEL`, `DESCRIPTION`. Exactly one new directory under `prisma/migrations/` exists
    relative to `origin/staging`:
    - its name ends in `_p928_net_content_description_evidence`;
    - its `migration.sql` contains `ALTER TYPE "NetContentEvidenceSource" ADD VALUE 'DESCRIPTION';`;
    - the file contains no `DROP` (case-insensitive) and no other statement.

R2. On the **dev** database (host `ep-dry-morning-zab7dx08`), the enum
    `"NetContentEvidenceSource"` has the value `DESCRIPTION`, and `npx prisma migrate status`
    reports the database schema is up to date.

## Pure functions (`lib/net-content-suggester.ts`)

R3. `lib/net-content-suggester.ts` exports `DESCRIPTION_EXCERPT_CHARS = 500` and
    `descriptionExcerpt(description: string): string`, which returns:
    - (a) `""` for an empty or whitespace-only string;
    - (b) the trimmed string, unchanged, when the trimmed length is ≤ 500;
    - (c) otherwise, the trimmed string cut to its first 500 characters, then cut back to the last
      whitespace character within those 500, then trimmed at the end. So the result is ≤ 500
      characters and never ends in part of a word that continued past character 500. If those 500
      characters contain no whitespace, the result is the first 500 characters.

R4. `lib/net-content-suggester.ts` exports `metricSizesIn(text: string): string[]`, which returns the
    **distinct** metric sizes in `text`.
    - A metric size is a number (digits, optionally one `.` or `,` followed by digits), then
      optional whitespace, then one of these units, case-insensitive: `kg`, `g`, `gram`, `grams`,
      `ml`, `cl`, `l`, `litre`, `litres`. The longest unit wins, so `2 litres` is one match, not a
      match on `l`.
    - The match is not immediately preceded by a letter or a digit, and not immediately followed by
      a letter.
    - Each match is normalised by lowercasing, removing whitespace, and replacing `,` with `.`.
      Duplicates after normalisation count once.
    - Examples, which the unit tests assert exactly:
      - `"Rich, creamy coconut milk, 400ml tin."` → `["400ml"]`;
      - `"400 ml tin, also 400ML"` → `["400ml"]`;
      - `"400ml tin, also available in 1L"` → `["400ml", "1l"]`;
      - `"Free range eggs, box of 6."` → `[]`;
      - `"1lb bag"` → `[]`;
      - `"1,5 l bottle"` → `["1.5l"]`;
      - `"2 litres, 250 grams"` → `["2litres", "250grams"]`.

## Validator (`validateNetContentReply`)

R5. `validateNetContentReply`'s context parameter gains a required field `descriptionSent: string`
    (the excerpt actually sent, `""` when none). A reply with `evidenceSource: "DESCRIPTION"`
    returns a suggestion if and only if all of these hold, together with every rule that applies to
    any source today (JSON shape, amount, unit, confidence, evidence length ≤ 200, `EACH` needs a
    stated count):
    - (a) `descriptionSent` is non-empty;
    - (b) the normalised evidence occurs in the normalised `descriptionSent`, using the same
      normalisation as the NAME check;
    - (c) `metricSizesIn(context.name)` is empty;
    - (d) `metricSizesIn(descriptionSent)` has fewer than 2 entries.

    Otherwise it returns `null`. Unit tests cover each of (a)–(d) failing on its own and all four
    passing.

R6. The behaviour for `PHOTO`, `NAME` and `UNIT_LABEL` is unchanged. Two files must still contain
    every `it(` title they contained on `origin/staging`, and all those tests pass:
    `tests/net-content-suggester.test.ts` and `tests/net-content-run.test.ts`.

## Prompt (`buildNetContentPrompt` / `buildNetContentRequestBody`)

R7. `SuggesterInput` gains `description: string`, carrying the excerpt. When it is non-empty, the
    prompt built from it:
    - (a) contains a line exactly `Description: <excerpt>`, placed after the `Unit label:` line;
    - (b) lists `"PHOTO"|"NAME"|"UNIT_LABEL"|"DESCRIPTION"` as the allowed evidence sources;
    - (c) contains a rule to use the description only when the name, unit label and photo state no
      size;
    - (d) contains a rule that evidenceSource DESCRIPTION means evidence is copied exactly from the
      description text above;
    - (e) contains a rule to reply `{"amount": null}` when the description states more than one
      size;
    - (f) when no photo is sent, contains no line saying "use only the name and unit label".

R8. When the excerpt is `""`, `buildNetContentPrompt` returns exactly the string that
    `origin/staging`'s `buildNetContentPrompt` returns for the same name, unit label, photo flag
    and store description. A unit test asserts this for both photo flags against the full expected
    string written out as a literal in the test.

## Run loop and data path

R9. In `runNetContentSuggestions` (`lib/net-content-run.ts`), `RunProduct` gains
    `description: string`. For each product, `descriptionExcerpt(product.description)` is computed
    once, and that same value is passed to the suggester as `description` and to the validator as
    `descriptionSent`. A unit test with a description longer than 600 characters, whose only metric
    size lies after character 500, asserts three things:
    - the suggester received the cut excerpt, not the full text;
    - a reply quoting that later size is stored as NO_ANSWER;
    - a reply quoting a size inside the excerpt is stored as PENDING with `evidenceSource:
      "DESCRIPTION"`.

R10. `listEligibleProductsForNetContent` (`lib/repositories/net-content-suggestions.ts`) selects
     `description`, and `EligibleProduct` declares `description: string`. `git diff origin/staging
     -- lib/repositories/net-content-suggestions.ts` shows added lines only, and only inside
     `EligibleProduct` and `listEligibleProductsForNetContent`. No line of
     `reviewNetContentSuggestion`, `rejectNetContentSuggestion` or `createNetContentSuggestion`
     changes.

R11. `git diff origin/staging -- scripts/suggest-net-content.ts lib/net-content-suggestions-service.ts
     lib/net-content-eligibility.ts features/admin/net-content-suggestions.ts
     components/staff/SuggestNetContentForm.tsx components/staff/NetContentReviewRow.tsx` prints
     nothing. Eligibility, `#927`'s limits (10 products, 150 neurons), model resolution and both
     entry points are unchanged; each gets the description only through R10's list.

## Review page

R12. `app/(admin)/staff/net-content/page.tsx`'s `EVIDENCE_TEXT` maps `DESCRIPTION` to
     `"description"`, so a PENDING row whose `evidenceSource` is `DESCRIPTION` renders
     `from the description: “<evidenceText>”` on `/staff/net-content`. `npm run typecheck` exits 0,
     which confirms the map covers every enum value.

## Live proof (dev, `npm run preview`)

R13. On dev, `scripts/suggest-net-content.ts --env-file .dev.vars --vendor aheed-food-centre
     --product <id> --include-attempted --limit 1` is run once for each of the Aheed products
     `coconut-milk`, `croissants` and `free-range-eggs` that is eligible at the time. Across the
     rows it creates:
     - (a) no row carries a wrong value: each row is either NO_ANSWER, or PENDING with
       `evidenceSource: "DESCRIPTION"` and exactly Coconut Milk `400 MILLILITRE`, Croissants
       `4 EACH`, Free Range Eggs `6 EACH`;
     - (b) at least two of the three are PENDING with those values;
     - (c) no `Product` row's `netContentAmount` changes.

     A product is ineligible if it already carries net content or has a PENDING row. Record such a
     product and why. (b) then applies to the eligible products only, and needs every one of them
     to pass if fewer than three are eligible.

R14. Signed in as `demo-store-admin@example.com` under `npm run preview` on `localhost:8787`
     (Aheed), `/staff/net-content`'s HTML contains `from the description` for each R13 row that is
     PENDING.

R15. On dev, the same script is run once with `--product` for an eligible Aheed product whose
     **name** states a metric size (for example `Orange Juice 1L`, or any product for which
     `metricSizesIn(name)` is non-empty). The row it creates is not `evidenceSource: "DESCRIPTION"`.

## Persistent docs, gates

R16. `specs/architecture.md`'s `#900` net-content paragraph states three things:
     - quoted evidence must literally occur in the name, the unit label, or the description excerpt
       sent (500 characters);
     - description evidence is refused when the name states a metric size, or when the excerpt
       states more than one;
     - `#928`.

     Its front-matter `version` is greater than on `origin/staging`, and `updated` is ≥
     `2026-09-28`.

R17. `docs/staff-playbook/staff-tabs-guide.md`'s `/staff/net-content` section names `description`
     among the evidence sources in its **From the …** sentence. It contains one sentence telling
     staff that the AI reads the start of the product's description and to check the quoted text.
     Its front-matter `version` is greater than `2.8.0`, and `updated` is ≥ `2026-09-28`.

R18. `npm run kms:validate` exits 0 with `invalid front-matter (failing): 0`. After
     `npm run kms:build-index`, `ARTIFACT_INDEX.md` lists
     `specs/2026-09-28-p928-net-content-description-evidence/plan.md` exactly once.
     `npm run kms:check-generated` exits 0. After `npm run kms:assemble:internal`,
     `npx next build --webpack` inside `kms/site-internal` exits 0.

R19. `CHANGELOG.md` has a `#928` entry under `## [Unreleased]` (Gate 4).

R20. `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0, and
     `npx vitest run` exits 0. CI on the PR is green.
