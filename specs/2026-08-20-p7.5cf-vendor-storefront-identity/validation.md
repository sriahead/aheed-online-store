# P7.5c+f — Per-vendor storefront identity (validation)

> **Before you start — three preflight steps. Several rows below are meaningless without their
> output. Do not skip them.**
>
> **P1. Confirm which database you are pointed at.** Per `CLAUDE.md`, check `.env` **and**
> `.dev.vars` against `secrets/staging.vars` and `secrets/production.vars` — two files agreeing is
> not evidence they are right. Print hosts only, never whole lines (`DATABASE_URL` ends in
> `BASE_URL`, so an unanchored grep prints the password):
> `grep -E '^(DATABASE_URL|DIRECT_URL)=' .env | sed -E 's|^([A-Z_]+)=.*@([^/.]+)\..*|\1 -> \2|'`
> The dev branch host at the time of writing is `ep-curly-wave-za9h66wr`; staging is
> `ep-empty-scene-zafjzeye`; production is `ep-young-glitter-zadlkttm`. **If the host matches
> staging or production, stop** — this slice runs a migration that creates a table.
>
> **P2. Establish which hosts resolve to which vendor in *this* database.** Do not assume
> `srimart-staging.nocaped.com` is seeded here: `prisma/seed.ts` only creates SriMart when both
> `SEED_AHEED_HOST` and `SEED_SRIMART_HOST` are set, and neither is set in `.env` today, so the dev
> branch carries whatever rows it inherited. Write a real file `scripts/list-vendor-domains.ts`
> printing every `VendorDomain.host` with its vendor slug, and run
> `npx tsx scripts/list-vendor-domains.ts`. **Do not use `npx tsx -e`** — per `CLAUDE.md` it exits 0
> with no output on this Windows setup as soon as the script imports `@prisma/client`. Record both
> hosts; every `Host:` header below means *the host this step printed*. If no SriMart host exists,
> seed one before continuing rather than declaring the two-vendor rows unverifiable. Delete the
> scratch script afterwards.
>
> **P3. Start `npm run preview` and record the port it prints** (usually `8787`). Every `curl` below
> assumes `http://127.0.0.1:<port>`. **`npm run dev` is not a substitute** — it cannot load
> `@prisma/client/wasm`, so every DB-backed page renders a silent error state that looks like a
> failing requirement.
>
> When finished, stop preview properly: the `npm` kill leaves orphaned `wrangler`/`workerd` children
> holding `.open-next\assets`. Find them with
> `Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'" | Select ProcessId,CommandLine`,
> match on this repo's path, and `taskkill /F /PID <each>`.
>
> **Reading the commands below.** Inside a GFM table cell a `|` must be written `\|`. Every `\|` in
> the rows below is that markdown escape, not part of the command — read it as a plain `|`, whether
> it is a shell pipe or regex alternation. Copying a cell verbatim into a shell will not work.
> Any file a row tells you to write goes in a scratch directory **outside the repo**: an untracked
> file left in the working tree fails `npm run sdd:preclear`'s clean-tree check later.

