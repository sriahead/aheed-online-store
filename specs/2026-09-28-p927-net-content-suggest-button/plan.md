---
id: p927-net-content-suggest-button-plan
title: "#927 — Staff button to run net-content suggestions (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-28
visibility: internal
summary: A store admin asks the AI for net-content suggestions from /staff/net-content, 10 products per click with a per-click neuron budget, instead of running the #900 script from a terminal. Suggestions still reach a product only by a staff decision.
tags: [catalogue, net-content, ai, workers-ai, staff-panel, p9-2]
related: [architecture, p900-ai-net-content-suggestions-plan]
---

# #927 — Staff button to run net-content suggestions (plan)

`#900` shipped AI-suggested net content as an **offline script**
(`scripts/suggest-net-content.ts`) plus a staff review page (`/staff/net-content`). Running the
script against production needs a developer machine, the production secrets file, and a command
the assistant's auto mode refuses to run. The production pilot (`#901`, 2026-09-28) ran it twice
by hand:

- 35 products attempted, 25 suggestions, 10 no-answers, 0 failures;
- every suggestion matched the literal size in the name or unit label, and every no-answer was
  correct by design;
- about 5 neurons per product.

The owner's decision at `/propose` (recorded on `#927`, 2026-09-28): it should work like the
products page's **"Auto-fill Missing Images"**, as a button in the staff panel.

**Goal:** a store admin can generate the next batch of net-content suggestions from
`/staff/net-content` with one click, bounded in products and neurons, with no terminal and no
secrets file. Nothing about **how** a suggestion becomes product data changes.

## Scope (this slice)

1. **Service function**, `runNetContentSuggestionsForVendor(vendorId)` in
   `lib/net-content-suggestions-service.ts`, the existing request-scoped facade. It wires the same
   dependencies the script wires into the **unchanged** `runNetContentSuggestions`
   (`lib/net-content-run.ts`):
   - `listEligibleProductsForNetContent(getPrisma(), vendorId, { includeAttempted: false }, 10)`;
   - the vendor's own `storeDescription`, via `getVendorConfig` from `lib/repositories/vendor.ts`
     (the same read `generateSynonymProposals` makes);
   - `createWorkersAiNetContentSuggester(model)`, where `model` is
     `resolveNetContentModel(undefined, getAiEnv().NET_CONTENT_AI_MODEL)`;
   - `getStorage()`'s `headObject`/`getObject` for photo bytes, exactly as the script's
     `loadPhoto` does;
   - `createNetContentSuggestion(getPrisma(), vendorId, …)`. This is a singular create with no
     nested writes, so the HTTP client is correct per `CLAUDE.md`.

   The per-click limits are two exported constants in that plain (non-`"use server"`) module:
   `STAFF_RUN_PRODUCT_LIMIT = 10` and `STAFF_RUN_NEURON_BUDGET = 150`. Ten matches the image
   backfill's `BACKFILL_BATCH`. 150 neurons is about three times the measured cost of 10 products
   (≈50), so it covers photo-bearing calls without letting one click burn the shared daily
   allowance.

   A model with no entry in `NET_CONTENT_MODEL_RATES` is **refused before any call**, because its
   spend could not be budgeted. The script's `--unpriced-ok` escape hatch has no button
   equivalent.

2. **Message builder**, `describeStaffNetContentRun(result)`, a pure function in the plain module
   `lib/net-content-review-form.ts`. It turns the service result into the button's
   `{ error, notice }` state. Its exact strings are fixed by R6 so the validator can compare text.

3. **Server action**, `suggestNetContent(_prev, _form)`, in
   `features/admin/net-content-suggestions.ts`. It runs `requireVendorRole("ADMIN")` first. That
   is the same guard as `proposeSynonymsFromLog` and the image backfill route, because this
   spends shared Workers AI quota. `STAFF` can review suggestions but not generate them. The
   vendor comes from the session, never from the form. On success it calls
   `revalidatePath("/staff/net-content")`. The file still exports only async functions.

