# P10 — Fulfilment configuration and checkout fixes (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing** — *Every feature.* Isolated business logic, utilities, components.
2. **Integration Testing** — *Every feature.* The component against its immediate dependencies.
3. **System / End-to-End Testing** — *Critical user journeys and validation testing.*
4. **Regression & Acceptance Testing** — *Before release, or when changing core flows.*
5. **Performance & Resilience Testing** — *Before release, or for performance-sensitive APIs.*
6. **Security & Accessibility Testing** — *Before release, or earlier for auth, payments, UI.*

---

## Before you start

**Run everything DB-touching under `npm run preview`, never `npm run dev`.** Plain `next dev` runs
in real Node, which cannot load `@prisma/client/wasm`'s query engine, so a DB-touching route
silently renders an error state with no crash and no obvious signal.

**Do not hardcode local vendor hostnames.** Which host resolves which vendor is a property of the
connected database's seed history, not a platform constant. Read the real values first:

```bash
# Connect with the same DATABASE_URL npm run preview uses.
npx tsx -e "1" >/dev/null 2>&1  # (trivial; real script below)
```

Write a short script under `scripts/` (not the repo root — a repo-root `.ts` is type-checked by
`next build` and a stray error there fails the whole preview build) that prints
`prisma.vendor.findMany()` and `prisma.vendorDomain.findMany()`, run it with `npx tsx`, and use the
`host` values it prints. On 2026-09-14 the dev database held `localhost:8787` (Aheed,
`offerCollection: true`) and `srimart.localhost` (SriMart, `offerCollection: false`) — **verify,
don't assume.**

**Two vendors matter here.** Aheed offers collection and SriMart does not, so a slot/express change
must be checked against both.

**Cookie handling for the multi-label host.** `curl -b jar -c jar` silently fails to persist a
`Secure` cookie for `srimart.localhost` (no error, empty jar, a fresh identity every request) while
working fine for `localhost:8787`. For SriMart, extract the value by hand and replay it:

```bash
curl -si -H "Host: srimart.localhost" http://127.0.0.1:8787/... \
  | grep -i "^set-cookie: <name>" | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]+);.*/\1/'
```

**Signing in as a store admin.** `demo-store-admin@example.com` is the vendor-ADMIN demo account
(`scripts/demo-accounts.ts`); its password is `DEMO_ACCOUNT_PASSWORD` in `.env`. Sign in against
Better Auth's real endpoint — `/api/auth/sign-in/email`, **not** `/sign-in` — and keep the session
cookie. Better Auth binds a session to the Host/Origin it was issued for, so obtain a separate
session per vendor host rather than replaying one across both.

**Driving the staff forms without a browser.** These are `useActionState`-bound forms, so the
rendered HTML carries `$ACTION_REF_<N>`, `$ACTION_<N>:0`, `$ACTION_<N>:1` and a per-render
`$ACTION_KEY` (re-read it from a fresh page fetch before each submit; it changes every render) —
not the single `$ACTION_ID_<hash>` a plain progressive-enhancement form carries. Submit with
`curl -F` supplying those four fields plus the action's own named fields.

