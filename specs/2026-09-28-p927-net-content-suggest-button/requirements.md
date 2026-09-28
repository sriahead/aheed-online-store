# #927 — Staff button to run net-content suggestions (requirements / acceptance criteria)

This slice closes `#927`. It builds on `#900` (`specs/2026-09-25-p900-ai-net-content-suggestions/`).
Before it, the only way to create net-content suggestions was `scripts/suggest-net-content.ts`,
run from a terminal. This slice adds a **"Suggest net content"** button on `/staff/net-content`
for store admins. One click runs the **unchanged** `#900` run loop for the signed-in vendor, for at
most 10 products and 150 neurons. Nothing reaches `Product` except by a staff Accept or Edit, as
before. Read `plan.md` for why.

Terms used below:
- **Dev:** the database named by `.env`/`.dev.vars`, host `ep-dry-morning-zab7dx08`. Never staging
  or production.
- **Store admin:** a vendor `ADMIN` membership, or a platform admin. `requireVendorRole("ADMIN")`
  passes for both.
- **Staff-only:** a vendor `STAFF` membership. `requireVendorRole` returns `via: "STAFF"`.
- **The run loop:** `runNetContentSuggestions` in `lib/net-content-run.ts`.

## Service

R1. `lib/net-content-suggestions-service.ts` exports `STAFF_RUN_PRODUCT_LIMIT` equal to `10` and
    `STAFF_RUN_NEURON_BUDGET` equal to `150`. The file has no `"use server"` directive.

R2. The same file exports `runNetContentSuggestionsForVendor(vendorId: string)`. It returns exactly
    one of `{ kind: "unpriced-model"; model: string }`, `{ kind: "nothing-eligible" }`,
    `{ kind: "not-configured" }` or `{ kind: "ran"; summary: RunSummary }`, where `RunSummary` is
    the run loop's exported type.

R3. The model is `resolveNetContentModel(undefined, getAiEnv().NET_CONTENT_AI_MODEL)`. When that
    model has no entry in `NET_CONTENT_MODEL_RATES`, the function returns `unpriced-model` without
    listing products and without calling the suggester.

R4. Otherwise it lists products with
    `listEligibleProductsForNetContent(getPrisma(), vendorId, { includeAttempted: false }, STAFF_RUN_PRODUCT_LIMIT)`.
    When that list is empty it returns `nothing-eligible` without calling the suggester.

R5. Otherwise it calls the run loop once, with:
    - that product list;
    - `createWorkersAiNetContentSuggester(model)`;
    - the vendor's `storeDescription` from `getVendorConfig` in `lib/repositories/vendor.ts`, or
      `null` when absent;
    - `neuronBudget: STAFF_RUN_NEURON_BUDGET`;
    - the model's rate from `NET_CONTENT_MODEL_RATES`;
    - a `loadPhoto` that reads `getStorage().headObject` and `getObject` for the image's
      `storageKey`, returning `null` when the object is missing;
    - a `saveSuggestion` that calls `createNetContentSuggestion(getPrisma(), vendorId, input)`.

    The summary's outcome maps as follows: `not-configured` returns `{ kind: "not-configured" }`;
    every other outcome returns `{ kind: "ran", summary }`.

## Message

R6. `lib/net-content-review-form.ts` exports a pure function `describeStaffNetContentRun(result)`.
    It returns a `NetContentReviewState` (`{ error, notice }`, exactly one non-null) with these
    exact strings. `N` = `attempted`, `P` = `pending`, `A` = `noAnswer`, `F` = `failed`, and
    `X` = `Math.round(neurons)`:

    | Result | Field | Text |
    |---|---|---|
    | `unpriced-model` | error | `The AI model <model> has no cost rate, so it can't be run from here. Nothing was asked.` |
    | `nothing-eligible` | notice | `No products are waiting for a net-content suggestion.` |
    | `not-configured` | error | `The AI isn't set up for this store, so nothing was asked.` |
    | `ran`, outcome `completed` | notice | `Asked about N product(s): P suggested, A no answer, F failed (about X neurons).` |
    | `ran`, outcome `budget-reached` | notice | the `completed` text followed by ` Stopped at this click's AI budget; click again for more.` |
    | `ran`, outcome `transport-errors` | error | `The AI stopped responding. Asked about N product(s): P suggested, A no answer, F failed. Try again later.` |

