# P9.2 — Delivery areas admin & staff navigation reconciliation (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing** — *When needed:* Every feature. *Purpose:* Isolated business logic, utilities, components.
2. **Integration Testing** — *When needed:* Every feature. *Purpose:* The component with its immediate dependencies (database, external services).
3. **System / End-to-End Testing** — *When needed:* Critical user journeys and validation testing.
4. **Regression & Acceptance Testing** — *When needed:* Mainly before release, or when changing core flows.
5. **Performance & Resilience Testing** — *When needed:* Mainly before release, or for performance-sensitive APIs.
6. **Security & Accessibility Testing** — *When needed:* Mainly before release, or earlier for auth, payments or UI changes.

This slice touches **auth** (an ADMIN-gated panel page), the **database**, and the **checkout
refusal path**, so its security and live-integration rows are walked at Validate rather than
deferred to release.

---

## Before any live row: confirm which database you are pointed at

`npm run preview` reads `.dev.vars`, not `.env` (the Cloudflare request context wins). Two files
drifting into agreement on the **wrong** target is a documented failure here — at P5a's validation
both agreed and both pointed at production. Before running any row below marked **live**:

```bash
grep -E '^(DATABASE_URL|DIRECT_URL)=' .dev.vars .env
grep -E '^(DATABASE_URL|DIRECT_URL)=' secrets/staging.vars secrets/production.vars
```

Confirm the `.dev.vars` host is the **dev** Neon host and matches neither `secrets/production.vars`
nor `secrets/staging.vars`. A "staging-sounding" filename is not evidence; only the host is.

## Getting a signed-in admin session for the live rows

No browser extension is required. `/staff/delivery-areas`'s forms are `useActionState`-bound, so
they carry the four-field shape `CLAUDE.md` documents (`$ACTION_REF_<N>`, `$ACTION_<N>:0`,
`$ACTION_<N>:1`, `$ACTION_KEY`) rather than a single `$ACTION_ID_<hash>`. `$ACTION_KEY` is a
per-render nonce: re-fetch the page and re-read it before **each** submission rather than reusing
one across requests.

