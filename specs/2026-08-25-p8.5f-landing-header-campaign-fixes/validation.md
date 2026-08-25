# P8.5f — Landing Slim-Down, Header Postcode & Campaign Date/Banner Fixes (validation)

**Before running any row below.** Start `npm run preview` (never `npm run dev` — it cannot load
`@prisma/client/wasm` and every DB-touching route silently renders an error state). Preview serves
on `http://localhost:8787`. When you stop it, kill the whole process chain, not just the top-level
`npm` — `Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'" | Select
ProcessId,CommandLine`, match on this repo's path and `wrangler dev`, then `taskkill /F /PID <id>`
for each — or the next build fails with `EBUSY ... rmdir '.open-next\assets'`.

**Before any live-DB row.** Diff `.env` and `.dev.vars` against **both** `secrets/staging.vars` and
`secrets/production.vars` and confirm the Neon host is *staging*, not production. Two files agreeing
is not evidence they are right (CLAUDE.md, Config & secrets). Anchor any grep of an env file
(`^DATABASE_URL`, not `BASE_URL`) so a connection string with its password is never printed.

Browser rows use the seeded vendor **ADMIN** demo account unless the row says otherwise.

| Req | How to verify |
|-----|---------------|
| R1  | `curl.exe -s http://localhost:8787/ \| Select-String -Pattern "Shop by department","New Arrivals","Featured Products"` — prints nothing (no matches). |
| R2  | `curl.exe -s http://localhost:8787/ \| Select-String -Pattern "<h1","Local Delivery","Secure Checkout","Order Updates"` — all four match; visually confirm in a browser that the `DepartmentHero` panel still rotates. |
| R3  | `curl.exe -s http://localhost:8787/categories \| Select-String -Pattern "Shop by department","New Arrivals","Featured Products"` — all three match. In a browser at `/categories`, count the cards in each row: 4 or fewer in each. |
| R4  | In a browser under preview, add one product to the cart from `/categories`, then reload `/categories`. That product's card shows the quantity stepper with quantity 1 (not the plain "+ Add" control); a different product's card still shows "+ Add". |
| R5  | `curl.exe -s -H "Host: srimart-staging.nocaped.com" http://localhost:8787/categories \| Select-String -Pattern "<title>"` — the title contains `SriMart` and does not contain `Aheed Food Centre`. (SriMart's `VendorDomain` row must exist in the DB the preview Worker is pointed at.) |
| R6  | `curl.exe -s http://localhost:8787/categories \| Select-String -Pattern 'href="/search"'` — matches within the New Arrivals section (confirm position by viewing the page in a browser). |
| R7  | `curl.exe -s http://localhost:8787/ \| Select-String -Pattern 'name="postcode"'` — matches, and the match sits inside the `<header>` element (confirm with DevTools' element inspector on the rendered page). |
| R8  | In a browser with DevTools → Network open, submit a deliverable postcode (e.g. `MK9 1AA` for Aheed) from the header on `/`. Select the resulting request and read its `Set-Cookie` response header: it names `delivery-postcode` and contains `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=2592000`, and no `Domain=`. |
| R9  | Immediately after R8, without submitting again: the header on `/` shows the ✓ badge naming that postcode; navigate to `/categories` — the same ✓ badge is still in the header. |
| R10 | Submit a postcode outside the vendor's prefixes (e.g. `SW1A 1AA` for Aheed). The header shows the ✗ message naming the locality and prefixes. Navigate to `/categories` — the ✗ state persists, and DevTools → Application → Cookies shows `delivery-postcode` still set. |
| R11 | Clear the postcode field and submit. DevTools → Network shows a `Set-Cookie` for `delivery-postcode` with `Max-Age=0` or a past `Expires`; the header then shows neither ✓ nor ✗ on `/` or `/categories`. |
| R12 | `git diff --name-only <base>...HEAD` to list changed files, then `Select-String -Pattern '"use client"' <each changed file under components/layout/, features/, app/(storefront)/>` — no match in any file that renders the postcode form, its action, or the badge. |
| R13 | (Revised, `/fix` 2026-08-25) No `proxy.ts` exists at the repository root (`Test-Path proxy.ts` is `$false`). `Get-Content components/layout/Header.tsx` shows an `isLanding` prop, no `x-pathname` header read. `app/(landing)/page.tsx` exists and `app/(landing)/layout.tsx` passes `isLanding={true}` into `StorefrontChrome`; `app/(storefront)/layout.tsx` passes `isLanding={false}`. |
| R14 | `curl.exe -s http://localhost:8787/ \| Select-String -Pattern 'name="q"','href="/shop-your-list"'` — no matches. `curl.exe -s http://localhost:8787/categories \| Select-String -Pattern 'name="q"','href="/shop-your-list"'` — both match. |
| R15 | Signed in as vendor ADMIN, `curl.exe -s -o NUL -w "%{http_code}" http://localhost:8787/staff` (with the session cookie via `-b`) returns `200`; load `/staff` in the browser and confirm the portal header renders with no search input and no console error. |
| R16 | (Revised, `/fix` 2026-08-25) Load `/` in a browser under preview with DevTools → Network. Every `/_next/static/...` request returns `200` and the page's CSS/JS applies — there is no middleware in the revised mechanism to misconfigure a matcher on. |
| R17 | `Get-Content lib/local-datetime.ts` shows `STORE_TIMEZONE = "Europe/London"` and both exported functions; `Select-String -Pattern '^import' lib/local-datetime.ts` shows no import of `next/headers`, `@/lib/db`, `@/lib/config` or `@prisma/client`. |
| R18 | `npx vitest run tests/local-datetime.test.ts` exits 0, with named cases visibly covering: BST `2026-08-25T07:25` → `2026-08-25T06:25:00.000Z`; GMT `2026-01-15T07:25` → `2026-01-15T07:25:00.000Z`; `formatLocalInput` inverting both; and `parseLocalInput("")` → `null`. |
| R19 | `$env:TZ='UTC'; npx vitest run tests/local-datetime.test.ts` exits 0, then `$env:TZ='America/New_York'; npx vitest run tests/local-datetime.test.ts` exits 0 with the identical pass count. Finish with `Remove-Item Env:TZ` so later rows run under the machine's own zone. |
| R20 | `npx vitest run tests/campaign-form.test.ts` exits 0 including the new case asserting `parseCampaignForm({ startsAt: "2026-08-25T07:25", ... })` yields `2026-08-25T06:25:00.000Z`. Then `Select-String -Pattern 'new Date\(' lib/campaign-form.ts features/admin/discount-codes.ts` — any remaining match is a `new Date()` with no argument (a "now" read), never one taking a submitted form value. |
| R21 | Under preview, signed in as vendor ADMIN, open `/staff/promotions`, edit any department, set **Starts** to a BST date at `07:25` (e.g. `25/08/2026 07:25`), save, then reload the page with F5. The Starts field reads `07:25`. Re-check the stored instant with a `tsx` script (see the note below the table) — it is `06:25Z`. |
| R22 | `curl.exe -s -o NUL -w "%{http_code}" -X POST -H "content-type: application/json" -d "{\"categoryId\":\"<id>\"}" http://localhost:8787/api/admin/campaign-images/generate` with no session returns `401`. Repeat from a browser DevTools console while signed in as the seeded **customer** demo account (`await (await fetch('/api/admin/campaign-images/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({categoryId:'<id>'})})).status`) — returns `403`. Confirm with the R24 script that no campaign row changed. |
| R23 | `Get-Content app/api/admin/campaign-images/generate/route.ts` — the handler destructures only `categoryId` from the parsed body, and the string passed to `generateImage(...)` is built in that file from the department/campaign fields it loaded from the DB. No `prompt`, `key`, `imageKey` or `storageKey` is read from the body. |
| R24 | Signed in as vendor ADMIN under preview, click **Auto-Generate** on a department's campaign form. Then run a script file (not `npx tsx -e` — see note) reading that campaign row: `imageKey` matches `^categories/<thatCategoryId>/[0-9a-f-]{36}\.webp$`. **Do not judge whether the image renders from local preview** — a raster asset with a `localhost` referer is refused `403` by the CDN zone (CLAUDE.md, Storage). Confirm the visual on deployed staging after `/ship`. |
| R25 | Same row read as R24: `altText` is a non-empty string. Repeat the Auto-Generate with the alt-text field left blank — `altText` is still non-empty and names the department. |
| R26 | Comment out `CLOUDFLARE_API_TOKEN` in `.dev.vars`, **restart `npm run preview`** (`.dev.vars` is read at Worker boot, so editing it while preview runs has no effect), and click Auto-Generate. The UI shows an error message, the route's response status is non-2xx with a JSON body, and the R24 script shows `imageKey` unchanged from before the click. Restore `.dev.vars` and restart afterwards. |
| R27 | `/staff/promotions/<categoryId>` renders an "Auto-Generate" button; the existing file-picker upload still completes end to end (pick a `.webp` or any image, Upload, page shows the new banner preview). |
| R28 | `git diff --stat <base>...HEAD -- prisma/` prints nothing. |
| R29 | (Revised, `/fix` 2026-08-25) `git diff <base>...HEAD -- specs/architecture.md` shows the §2.1 route-aware-header paragraph (route groups + `isLanding` prop, and why the originally-planned `proxy.ts` was reverted) and a `version:`/`updated:` bump. Confirm the diff's line count is proportionate to the edit — a two-line front-matter bump landing as a 100+ line diff means a PowerShell encoding/line-ending rewrite (CLAUDE.md, Windows shell); `git checkout --` the file and redo it with the Edit tool. |
| R30 | `git diff <base>...HEAD -- specs/decisions/ADR-004-multi-tenancy.md` shows the `STORE_TIMEZONE` implementation note and a `version:`/`updated:` bump. Same diff-size check as R29. |
| R31 | `npm run kms:validate` exits 0 reporting `invalid front-matter (failing): 0`. `Select-String -Pattern '^id:' specs/2026-08-25-p8.5f-landing-header-campaign-fixes/plan.md` shows an id containing no `.`. |
| R32 | `git diff <base>...HEAD -- CHANGELOG.md` shows this slice's entry. |
| R33 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` — each exits 0. CI on Linux is the authority; if `format:check` fails on files this slice did not touch, read the diff rather than assuming the old `core.autocrlf` artifact (fixed in PR #328). |

**DB-reading script note (R21, R24, R25, R26).** Write a real `.ts` file inside the repo and run
`npx tsx path/to/script.ts`, then delete it. Do **not** use `npx tsx -e "<script>"`: on this Windows
setup a `-e` script that imports an installed package produces no stdout, no stderr and exit 0 —
indistinguishable from success (CLAUDE.md, Windows shell).

**Note on R21's stored instant.** `06:25Z` is the *correct* post-fix value for `07:25` on a BST
date. Campaign and discount rows written **before** this slice hold an instant one hour from what
was typed; correcting those by hand is explicitly out of scope (`plan.md`, Deliberately excluded) —
record in build-notes which rows were corrected.
