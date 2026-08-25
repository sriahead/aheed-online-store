# P8.5f — Landing Slim-Down, Header Postcode & Campaign Date/Banner Fixes (build notes)

Written at the end of Build, before the Clear. Spec commit `f54343f`, implementation commit
`1a87ddc`, branch `feature/p8.5f-landing-header-campaign-fixes`.

Local gates at end of Build: `typecheck` clean, `lint` exit 0, **612 tests pass across 50 files**,
`format:check` exit 0, `next build` succeeds and reports `ƒ Proxy (Middleware)`.

## What changed and why

**The timezone fix is the only part of this slice that was repairing a live data defect**, and it is
the part worth reading the code for. `lib/local-datetime.ts` is new, pure and DB-free. It exists
because an `<input type="datetime-local">` submits a naked wall-clock string with no offset, and
ECMAScript specifies that such a string is read in **the runtime's own** zone. So
`new Date("2026-08-25T07:25")` meant `07:25Z` on the Worker, while `CampaignForm.tsx` rendered it
back with `date.getHours()` in the admin's browser and displayed `08:25`. Write and read assumed
different zones; the gap was the BST offset. The fix is not "add an hour" — it is that **both
directions now name their zone explicitly** and read offsets from `Intl.DateTimeFormat` rather than
the process clock. Wired into `lib/campaign-form.ts` and `features/admin/discount-codes.ts` (which
carried the same defect independently, deciding when discount codes are redeemable), and
`CampaignForm.tsx`'s local `toLocalInputValue` is deleted rather than fixed in place.

**The header became route-aware, which required a file this repo did not have.** A Next layout
cannot see which page it wraps, and `Header.tsx` is rendered once by `app/(storefront)/layout.tsx`
for every storefront route. The new root `proxy.ts` annotates each request with `x-pathname`;
`Header` reads it through the `headers()` call it already made. Everything else about the header's
server-rendered, zero-client-JS posture is unchanged.

**The postcode checker moved from the hero into the header and gained persistence.** It was a
`method="GET"` form whose answer lived in `/?postcode=` and vanished on the first navigation. It is
now a server-action form writing a `delivery-postcode` cookie. **Only the postcode is stored, never
the deliverable/not verdict** — that is recomputed every render by `isDeliverable()` against the
vendor's current prefixes, so a vendor widening their delivery area cannot leave shoppers holding a
stale "we don't deliver to you".

**Landing and `/categories` swapped roles.** Landing keeps the hero and trust strip. `/categories`,
previously a bare `<ul>` of links, is the shop page. Its hardcoded `metadata` title read
"Categories — Aheed Food Centre" and rendered under SriMart too — the #239 vendor-leak class — so it
is now vendor-derived.

**The AI banner is the second caller of an existing port**, not new infrastructure.
`lib/image-generation.ts` (Workers AI, `flux-1-schnell`) has backed product images since P8.

Two small modules exist for reasons that are not obvious from their contents:

- **`lib/delivery-cookie.ts`** holds the cookie name and input normalisation because
  `features/storefront/delivery.ts` is `"use server"`, where every export must be an async function
  (the #159 trap). `Header` needs the cookie name to *read* the value, so it cannot live beside the
  action.
- **`lib/request-headers.ts`** holds `PATHNAME_HEADER` so `Header` can import it without pulling
  `next/server` — and the proxy module itself — into the render path.

## Decisions taken during the build

1. **`parseLocalInput` validates component ranges, not just the regex shape.** Added *after* a test
   failed: `Date.UTC(2026, 12, 45, 99, 99)` does not reject — it rolls over into February 2027, and
   `2026-02-31` silently becomes 3 March. The function now re-reads the components off the result
   and rejects any mismatch. Rejected: trusting the regex, which only proves shape.
2. **Two-pass DST offset resolution.** The first guess applies the offset in force at the wall-clock
   time treated as UTC, which can land the wrong side of a transition; a second lookup at the
   resulting instant corrects it. A wall-clock time inside the spring-forward gap (which does not
   exist) resolves to the instant after the jump rather than throwing — matching how a browser's own
   picker behaves. Rejected: throwing, which would surface as an unexplained form error once a year.
3. **`hourCycle: "h23"` rather than `hour12: false`.** The latter is specified to produce hour `24`
   for midnight in some engines/locales, which would push a date forward a day.
4. **`isLanding` fails toward showing search.** When `x-pathname` is absent (proxy not running,
   matcher misconfigured), the header treats the route as non-landing. The landing page is the one
   that *hides* search, so failing this way degrades to "search visible everywhere" rather than
   "search silently gone from the whole store".
5. **The `full` postcode variant renders in both the desktop and mobile slots.** The desktop slot is
   `hidden sm:block`, so without the mobile row the checker would be unreachable on a phone. This
   mirrors the duplication `SearchForm` already had in the same two slots.
6. **On non-landing routes the postcode is a read-only badge, not a second form.** Search occupies
   that space; a second editable control would compete with it. The shopper edits the postcode on
   the landing page.
7. **An empty submission clears the cookie**, rather than adding a separate "forget" control to a
   header the slice is deliberately thinning.
8. **AI route status codes:** `404` for an unknown category, `400` for a category with no saved
   campaign row (`setCampaignImage` refuses to upsert one into being, so failing early avoids
   spending a generation on an image that could not be attached), `503` when the AI service is
   unconfigured, `500` otherwise.
9. **The generated banner is stored with its real `image/png` content type at a `.webp`-suffixed
   key.** `buildCampaignImageKey` always suffixes `.webp`, and the key shape has to keep passing
   `isCampaignImageKey`, which the upload path enforces. `lib/product-image-pipeline.ts` already made
   and documented this exact trade. Filed as **#364** rather than transcoding here — it affects the
   product pipeline identically and is worth doing once, for both.
10. **The generate route calls `revalidatePath`**, unlike the product route which relies on the
    client's `router.refresh()`. A campaign banner is live on the public storefront hero the moment
    it attaches, so the same surfaces `attachCampaignImage` refreshes are refreshed here.
11. **`/categories` uses `<h1>Shop by department</h1>`** — the page needs exactly one `h1` and
    `ProductRow` already renders `h2`s beneath it. Title is `Shop — {vendor name}`.
12. **The old campaign date test was replaced, not extended.** It asserted only
    `toBeInstanceOf(Date)`, which is exactly how this defect shipped: a `Date` built from the wrong
    instant is still a `Date`. It now pins the UTC instant.

## Deviations from the spec

1. **R25's alt-text source is the persisted campaign row, not the request body.** R23 requires the
   route to read **only** `categoryId` from the body; R25 describes using "the admin's typed alt text
   when the form carries one". Those two cannot both hold if alt text arrives in the body. R23 was
   kept literal — it is the security-shaped requirement, guarding against a caller naming the prompt
   or the storage key — so alt text comes from `campaign.altText` (which *is* the admin's typed value,
   as last saved) and falls back to a derived description naming the department. **R25's substance
   holds: no path writes an `imageKey` with an empty `altText`.** Its wording needs a Spec-level
   correction; per `sdd-workflow.md`'s precedent for R40, tightening a requirement's own text is a
   Spec correction, not a `/fix` finding.
2. **`.prettierignore` now ignores `.claude/` — outside this slice's scope.** A stale registered git
   worktree (`git worktree list` shows `.claude/worktrees/agent-a65173af638823456` on the
   already-merged `feature/p8.5a-product-card-upgrade`) made local `format:check` fail on 26
   untracked files. All of them are `docs/ui-ref/` or `runbook/docs.ts` copies that the root
   `.prettierignore` **already** excludes — they fail only because those patterns are root-anchored
   and don't reach into a nested worktree. CI on Linux never sees the directory, so CI was green
   throughout; this was a local-only artifact that would have made R33 unpassable for a fresh
   validator. **The worktree itself was deliberately not removed** — it may hold another session's
   uncommitted work, and that deletion is not this slice's call. Filed as **#366**.
3. **Two files not named in `plan.md`:** `lib/delivery-cookie.ts` and `lib/request-headers.ts`.
   Additive rather than contrary — both exist to satisfy constraints the plan states (the `"use
   server"` async-only export rule, and keeping `next/server` out of the render path) and neither
   changes any requirement's meaning.

## Known-shaky areas

Ranked by where I would look first.

1. **`Intl.DateTimeFormat` with a named timezone under `workerd`.** The entire timezone fix rests on
   it. Unit tests prove the logic in Node (including under `TZ=UTC` and `TZ=America/New_York`), and
   `next build` succeeds, but **nothing so far has executed it in the Workers runtime.** If workerd's
   ICU data omits zone tables, `zoneOffsetMs` silently returns `0` and every BST date is an hour out
   — the same symptom as the original bug, from a different cause. **R19/R21 under `npm run preview`
   is the check that matters; `npm run dev` would pass on real Node's full ICU and prove nothing.**
2. **`proxy.ts` at runtime under OpenNext.** The build registers it (`ƒ Proxy (Middleware)`), which
   proves it compiled — not that `x-pathname` survives OpenNext's request pipeline into the Server
   Component's `headers()`. If it doesn't arrive, the failure is *silent and looks like nothing
   happened*: the header renders its non-landing form everywhere (per decision 4), so `/` keeps
   showing search and no error appears anywhere. **R14 is the tell** — check both routes, not just
   `/`.
3. **A server action bound to a form inside a layout-rendered component.** Every existing server
   action in this repo is dispatched from a page or a client component; this is the first in the
   header itself. `revalidatePath("/", "layout")` is what makes the badge update on whichever route
   the form was submitted from, and it is unexercised.
4. **The `Secure` cookie under `npm run preview` at `http://localhost:8787`.** Browsers treat
   localhost as a secure context, and `lib/cart-identity.ts` already relies on this, so it should
   hold — but R8 reads the `Set-Cookie` header directly, and if the cookie never lands, R9–R11 all
   fail for one shared reason rather than three separate ones.
5. **The AI path may be unreachable locally.** It needs `CLOUDFLARE_ACCOUNT_ID` and
   `CLOUDFLARE_API_TOKEN` in `.dev.vars`; absent, `getImageGenerationService()` degrades to `null`
   and the route returns `503` — which is R26's expected result, so **a `503` may mean the guard
   works or may mean the credentials are simply missing.** Confirm which before reading R22–R25 as
   passes.
6. **The generated banner cannot be judged visually under local preview.** It is a raster asset, and
   both CDN zones return `403` to a `localhost` referer (#235). R24 asserts the key and the row;
   the visual belongs on deployed staging.
7. **Pre-existing rows hold the old, wrong instants.** Any campaign or discount window saved before
   this slice names an instant one BST hour from what was typed. Correcting them is explicitly out of
   scope; R21's note says to record by hand which rows were corrected at `/validate`.
8. **The landing page now has two `name="postcode"` inputs in the DOM** (desktop and mobile slots,
   one CSS-hidden). No duplicate `id`s were introduced, and it mirrors what `SearchForm` already did
   — but the a11y suite in `tests/a11y/` has not been run against this specific arrangement.

## Addendum — `/fix` pass, 2026-08-25 (post-merge)

Written after `/validate` found the "Known-shaky area #2" risk above was not a risk but a confirmed,
reproducible failure: `npm run preview` and, after merging PR #367 to `staging` specifically to check
this, the real `deploy-staging` run **both** hard-fail at the `opennextjs-cloudflare build` step with
`ERROR Node.js middleware is not currently supported. Consider switching to Edge Middleware.` —
`process.exit(1)`, unconditional, in `@opennextjs/cloudflare`'s own build script the moment it detects
Node-runtime middleware. Next 16 forces every Proxy file onto the Node.js runtime and forbids opting
out (`runtime` in a Proxy file throws) — so no `proxy.ts` on this project's pinned
`@opennextjs/cloudflare` (`1.20.2`, the newest published version) can satisfy both constraints. This
was never exercised at Build; `next build` (used to write the "reports `ƒ Proxy (Middleware)`" line
above) never invokes the Cloudflare adapter's build step, so it stayed green while the thing it was
meant to prove was already broken.

**Fix:** replaced `proxy.ts`/`x-pathname` with a second route group. `app/(landing)/` now holds only
`page.tsx` for `/` (route groups don't affect the URL); both it and `app/(storefront)/layout.tsx`
render the newly-extracted `components/layout/StorefrontChrome.tsx`, passing an explicit `isLanding`
boolean into `Header` — the same pattern `isPortal` already used for the admin layout. `proxy.ts` and
`lib/request-headers.ts` are deleted. R13/R16/R29 were revised in `requirements.md`/`validation.md`
to describe the new mechanism (a Spec-level correction, per the R25 precedent — the original
technical approach was proven undeployable, not merely mis-described).

**Also fixed at this pass:** R1 requires none of `/`'s rendered HTML to contain "Shop by department",
but `DepartmentHero`'s own (pre-existing, P8.5b) carousel `aria-label` used exactly that phrase —
found only by running R1's literal `curl`+`grep` check against a live server, which the original
Build never did for this row. Renamed to "Department spotlight" (`components/layout/DepartmentHero.tsx`).

**Re-verified live** (migrated the local dev DB, which was 2 migrations behind on P8.5b/P8.5e, then
re-ran the full `npm run preview` + browser pass): R1, R2, R3, R4 (cart stepper in both rows), R5
(SriMart title via `Host` header), R6, R7, R8 (Set-Cookie attributes match exactly), R9, R10, R11,
R14, R15, R16, R21 (DB-verified: `startsAt` stored as `2026-08-25T06:25:00.000Z` for `07:25` typed on
a BST date), R22 (401/403/503 all confirmed), R23, R26. R24/R25 (AI banner happy path) and the
pre-existing upload control's PUT-to-R2 step remain unverified — no `CLOUDFLARE_ACCOUNT_ID`/
`CLOUDFLARE_API_TOKEN` in this environment for the former, and the browser's direct PUT to the
presigned R2 URL did not complete in this sandboxed session for the latter (reproducible, but the
underlying primitives — `createImageBitmap`, `canvas.toBlob`, the presign server action itself all
confirmed instant and correct in isolation; the crash is specific to the automated tab reaching an
external `https://*.r2.cloudflarestorage.com` origin, not app code). Consistent with CLAUDE.md's
already-documented raster-image local-preview limitation — confirm both on deployed staging.