4. **Client form**, `components/staff/SuggestNetContentForm.tsx`, using `useActionState`. This is
   the same shape as `ProposeSynonymsForm` in `components/staff/SynonymDictionary.tsx`. It is a
   plain `<form>` with one submit button, so it posts without client JS and can be driven with
   curl. The button reads **"Suggest net content"** and **"Asking the AI…"** while pending, and
   is disabled while pending. The outcome renders inline, using the existing `role="alert"` /
   `role="status"` convention. It never uses `alert()`.

5. **Page wiring**, `app/(admin)/staff/net-content/page.tsx`:
   - the form renders above the pilot summary, only when the viewer is not `via: "STAFF"`, which
     means a vendor `ADMIN` or a platform admin;
   - a `STAFF` viewer sees one sentence saying a store admin can ask for suggestions;
   - the empty-queue text stops saying suggestions appear "after the suggestion script is run".

6. **Docs:**
   - `docs/staff-playbook/staff-tabs-guide.md`'s `/staff/net-content` section currently says
     "this page has no button that asks the AI", which becomes false. It is rewritten to describe
     the button, who can use it, and the 10-per-click limit.
   - `specs/architecture.md`'s net-content paragraph (§ AI on request paths) currently names only
     the script. It gains the staff action as the second entry point, under the same "authenticated
     staff action, proposed never applied" default. This is not a new exception.
   - `docs/developer-portal/env-setup.md`'s suggester section gains one line saying the Worker
     reads the same `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` secrets the deploy workflows
     already `wrangler secret put`, so no new secret is needed.

## Why these choices

- **A server action, not an API route like `/api/admin/jobs/backfill-images`.** Every other
  write on `/staff/net-content` is a server action in `features/admin/net-content-suggestions.ts`.
  The synonym "Suggest from recent searches" button, the closest precedent (an admin-triggered AI
  proposal), is also one. A route would add a second convention to this page for nothing.
- **ADMIN only.** This matches both existing AI-spending buttons. Review stays open to STAFF,
  since reviewing costs nothing.
- **10 per click, not 25 or 100.** A healthy call takes about 1.2 s, but the suggester's timeout
  is 60 s per call. At 10, the worst case is a click that hangs for minutes, not tens of minutes,
  and the run loop already stops after 3 consecutive transport errors.
- **No change to the run loop, eligibility, validation or review.** `#900`'s safety property,
  "nothing reaches `Product` without a staff decision", lives in
  `lib/repositories/net-content-suggestions.ts`. This slice adds a caller, not a write path.

## Deliberately excluded

- **Sending the product description to the model.** `#901` found three products (Coconut Milk,
  Croissants, Free Range Eggs) whose size or count appears only in the description. This changes
  what the model sees and what its evidence may quote (R11 of `#900`), so it needs its own
  proposal.
- **A "not applicable" marker, and products sold loose by weight.** These stay with `#697`.
- **A re-attempt control** (the script's `--include-attempted` / `--product`). The button walks
  only never-attempted products. Re-attempting after a photo is confirmed stays a script action.
- **Choosing the model or budget from the page.** Both are fixed constants or config.
- **Scheduling, bulk runs, or auto-accept of any kind.**
- **A lock against two admins clicking at once.** Two concurrent clicks can suggest for the same
  product twice. This is harmless: the second Accept is refused by `#900`'s compare-and-set,
  because the product already carries net content, and the duplicate can be rejected. That is
  accepted rather than built for.
- **Changing or removing the CLI script.** It stays for dev and bulk use.

## Open items carried forward

- **`#901`'s remaining ~45 Aheed products** are run with this button once it is in production.
  `#901` records the final pilot summary.
- **`#697`** (not-applicable marker, loose-by-weight products, description-only sizes) waits for
  that summary.