| Req | How to verify |
|-----|---------------|
| R1  | `git diff origin/staging -- prisma/schema.prisma` shows `bannerNote String?` and `heroSubtitle String?` added under `model VendorConfig`, and no added line under `model VendorBranding`. |
| R2  | In the same diff, `model VendorPromotion` declares every field named in R2 with the stated types, a `vendor` relation carrying `onDelete: Cascade`, and `@@index([vendorId, isActive, sortOrder])`. `grep -n 'Json' prisma/schema.prisma` shows no new match. |
| R3  | `ls prisma/migrations` shows one new directory versus `git ls-tree origin/staging prisma/migrations`. In its `migration.sql`: a `CREATE TABLE "VendorPromotion"`, a `CREATE INDEX`, and two `ALTER TABLE "VendorConfig" ADD COLUMN`. Restricted to lines beginning `ALTER TABLE`, `grep -icE '\b(DROP\|NOT NULL\|UPDATE)\b'` returns `0`. |
| R4  | Apply with `npx prisma migrate deploy`, confirm `npx prisma migrate status` reports nothing pending, then run the R4 command and check `echo $?` is `0` (`2` means drift, and is a failure). Both read `.env` — plain Node context, no Cloudflare request context — which P1 confirmed points at dev. |
| R5  | `grep -n 'bannerNote\|heroSubtitle' prisma/seed.ts` shows both set in `AHEED_SATELLITES` and `SRIMART_SATELLITES`. Read the four values: Aheed's may name halal/grocery, SriMart's must name neither, and neither may name the other's trade. |
| R6  | `grep -n 'vendorPromotion' prisma/seed.ts` shows creates for both vendors. Run the seed twice (`npm run db:seed` or the documented seed command), then query `SELECT "vendorId", count(*) FROM "VendorPromotion" GROUP BY 1` — each vendor has the same count after the second run as after the first, at least 2, all rows `isActive = true` with `imageKey IS NULL` and `linkUrl` starting `/`. |
| R7  | `grep -n 'bannerNote\|heroSubtitle' lib/repositories/vendor.ts` shows both in the `VendorProfile` interface typed `string \| null`, in `fetchVendorProfile`'s `select`, and in its return object with `?? null`. |
| R8  | Read `lib/repositories/promotions.ts`: `listActivePromotions` takes the Prisma client and `vendorId` as parameters, and its `where` contains both `vendorId` and `isActive: true`, with `orderBy: { sortOrder: "asc" }`. |
| R9  | `grep -nE 'getCurrentVendorId\|getCurrentVendorIdOrNull\|headers\(\|getAuth\(' lib/repositories/promotions.ts` returns no match. `test -f lib/promotions-service.ts` succeeds and that file exports the request-scoped accessor. |
| R10 | `npm test -- tests/repository-vendor-scoping.test.ts` passes. `git diff origin/staging -- tests/repository-vendor-scoping.test.ts` shows no new name added to the allowlist (an unchanged file is the expected result). |
| R11 | Read the second banner element in `components/layout/Header.tsx`: guarded on `profile?.bannerNote`, child expression is that value. Then set that vendor's `bannerNote` to `NULL` in the dev DB, `curl -s -H "Host: <that host>" http://127.0.0.1:<port>/`, confirm the element is absent from the HTML, and restore the value. |
| R12 | Read the header's first banner line: the only interpolations are `name` and `localityName`. Then `curl -s -H "Host: <SriMart host>" http://127.0.0.1:<port>/ \| grep -io 'local grocery'` returns nothing. |
| R13 | Read the hero paragraph in `app/(storefront)/page.tsx`: guarded on `profile?.heroSubtitle`, child expression is that value. `curl` `/` for both hosts; each shows its own seeded subtitle. |
| R14 | Read the hero badge block: at most two badges, the first guarded on `freeDeliveryThresholdPence !== null`, the second on `minimumOrderPence > 0`, both amounts through `formatPrice`. `grep -nE '£[0-9]' 'app/(storefront)/page.tsx'` returns no match. |
| R15 | `curl -s -H "Host: <Aheed host>" http://127.0.0.1:<port>/ \| grep -o '£[0-9.]*' \| sort -u` includes `£30.00` and `£15.00` and excludes `£50.00`/`£10.00`; the same with SriMart's host includes `£50.00` and `£10.00` and excludes `£30.00`/`£15.00`. (Seeded values are Aheed 3000/1500, SriMart 5000/1000 — re-read `prisma/seed.ts` rather than trusting these if the seed changed.) |
| R16 | Read the trust strip in `app/(storefront)/page.tsx`: exactly three tiles, one interpolating `localityName`. Confirm the two capability claims are real: `grep -n 'stripe' lib/payments.ts` matches, and `grep -n 'sendOrderStatusEmail\|sendOrderConfirmationEmail' lib/email.ts` matches. |
| R17 | `curl -s -H "Host: <SriMart host>" http://127.0.0.1:<port>/ > "$TMP/srimart.html"` (any scratch dir outside the repo), then `grep -icE 'halal\|grocer\|fresh produce\|meat\|spice\|lentil\|cultural staple' "$TMP/srimart.html"` returns `0`. If non-zero, print the matching lines: a match inside a SriMart **product name** is a seed-data problem to report, not a pass. |
| R18 | `test ! -e components/layout/PromoSlider.tsx` succeeds. `grep -rn 'PromoSlider' app/ components/ features/` returns no match. |
| R19 | Read the hero in `app/(storefront)/page.tsx`: it renders the carousel from the promotions accessor. Then `curl` `/` for one host and confirm the seeded promo titles appear **in ascending `sortOrder`** — compare the order in the HTML against `SELECT title, "sortOrder" FROM "VendorPromotion" WHERE "vendorId" = ... ORDER BY "sortOrder"`. Set one row `isActive = false`, re-fetch, confirm it disappears and the others remain; restore it. |
| R20 | With all rows `imageKey IS NULL` (R6), the fetched carousel markup contains each promo's title and description and no `<img`. Then set one row's `imageKey` to an existing object key — take it from a `ProductImage.storageKey` row so the object genuinely exists — and its `altText` to a known string; re-fetch and confirm an `<img>` whose `src` is `${CDN_BASE_URL}/<that key>` and whose `alt` is that string. Revert both to `NULL`. `grep -nE 'https?://' 'app/(storefront)/page.tsx' <carousel component>` returns no image URL. |
| R21 | Set every promotion row for one vendor to `isActive = false`. `curl -s -o /dev/null -w '%{http_code}'` for that host returns `200`, and the fetched body contains neither the carousel's container class nor any promo title. Restore the rows. |
| R22 | Read the carousel component. Either it contains no `setInterval`/`setTimeout` rotation, **or** it renders a `<button>` toggling rotation with a non-empty accessible name. If a pause control exists, load `/` in a real browser (the `mcp__claude-in-chrome__*` tools or by hand), click it, and confirm rotation stops and the button's label changes. `npm run lint` exiting 0 is necessary but not sufficient here — no lint rule checks SC 2.2.2. |
| R23 | `curl` `/` for each host; each body contains that vendor's seeded promo titles and none of the other's. Take the expected titles from `prisma/seed.ts`, not from memory. |
| R24 | `test -f lib/color-contrast.ts` succeeds; `grep -c '^import' lib/color-contrast.ts` returns `0`; `grep -n 'export function contrastRatio\|export function clampForContrast' lib/color-contrast.ts` matches both. |
| R25 | `npm test -- tests/color-contrast.test.ts` passes, including a case asserting every returned value matches `/^#[0-9a-f]{6}$/` and a case asserting `clampForContrast("#2e7d32", ["#ffffff"], 4.5) === "#2e7d32"`. |
| R26 | In the same run, a table-driven case asserts `contrastRatio(clampForContrast(c, ["#ffffff"], 4.5), "#ffffff") >= 4.5` for `c` in `#1e88e5`, `#4caf50`, `#f57c00`, `#d32f2f`. |
| R27 | In the same run, a case asserts for each of those four that the result differs from the input and `Math.abs(hue(result) - hue(input)) <= 2` in OKLCH degrees, wrapping at 360. |
| R28 | In the same run, `clampForContrast("#ffffff", ["#ffffff"], 4.5)` returns within the test timeout and its result meets 4.5:1 against white. A hang, or a returned `#ffffff`, is a failure. |
| R29 | `npm test -- tests/vendor-theme.test.ts` passes a case asserting `Object.keys(brandStyle(AHEED_PRIMITIVES))` contains all six of `--color-action`, `--color-accent`, `--color-danger`, `--color-action-hover`, `--color-accent-hover`, `--color-primary`, plus the eight `--color-brand-*`, `--color-surface-muted` and the three tints. |
| R30 | In the same file, for both vendors' primitive sets: each of the three base colours meets 4.5:1 against `#ffffff`; each hover has strictly lower OKLCH lightness than its base and also meets 4.5:1. |
| R31 | In the same file, `brandStyle(AHEED_PRIMITIVES)["--color-action"] !== "#4caf50"` and `brandStyle(SRIMART_PRIMITIVES)["--color-action"] !== "#1e88e5"`. |
| R32 | In the same file, for both vendors `--color-primary` meets 4.5:1 against `#ffffff` and against that vendor's `cream`, `green-tint`, `orange-tint` and `red-tint`. |
| R33 | `curl -s -H "Host: <SriMart host>" http://127.0.0.1:<port>/ \| grep -o '\-\-color-action:[^;"]*'` prints a value that is not `#1e88e5`; the same with Aheed's host prints a value that is not `#4caf50`. **Record both actual values** — this is the row that would have caught #251's defect, so read the numbers rather than the exit code. |
| R34 | `grep -n 'clamp\|derived' specs/decisions/ADR-004-multi-tenancy.md` matches within decision 5, and that decision no longer asserts the semantic layer stays unchanged. `grep -n '^version:' …` shows a value above `1.4.0`. |
| R35 | Read the "do not restore the brand hex" paragraph in `specs/design-system.md`: it names both the still-forbidden raw hex and the permitted `clampForContrast`-derived value. `grep -n '^version:' …` shows a value above `1.7.1`. |
| R36 | Read `lib/vendor-theme.ts`'s doc comment: it lists the tokens now re-declared, states each is clamped, and still explains why an inline style outranks a `:root` rule. The old claim that the three base colours are *not* re-declared is gone. |
| R37 | `grep -n 'PR #275' specs/roadmap.md` matches a change-log row. `npm run sdd:audit` prints no line containing `row pending carry-forward`. A `skipped` line for the promotion half (when `gh` is unavailable) is **not** a pass — re-run with `gh` authenticated. |
| R38 | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice under `[Unreleased]`. |
| R39 | `npm run lint`, `npm run typecheck`, `npm test` and `npm run format:check` each exit 0. If `format:check` fails on files this slice never touched, confirm the `core.autocrlf` artifact the documented way — write a committed blob out with LF (`git show HEAD:<file>`) and re-check **with `--config .prettierrc.json` explicitly**, from a directory prettier can resolve config from. CI on Linux is the authority. |

<!--
  Note for whoever runs this: rows R11, R19, R20, R21 and R33 all mutate dev-DB rows temporarily.
  Each says to restore what it changed. Restore before moving on rather than at the end — an
  un-restored isActive=false will silently make a later row look like a pass.
-->
