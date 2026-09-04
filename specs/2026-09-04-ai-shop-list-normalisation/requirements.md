# P2.6 slice 4 — AI Shop List normalisation over the existing matcher (requirements / acceptance criteria)

Closes `#567`. Builds on P3d's shipped "Shop your list" (`#114`) and P2.6 slice 3's synonym
dictionary (`#566`). An AI pre-pass converts pasted free text into structured items — name,
quantity, measure, brand — which are handed to the existing, unchanged deterministic matcher. The
AI interprets input only; every candidate product still comes from `matchProductListTerms`'s single
vendor-scoped query. The call is bounded per submission and per caller, and every failure mode
degrades to exactly today's behaviour rather than erroring. Pack sizes the catalogue cannot satisfy
exactly are routed to a customer choice, never guessed — the `#398` unit model stays out of scope.

## Normalisation module (pure)

R1. `lib/list-normalisation.ts` exists and exports a `NormalisedItem` type with the fields `index`
    (number), `name` (string), `quantity` (number), `measure` (string or null) and `brand` (string
    or null), plus the constants `MAX_AI_INPUT_CHARS`, `NORMALISATION_MODEL` and
    `NORMALISATION_TIMEOUT_MS`.

R2. `parseNormalisationResponse` returns the parsed items when the model's reply is a bare JSON
    array, when that array is wrapped in surrounding prose, and when it is inside a fenced code
    block.

R3. `parseNormalisationResponse` returns an empty array — and does not throw — for each of: a reply
    that is not valid JSON, a reply whose JSON is not an array, and an array whose elements are not
    objects.

R4. `parseNormalisationResponse` drops any item whose `index` is not an integer within `0` to
    `lineCount - 1`, and drops any item repeating an `index` already seen, keeping the first.

R5. `parseNormalisationResponse` drops any item whose `name`, after trimming, is empty, and
    truncates a `name` longer than 100 characters rather than passing it through.

R6. `ParsedLine` in `lib/shopping-list.ts` gains two optional fields, `measure` (string or null) and
    `brand` (string or null), and every existing construction site of a `ParsedLine` continues to
    type-check without supplying them.

R7. `mergeNormalisedItems(lines, items)` returns exactly one entry per element of `lines`, in the
    original order, and every entry for a line with no surviving item is deep-equal to that line's
    original deterministic parse.

R8. `mergeNormalisedItems` clamps a merged quantity to the range `1` to `MAX_LINE_QUANTITY`
    inclusive, for both a non-finite and an out-of-range value supplied by the model.

R9. A merged line's `brand` is never added to that line's `terms`: for an input the model normalises
    to name `butter` with brand `Amul`, the resulting `terms` contain no entry equal to `amul`.

R10. Every function named in R2 to R9 is importable and callable in plain Node with no network, no
     database and no Cloudflare request context — `npx tsx` can exercise them directly.

## The AI call and its degradation

R11. `lib/list-normalisation.ts` exports
     `normaliseList(lines: ParsedLine[]): Promise<NormalisedItem[] | null>`.

R12. `normaliseList` issues at most one `fetch` per invocation regardless of line count; a
     100-line list produces exactly one `fetch`.

R13. `normaliseList` targets
     `https://api.cloudflare.com/client/v4/accounts/<accountId>/ai/run/<NORMALISATION_MODEL>` with a
     bearer token, where `NORMALISATION_MODEL` is `@cf/meta/llama-3.1-8b-instruct`, and reads its
     credentials from `getAiEnv()` — the existing `CLOUDFLARE_ACCOUNT_ID` and
     `CLOUDFLARE_API_TOKEN`.

R14. `normaliseList` returns `null` rather than throwing for each of: absent
     `CLOUDFLARE_ACCOUNT_ID`, absent `CLOUDFLARE_API_TOKEN`, a non-OK HTTP response, a response body
     that fails to parse, and a `fetch` that rejects.

R15. `NORMALISATION_TIMEOUT_MS` is `6000`, `normaliseList` passes an abort signal derived from it to
     `fetch`, and a `fetch` that never settles causes `normaliseList` to resolve to `null` rather
     than hang.

R16. `wrangler.toml` gains no `[ai]` binding and no new binding of any kind in this slice.

## Cost bounds

R17. `MAX_AI_INPUT_CHARS` is `4000`, and when the text `normaliseList` would send exceeds it, the
     function returns `null` without issuing any `fetch`.

R18. `prisma/schema.prisma` defines a `ListNormalisationAttempt` model carrying `id`, `vendorId`, a
     `vendor` relation, `ipHash`, `createdAt`, and `@@index([vendorId, ipHash, createdAt])`.

R19. A migration directory under `prisma/migrations/` creates that table, and its `migration.sql`
     contains no `DROP INDEX` and no `DROP TABLE` statement.

R20. `lib/repositories/list-normalisation-rate-limit.ts` exports
     `checkListNormalisationRateLimit(prisma, vendorId, ip)` taking the Prisma client and vendor id
     as explicit parameters, refuses the 6th call from one IP inside a 60000ms window, stores a
     SHA-256 hash of the IP rather than the IP, and deletes rows older than its retention window on
     a low-probability sweep.

R21. `lib/list-normalisation-service.ts` exports the request-scoped facade resolving the Prisma
     client, the current vendor and the client IP, and
     `lib/repositories/list-normalisation-rate-limit.ts` contains no value import of `next/headers`,
     `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac` and no call expression of `getPrisma()` or
     `getPrismaWs()`.

R22. The rate limiter is consulted only when a `fetch` would otherwise be issued — a submission
     skipped for a missing credential or for exceeding `MAX_AI_INPUT_CHARS` writes no
     `ListNormalisationAttempt` row.

R23. Every path that skips the AI pre-pass logs exactly one `console` line containing the string
     `list-normalisation` and a machine-readable reason, and a submission that runs the pre-pass
     normally logs no such skip line.

R24. When the rate limit is exceeded, `matchList` issues no `fetch` to the AI endpoint and still
     returns a `MatchListState` whose `lines` is a non-empty array for a list that matches products.

## Pack sizes route to a customer choice

R25. When a line's merged `measure` is non-null and no candidate product's name contains that
     measure, the line's resolution `kind` is `ambiguous` and is never `matched`.

R26. When a line's merged `measure` is non-null and at least one candidate product's name contains
     that measure, the line may resolve to `matched` — a unit test covers `5kg basmati rice`
     resolving to a product named `Basmati Rice 5kg`.

R27. `components/cart/ShopYourList.tsx` renders text distinguishing the pack-size case from the
     ordinary ambiguous case, and the pack-size branch's product `select` carries an accessible name.

## Integration and safety

R28. No code path renders a product `id`, `name`, `slug` or `basePrice` originating from the model's
     reply; every `ListCandidate` reaching `resolveLines` comes from `matchProductListTerms`.

R29. `features/cart/match-list.ts` still issues exactly one candidate query per submission, and
     `features/cart/add-list-to-cart.ts` is unchanged by this slice.

R30. With no `CLOUDFLARE_ACCOUNT_ID` configured, `/shop-your-list` resolves a pasted list exactly as
     it does today — the existing `tests/shopping-list.test.ts` assertions pass unmodified.

R31. `features/cart/match-list.ts` remains a `"use server"` module exporting only async functions,
     and any new state constant it needs lives in `lib/shopping-list.ts` or another plain module.

## Gates

R32. `CHANGELOG.md` updated (Gate 4).

R33. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice, and
     `npm run kms:validate` and `npm run kms:check-generated` both exit 0.