**Grep hygiene.** Exclude `app/(admin)/staff/runbook/docs.ts` from every source grep — it is a
generated bundle that embeds this repository's own prose, including the strings being searched for.
When grepping rendered HTML, remember React escapes `&`, `<`, `>`, `"` and `'`.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/panel-refusal-coverage.test.ts` exits 0 (it walks `app/(admin)/` from the filesystem with no allowlist and fails a page that calls `requireVendorRole(` without rendering `<PanelRefusal>`, or returns `null` from an auth-conditioned branch). Then, under `npm run preview`, `curl -s -o /dev/null -w "%{http_code}\n" -H "Host: <aheed host>" http://127.0.0.1:8787/staff/fulfilment` with **no** session cookie returns a redirect to `/login`; with the `demo-customer@example.com` session it returns 200 and the body contains `Store admins only`. |
| R2  | E2E | Signed in as `demo-store-admin`, `curl -s -H "Host: <aheed host>" -H "Cookie: <session>" http://127.0.0.1:8787/staff/fulfilment > ful.html`, then `grep -c "Fulfilment settings" ful.html`, `grep -c "Weekly slots" ful.html` and `grep -c "Express windows" ful.html` each print at least 1. |
| R3  | Integration | Submit the settings form via `curl -F` with `offerDeliverySlots=on`, `expressCollectionEnabled=on`, `bookingWindowDays=21`, `slotHoldDurationMinutes=30`. Then query the row directly: a `scripts/`-hosted `tsx` script printing `prisma.vendorConfig.findFirst({ where: { vendorId } })` shows exactly those four values. Re-fetch `/staff/fulfilment` and confirm `value="21"` and `value="30"` appear in the rendered settings inputs. |
| R4  | Integration | Submit the add-slot form with `method=DELIVERY`, `dayOfWeek=2`, `startTime=09:00`, `endTime=11:00`, `capacity=8`. A `tsx` script printing `prisma.vendorFulfilmentSlot.findMany({ where: { vendorId } })` shows one new row with exactly those values. Submit that row's remove control; the same query shows the row gone and the other rows unchanged. |
| R5  | Integration | Submit the add-express-window form with `dayOfWeek=3`, `openTime=10:00`, `closeTime=16:00`. `prisma.vendorExpressSchedule.findMany({ where: { vendorId } })` shows one new row with those values. Submit its remove control; the row is gone and the others are unchanged. |
| R6  | Integration | For each of `startTime=9am`, `endTime=08:00` (with `startTime=09:00`), `endTime=09:00` (with `startTime=09:00`), `capacity=0`, `capacity=2.5`, `dayOfWeek=7`: submit and confirm the response body contains a field-level error message, **and** that `prisma.vendorFulfilmentSlot.count({ where: { vendorId } })` is unchanged from before the submission. Repeat the time cases for the express form with `openTime`/`closeTime`. |
| R7  | Integration | Submit the settings form with `bookingWindowDays=0`, then `=61`, then `=abc`; and `slotHoldDurationMinutes=0`, then `=121`, then `=abc`. Each returns a field-level error in the body, and `prisma.vendorConfig.findFirst(...)` still shows the values set in R3. |
| R8  | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0 (both walk `lib/repositories/` from the filesystem; neither has an allowlist). Additionally `grep -nE "getPrisma(Ws)?\(" lib/repositories/fulfilment-slots.ts` prints nothing outside a `ReturnType<typeof ...>` type position. |
| R9  | Unit | `grep -n -e ".updateMany(" -e ".createMany(" lib/repositories/fulfilment-slots.ts` — for every hit, read the enclosing function and confirm its client parameter is supplied by `getPrismaWs()` at the call site in `lib/fulfilment-slots-service.ts`. If the command prints nothing, the requirement is satisfied vacuously; record that explicitly rather than leaving the row blank. |
| R10 | Security | Signed in as `demo-store-admin` on the Aheed host, take a `VendorFulfilmentSlot` id belonging to **SriMart** (read it with a `tsx` script) and submit it to the remove action. The response carries an error, and `prisma.vendorFulfilmentSlot.count({ where: { vendorId: <srimart id> } })` is unchanged. Repeat for the express-window remove action. |
| R11 | Unit | `head -1 features/admin/fulfilment.ts` is exactly `"use server";`, and `grep -n -e "^export const" -e "^export let" -e "^export var" -e "^export class" -e "^export interface" -e "^export type" -e "^export enum" -e "^export {" features/admin/fulfilment.ts` prints nothing — every `export` in the file is `export async function`. Confirm the client component imports its initial state from the plain module instead. Note `lint`/`typecheck`/`test`/`build` all stay green on a violating file: the restriction is enforced at runtime only (#159). |
| R12 | Unit | `npx vitest run tests/staff-nav-parity.test.ts` exits 0, and `grep -c "/staff/fulfilment" components/staff/PanelNav.tsx "app/(admin)/staff/page.tsx"` prints a non-zero count for both files. `/staff/fulfilment` must **not** appear in the test's exclusion list. |
| R13 | Unit | `npx vitest run tests/operator-doc-coverage.test.ts` exits 0. Note this file's own test count grows by four per staff route, so the vitest baseline in `CLAUDE.md` moves on this slice with no test file edited — update it from a clean run. |
| R14 | Acceptance | Read the new guide section line by line; for each sentence describing something an operator can do, name the form, button or action import on `app/(admin)/staff/fulfilment/page.tsx` that performs it. No mechanical check exists for this — `#629`/`#634` were four documented capabilities that did not exist, all of which passed every test in the repository. |
| R15 | Integration | Against a database already carrying the seeded vendors, run `npm run db:seed`, then record per vendor: `prisma.vendorFulfilmentSlot.count({ where: { vendorId } })` split by `method`, `prisma.vendorExpressSchedule.count({ where: { vendorId } })`, and the two flags. Confirm Aheed (`offerCollection: true`) has both methods, at least one express window and both flags `true`; and SriMart (`offerCollection: false`) has `DELIVERY` slots only, zero express windows and `expressCollectionEnabled` still `false`. Run `npm run db:seed` a second time and confirm every count and flag is unchanged. **BLOCKED — do not run this row as written.** `npm run db:seed` exits 1 against ANY database, already-seeded included: `refreshProductImages` (called from `main` at line 75) throws `storage putObject failed: 403` one line before `upsertVendorSatellites` (line 76), which is what calls the new `seedFulfilmentSchedule`, so the seed code never executes. Record R15 as **blocked by `#755`** (rejected R2 credentials), tracked for re-verification by `#756` — not as a failure of this slice's code. |
| R15a | E2E | Fetch `/staff/fulfilment` on the **SriMart** host as that vendor's admin (`demo-srimart-admin@example.com`, the second vendor's store admin from `scripts/demo-accounts.ts`) and save the HTML. Either the express-window controls are absent, or the page carries a visible sentence naming collection as the prerequisite. A control rendered with no such explanation fails this row. |
| R16 | E2E | **Seed data is unavailable (see R15), so add a delivery slot through `/staff/fulfilment` itself first** — it is the real writer and needs no storage, and it is the better test regardless. Then, under `npm run preview`, as a signed-in customer on the Aheed host with at least one item in the cart, fetch `/checkout` and save it. With the fulfilment method `DELIVERY`, the saved HTML contains the slot picker's own `aria-label`/heading text (read the exact string from `components/checkout/SlotPicker.tsx` first — do not guess it, and do not grep the whole page for a generic word like "slot", which appears in unrelated markup). Post to the existing `setFulfilmentMethod` action to switch to `COLLECTION` and confirm the express option renders **only** while the current wall-clock time falls inside a seeded `VendorExpressSchedule` window; if it does not, widen one seeded window to cover now, re-check, then **restore the seeded value** rather than leaving the database altered. Repeat the delivery half on the SriMart host and confirm no collection option is offered there. |
| R17 | Unit | `grep -n "lookupPostcode" components/checkout/CheckoutForm.tsx` prints nothing. Then `grep -rn --exclude=docs.ts "postcodes-api" --include=*.ts --include=*.tsx app/ components/ features/ lib/` shows the import only from the server-action module and from `lib/postcodes-api.ts` itself. (`--exclude=docs.ts` drops the generated KMS bundle, which embeds this repository's own prose and would otherwise match.) |
| R18 | Security | `grep -n "connect-src" next.config.*` shows a directive that does not name `api.postcodes.io`. Then `curl -sI -H "Host: <aheed host>" http://127.0.0.1:8787/ > csp.txt` followed by `grep -i "^content-security-policy" csp.txt`, and confirm the value matches `git show origin/staging:next.config.ts` before this slice. |
| R19 | Unit | `grep -rn 'querySelector("form")' components/checkout/` prints nothing. Read the success path and confirm `city`/`county` are resolved from a reference to the address form (or ids unique to it), not from the document's first form. |
| R20 | E2E | Under `npm run preview` on the Aheed host, drive the lookup with a real postcode (e.g. `MK9 1AA`) through the server action and confirm the response supplies `admin_district`/`admin_county`, and that the rendered address form's `city`/`county` inputs receive them. Then repeat with `ZZ1 1ZZ`: the "Invalid postcode" message appears and neither input is populated. Because the fulfilment-method form renders **above** the address fields since `#748`, confirm specifically that the fulfilment form's own inputs were not written to. |
| R21 | Unit | `npx vitest run tests/postcodes-api.test.ts` passes with outbound access unavailable — verify by running it with network disabled, or by confirming the test file stubs `fetch` and contains no live hostname. A green run on a connected machine proves nothing here; that is exactly how `#751` reached the suite. |
| R22 | Unit | `grep -n 'rejected by storage' components/staff/VendorLogoUploader.tsx` shows a message interpolating the status (e.g. `${put.status}`), and `grep -n '(\\\\)' components/staff/VendorLogoUploader.tsx` prints nothing. |
| R23 | Unit | Read the `startTransition` body: the `fetch` to the presigned URL is inside a `try`/`catch` whose `catch` calls `setError`. Confirm by temporarily pointing the presigned URL at an unroutable host under `npm run preview` and observing a visible error message rather than a silent no-op. |
| R24 | Integration | `npx tsx scripts/verify-storage-credentials.ts` prints one line per environment naming that environment's bucket and whether its credentials were accepted, and exits non-zero while the credentials remain rejected. Confirm it is read-only: `grep -n -e "putObject" -e "deleteObject" -e "\"PUT\"" -e "\"DELETE\"" scripts/verify-storage-credentials.ts` prints nothing. Cross-check that nothing was created: the probed key must be one that does not exist, and a `HEAD` against a valid credential returns `404`. |
| R25 | Acceptance | `gh issue view <NN>` shows the rejected credential pair, the blast radius (every `getStorage()` S3 API caller — product images, bundle images, campaign banners and the AI campaign-image route, the vendor logo, `lib/product-image-pipeline.ts` — across `.env`, staging and production) and the rotation steps. `gh project item-list 2 --owner sriahead --format json --limit 600` includes it. |
| R26 | Regression | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and describes this slice (Gate 4). |
| R27 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0, and `npx vitest run` reports **no shortfall** against the current baseline. Read the file/test totals, not just the exit code: a forks-pool failure counts whole files as *unhandled errors* and can still exit 0. The pre-slice baseline is 128 files / 1632 tests; this slice adds test files and moves `tests/operator-doc-coverage.test.ts` by four, so establish the new total from a clean run with nothing else building, and update `CLAUDE.md`. Three live-DB files are `it.skipIf(!DATABASE_URL)`-guarded and report as skipped in CI — expected, not a discrepancy. `tests/repository-transaction-safety.test.ts` timing out at 5000ms under full-suite load is the known `#538` flake; confirm by re-running that file alone. |