```bash
# Sign in as the seeded store admin and keep the session cookie.
curl -s -c cookies.txt -X POST http://127.0.0.1:8787/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:8787' \
  -d '{"email":"<seeded admin email>","password":"<seeded password>"}'

# Read the page and extract the current action fields for the form under test.
curl -s -b cookies.txt http://127.0.0.1:8787/staff/delivery-areas > page.html
grep -oE '\$ACTION_(REF_[0-9]+|[0-9]+:[01]|KEY)"[^>]*value="[^"]*"' page.html
```

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/delivery-area-form.test.ts` exits 0. Open `lib/delivery-area-form.ts` and confirm `parsePrefixInput` is exported and its return type is a discriminated union carrying either a prefix or an object naming the form control. |
| R2  | Unit | In `tests/delivery-area-form.test.ts`, assertions cover `"mk"`, `" Mk "` and `"MK"` each returning the success branch with value `"MK"`. `npx vitest run tests/delivery-area-form.test.ts` exits 0. |
| R3  | Unit | Same file asserts the failure branch for `""`, `"MKX"`, `"M1"`, and for each of the eleven metacharacters listed in R3, both alone and appended to `"MK"`. Count the cases: the test has at least 25 rejection assertions. `npx vitest run tests/delivery-area-form.test.ts` exits 0. |
| R4  | Unit | `grep -nE "^import" lib/delivery-area-form.ts` prints no line naming `@/lib/db`, `@prisma/client`, `next/headers`, `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`. Anchored to the `import` statement deliberately — the file's docstring names these modules to explain their absence, so an unanchored grep would match the rationale and the only way to "pass" would be deleting it. |
| R5  | Unit | `grep -nE "^export (async )?function" lib/repositories/delivery-areas.ts` lists a list, a create and a remove function. Read each signature: parameter 1 is the Prisma client, parameter 2 is `vendorId`, and remove's target parameter is an `id`. |
| R6  | Integration | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0. Then `git diff origin/staging -- tests/repository-purity.test.ts tests/repository-client-injection.test.ts` prints nothing, proving neither test was narrowed to accommodate the new file. |
| R7  | Unit | `grep -n "isUniqueViolation" lib/repositories/delivery-areas.ts` shows it imported from `@/lib/repositories/prisma-errors` and used in the create function's `catch`. `npx vitest run tests/delivery-areas-repository.test.ts` exits 0 with its duplicate-prefix case passing. |
| R8  | Unit | `npx vitest run tests/delivery-areas-repository.test.ts` exits 0 with its last-remaining-area case asserting a failure result and asserting the delete was never issued. |
| R9  | Integration | `grep -n "isolationLevel" -B 12 lib/repositories/delivery-areas.ts` shows the count and the delete inside one `prismaWs.$transaction(...)` whose options set `isolationLevel: "Serializable"`. |
| R10 | Security | `grep -nE "vendorId" lib/repositories/delivery-areas.ts` — read every `where` clause in the file and confirm each one constrains `vendorId`. Zero query bodies omit it. |
| R11 | Integration | `grep -nE "getPrisma\(\)\|getPrismaWs\(\)\|getCurrentVendorId" lib/delivery-areas-service.ts` shows both resolved inside the exported factory function body, not at module scope. The same grep against `lib/repositories/delivery-areas.ts` and `features/admin/delivery-areas.ts` prints no call expressions. |
| R12 | Integration | `head -1 features/admin/delivery-areas.ts` is `"use server";`. `grep -nE "^export " features/admin/delivery-areas.ts` shows only `export async function` lines — no `export const` or other value export. This restriction is runtime-only, so R23 is the row that actually proves it. |
| R13 | Security | `grep -n "requireVendorRole" features/admin/delivery-areas.ts` shows one call per exported action. Read each to confirm the refusal returns before any repository call. |
| R14 | Security | `grep -n "parsePrefixInput" features/admin/delivery-areas.ts` shows it called in the add action, and reading that function confirms the failure branch returns before any repository call. R26 proves it live. |
| R15 | Integration | `grep -n "revalidatePath" features/admin/delivery-areas.ts` shows both `revalidatePath("/staff/delivery-areas")` and `revalidatePath("/", "layout")` on each successful write path. |
| R16 | Security | `grep -n "PanelRefusal" "app/(admin)/staff/delivery-areas/page.tsx"` shows it rendered in the refusal branch, and `grep -n "return null;" "app/(admin)/staff/delivery-areas/page.tsx"` prints nothing. The trailing semicolon is deliberate: a backticked mention of the pattern in a docstring must not fail this row. |
| R17 | Security | `grep -n "redirect(\"/login\")" "app/(admin)/staff/delivery-areas/page.tsx"` shows it guarded by the 401 status branch. |
| R18 | E2E | **Live.** `curl -s -b cookies.txt http://127.0.0.1:8787/staff/delivery-areas` renders the seeded prefix (`MK` on Aheed), one add form, and one remove control per listed prefix. |
| R19 | Unit | `grep -oE '"/staff/[a-z-]+"' components/staff/PanelNav.tsx \| sort -u` includes `/staff/delivery-areas`, `/staff/brands`, `/staff/customers` and `/staff/payments`, and is a strict superset of the same command run against `git show origin/staging:components/staff/PanelNav.tsx`. |
| R20 | Unit | `grep -oE '"/staff/[a-z-]+"' "app/(admin)/staff/page.tsx" \| sort -u` includes `/staff/delivery-areas`, `/staff/bundles`, `/staff/promotions` and `/staff/storefront`, and is a strict superset of the same command run against `git show origin/staging:"app/(admin)/staff/page.tsx"`. |
| R21 | Unit | `npx vitest run tests/staff-nav-parity.test.ts` exits 0. Then temporarily delete one link from one surface only, re-run, and confirm the test **fails**; revert. A parity test that cannot fail is not a parity test. |
| R22 | Security | `grep -n "platform-admin" "app/(admin)/staff/page.tsx"` shows the `/staff/errors` link guarded by its own `auth.via === "platform-admin"` comparison, not by `isAdmin`. **Live:** the page fetched with a vendor-ADMIN session contains no `/staff/errors` link; fetched with a platform-admin session it does. |
| R23 | E2E | **Live.** With `LU9 4AB` stored via the header postcode form, confirm the header renders the not-deliverable state. Add prefix `LU` through the real add form (session cookie plus the four action fields re-read from a fresh page fetch). Reload any storefront page and confirm the header now renders the deliverable state. Passing this row also proves R12, since a value export in that file would make every action here 500. |
| R24 | E2E | **Live.** Before adding `LU`, drive a checkout with a `LU9 4AB` delivery postcode and confirm `features/checkout/place-order.ts` refuses it with its "we don't deliver" message. After adding `LU`, repeat and confirm the postcode check no longer refuses. This is the actual gate the slice exists to make editable; R23 is the cheaper signal, not a substitute. |
| R25 | E2E | **Live.** Submit `MK` (already present) through the add form. The response body contains a visible duplicate error and the status is not 500 — confirm with `curl -s -o body.html -w '%{http_code}'`. |
| R26 | E2E | **Live.** Submit `M[` through the add form. Response carries a visible field error; a fresh page fetch lists no new prefix; and the header still renders a correct deliverable state for `MK9 1AA` — proving no unusable prefix reached the regex `lib/delivery.ts` builds from stored values. |
| R27 | E2E | **Live.** Reduce the vendor to exactly one delivery area, then submit that row's remove control. Response carries a visible error and a re-fetch of the page still lists the prefix. Restore any rows removed during setup and confirm the final row set matches the seed. |
| R28 | Security | **Live.** Signed in on the Aheed host as its admin, submit the remove action with SriMart's delivery-area row `id` (read it from the dev database). Confirm SriMart's row count is unchanged. Host switching is neither needed nor possible — Better Auth rejects a spoofed `Host`; the guard under test lives in the query's `where`, so submitting cross-vendor from your own host exercises the same code path a real attack would. |
| R29 | Security | **Live.** Sign in as a seeded non-staff customer, request `/staff/delivery-areas`, and confirm the response body contains the refusal heading text rather than the portal shell wrapped around an empty main. |
| R30 | Regression | `git diff origin/staging -- prisma/schema.prisma` prints nothing and `git status --porcelain prisma/migrations/` shows no new directory. |
| R31 | Unit | Both `tests/delivery-area-form.test.ts` and `tests/delivery-areas-repository.test.ts` exist; `npx vitest run tests/delivery-area-form.test.ts tests/delivery-areas-repository.test.ts` exits 0. |
| R32 | Regression | `npx vitest run` **alone**, with no other build running and no orphaned `node.exe`/`workerd.exe` present, prints file and test totals equal to the numbers recorded in `CLAUDE.md`. A shortfall is a non-result to re-run, not a pass — check `Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'"` first, and re-run if any match this repo. |
| R33 | Regression | `git diff origin/staging -- CHANGELOG.md` shows this slice's entry referencing `#612`. |
| R34 | Regression | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` each exit 0. CI on Linux is the authority; a local-only pass is not sufficient if CI disagrees. |

## Note on the KMS docs pipeline

This slice adds spec files under `specs/`, which are assembled into MDX for the internal docs site
by a pipeline the `gates` workflow never runs. Before pushing, run:

```bash
npm run kms:validate
npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)
```

Read the second command's real exit status — piping it through `tail` reports the pipe's success,
not the build's. `npm run kms:validate` catches the front-matter `id` regex (no dots) and the
300-character `summary` cap; the assemble-and-build catches a bare `<` before a digit and a bare
`{...}` in prose.