## Server action

R7. `features/admin/net-content-suggestions.ts` exports `async function suggestNetContent(_prev,
    _form)`, returning `Promise<NetContentReviewState>`. Every export of the file remains an async
    function.

R8. `suggestNetContent` calls `requireVendorRole("ADMIN")` before anything else. On refusal it
    returns an `error` without calling `runNetContentSuggestionsForVendor`:
    - `Please sign in as a store admin to ask for suggestions.` for status 401;
    - `Only a store admin can ask the AI for suggestions.` for status 403.

R9. On success it calls `runNetContentSuggestionsForVendor(auth.vendorId)`, with the vendor taken
    only from the session and no form field read. It calls `revalidatePath("/staff/net-content")`
    when the result kind is `ran`, and returns `describeStaffNetContentRun(result)`.

## UI

R10. `components/staff/SuggestNetContentForm.tsx` is a client component rendering one `<form>`
     bound to `suggestNetContent` via `useActionState`, with one `type="submit"` button:
     - label `Suggest net content`, or `Asking the AI…` while pending;
     - `disabled` while pending.

     A non-null `error` renders with `role="alert"` and a non-null `notice` with `role="status"`.
     The component does not call `alert()`.

R11. `app/(admin)/staff/net-content/page.tsx`:
     - renders `SuggestNetContentForm` above the pilot summary when `auth.via !== "STAFF"`;
     - for a staff-only viewer, renders instead the exact sentence
       `A store admin can ask the AI for more suggestions.` and no form bound to
       `suggestNetContent`;
     - no longer contains the string `after the suggestion script is run`.

## Unchanged

R12. `git diff origin/staging -- lib/net-content-run.ts lib/net-content-eligibility.ts
     lib/net-content-suggester.ts lib/repositories/net-content-suggestions.ts
     scripts/suggest-net-content.ts prisma/` is empty.

## Live behaviour (dev, `npm run preview`)

R13. Signed in as `demo-store-admin@example.com` on the Aheed host, invoking `suggestNetContent`
     once creates between 1 and 10 new `NetContentSuggestion` rows, all for vendor
     `aheed-food-centre`. The returned notice's `N` equals the number of rows created. No
     `Product.netContentAmount` changes.

R14. A second invocation right after R13 creates rows only for products that had **no**
     `NetContentSuggestion` row before it. No product gets a second row.

R15. Signed in as `demo-staff@example.com`:
     - invoking `suggestNetContent` returns `Only a store admin can ask the AI for suggestions.` and
       creates no row;
     - the rendered `/staff/net-content` HTML contains
       `A store admin can ask the AI for more suggestions.` and not `Suggest net content`.

## Docs

R16. The `## Net content review — \`/staff/net-content\`` section of
     `docs/staff-playbook/staff-tabs-guide.md`:
     - no longer contains `this page has no button that asks the AI`;
     - names the `Suggest net content` button, says only store admins see it, and says one click
       asks about at most 10 products.

     The file's front-matter `version` is bumped and `updated` is `2026-09-28` or later.

R17. The `#900` net-content paragraph in `specs/architecture.md` names
     `suggestNetContent` (`features/admin/net-content-suggestions.ts`) as a second entry point,
     behind `requireVendorRole("ADMIN")`. `docs/developer-portal/env-setup.md`'s net-content section
     says the Worker uses the existing `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` secrets. Both
     files' front-matter `version` is bumped.

## Gates

R18. `npm run kms:validate` exits 0 with no failing files. After `npm run kms:build-index`,
     `ARTIFACT_INDEX.md` lists this slice's `plan.md`. `npm run kms:check-generated` exits 0, so the
     staff runbook bundle (`app/(admin)/staff/runbook/docs.ts`) carries R16's edited guide.
     `npm run kms:assemble:internal` followed by
     `npx next build --webpack` in `kms/site-internal` exits 0.

R19. `CHANGELOG.md` has an entry under `## [Unreleased]` citing `#927` (Gate 4).

R20. `npm run lint`, `npm run typecheck`, `npm run format:check` and `npx vitest run` (run alone)
     all exit 0 after this slice.
