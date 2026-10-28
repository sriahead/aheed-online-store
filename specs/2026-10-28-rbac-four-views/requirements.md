# RBAC four views (requirements / acceptance criteria)

This slice is issue `#1319`. It builds on the existing RBAC in `lib/auth-rbac.ts`: `User.role`
(platform) plus `VendorMembership.role` (per store), with the store resolved from the host. It adds:

- a server-side role landing after sign-in;
- `demo-admin` demoted to store admin, and a new `demo-platform-admin`;
- a `/staff/platform` home;
- an AST test pinning every staff page, admin route and staff server action to a gate;
- a live four-role walk.

There is no schema change and no new authentication system. `plan.md` holds the reasoning.

**Terms used below:**
- A **gate** is a call expression whose callee identifier is `requireVendorRole`,
  `requirePlatformAdmin` or `requireRole`.
- **Platform refusal** is a 200 response whose body contains `Platform admin only` and none of the
  page's own content markers.
- **Staff refusal** is a 200 response whose body contains `Staff only`.
- **Admin refusal** is a 200 response whose body contains `Admin only`.

## Role landing

R1. `lib/auth-landing.ts` exists. It exports `safeNextPath(raw: string | null | undefined): string | null`.
    The function returns `raw` unchanged only when all of the following hold, and returns `null`
    otherwise:
    - `raw` is a string starting with `/`;
    - its second character is neither `/` nor `\`;
    - it contains no character with a code below 32 and none equal to 127.
R2. `lib/auth-landing.ts` exports `landingPath(access: "platform-admin" | "store" | "shopper", next?: string | null): string`.
    - It returns `safeNextPath(next)` when that is non-null.
    - Otherwise it returns `/staff/platform`, `/staff` or `/account` respectively.
R3. `lib/auth-landing.ts` imports nothing: no `react`, `next`, database, config or other module. It
    contains no `fetch(`.
R4. `tests/auth-landing.test.ts` asserts:
    - each of the three default destinations;
    - that a safe `next` (`/checkout?step=2`) wins for all three access values;
    - that each of `//evil.example`, `/\evil.example`, `https://evil.example`, `evil`, the empty
      string, `null`, `undefined` and `/a` followed by a newline and `b` returns `null` from
      `safeNextPath` and falls back to the default in `landingPath`.
R5. `app/(storefront)/signed-in/route.ts` exists, exporting `GET`, with
    `export const dynamic = "force-dynamic"`. It calls `requireVendorRole("STAFF", "ADMIN")` and always
    ends in `redirect(...)`:
    - to `/login` on a 401;
    - otherwise to `landingPath(access, next)`, where `next` is the request's `next` search
      parameter and `access` is:
      - `"platform-admin"` when `ok` with `via === "platform-admin"`;
      - `"store"` when `ok` with `via` of `"STAFF"` or `"ADMIN"`;
      - `"shopper"` on a 403.

    *Amended at Build:* this was a `page.tsx`. `tests/page-container.test.ts` requires every page to
    render a `PageContainer`, and this one only redirects, so it is a route handler. A `redirect()`
    from a route handler answers 307 exactly as a page's does, so the behaviour is unchanged.
R6. The success path of `features/auth/components/LoginForm.tsx` calls `router.push` with
    `/signed-in`, or `/signed-in?next=<encodeURIComponent(next)>` when its new optional `next` prop is
    a non-empty string. Its source no longer contains `router.push("/account")`.
R7. `features/auth/components/GoogleSignInButton.tsx` passes `callbackURL` `/signed-in`, with the same
    `?next=` rule as R6 from a new optional `next` prop. Its source no longer contains
    `callbackURL: "/account"`.
R8. `app/(storefront)/login/page.tsx` reads the `next` search parameter. When it is a string, the page
    passes it as the `next` prop to both `LoginForm` and `GoogleSignInButton`. No other caller of
    either component changes.

## Demo accounts

R9. In `DEMO_ACCOUNTS` (`scripts/demo-accounts.ts`):
    - `demo-admin@example.com` has `platformRole: "CUSTOMER"` and `vendorRole: "ADMIN"`;
    - an entry `demo-platform-admin@example.com`, named `Demo Platform Admin`, has
      `platformRole: "ADMIN"` and no `vendorRole`;
    - the other four entries (`demo-staff`, `demo-customer`, `demo-store-admin`,
      `demo-srimart-admin`) are unchanged;
    - the roster has 6 entries;
    - exactly one entry has `platformRole: "ADMIN"`.
R10. `tests/demo-accounts.test.ts` asserts R9's roster facts. It also asserts that `addDemoAccounts`,
    run against a fake whose `demo-admin` user already exists:
    - calls `user.update` for `demo-admin@example.com` with `role: "CUSTOMER"`;
    - calls `vendorMembership.upsert` for it with role `ADMIN`.
R11. The roster's doc comment in `scripts/demo-accounts.ts` names `demo-platform-admin` as the only
    platform admin and `demo-admin` as a store admin. `docs/developer-portal/env-setup.md`'s
    demo-account list names `demo-platform-admin@example.com` as platform ADMIN and
    `demo-admin@example.com` as store (vendor) ADMIN only. It states that every demo account uses
    `DEMO_ACCOUNT_PASSWORD`, with no password value written anywhere.
R12. No password value is added by this slice. In
    `git diff origin/staging -- scripts/demo-accounts.ts docs/ specs/2026-10-28-rbac-four-views/`, no
    added line contains `DEMO_ACCOUNT_PASSWORD=` followed by a non-empty value, or `password:`
    followed by a quoted string literal.

## Platform home

R13. `app/(admin)/staff/platform/page.tsx` exists and gates like its siblings:
    - it calls `requireVendorRole("ADMIN")` and redirects to `/login` on a 401;
    - it renders `PanelRefusal` titled `Platform admin only` when `!auth.ok` or when
      `auth.via !== "platform-admin"`;
    - otherwise it renders inside `PageContainer width="wide"` an element carrying
      `data-platform-home`, with:
      - one `data-platform-metric` element for each of the seven `PlatformOverviewMetrics` fields
        from `fetchPlatformOverviewMetrics()`;
      - one `data-platform-link` link for each `PLATFORM_NAV_ITEMS` entry other than
        `/staff/platform` itself.
R14. `PLATFORM_NAV_ITEMS`' first entry is `{ href: "/staff/platform", label: "Platform overview", … }`,
    using an icon name that exists in the icon registry. The other seven entries keep their order.
R15. `isRouteActive` in `components/staff/PanelNav.tsx` returns `pathname === href` for
    `href === "/staff/platform"`, as it already does for `/staff`. A test asserts that
    `/staff/platform/costs` does not make `/staff/platform` active and does make
    `/staff/platform/costs` active.
R16. `docs/platform-admin-guide/platform-admin-guide.md` has a section headed with
    `` `/staff/platform` `` that satisfies `tests/operator-doc-coverage.test.ts`. The guide also has
    one paragraph stating where each role lands after sign-in:
    - platform admin to `/staff/platform`;
    - store admin or staff of the current store to `/staff`;
    - anyone else to `/account`;
    - a safe `next` wins.

    Its `version` front-matter is bumped.

## Gate matrix

R17. `tests/rbac-gate-matrix.test.ts` exists and works on the TypeScript AST (`typescript`'s
    `createSourceFile`, with `ScriptKind.TSX` for `.tsx`), never on substring matches. It discovers
    files by walking the filesystem. It has no exemption or skip list, and it asserts:
    - **(a)** in every `page.tsx` under `app/(admin)/staff/` (any depth), the default-exported
      function is gated;
    - **(b)** in every `route.ts` under `app/(admin)/` and `app/api/admin/` (any depth), every
      exported function named `GET`, `POST`, `PUT`, `PATCH` or `DELETE` is gated;
    - **(c)** in every file whose first statement is the directive `"use server"`, under
      `app/(admin)/` or `features/admin/`, plus `features/orders/advance-status.ts`,
      `features/orders/advance-status-bulk.ts` and `features/orders/cancel-order-staff.ts`, every
      exported async function is gated;
    - **(d)** every file matched by (a), (b) or (c) whose path is under `app/(admin)/staff/platform/`
      or `app/(admin)/staff/errors/` either calls `requirePlatformAdmin`, or contains a binary
      `!==` expression with the string literal `"platform-admin"` as one operand and a property
      access named `via` as the other.
R18. **"Gated" in R17(a), R17(b) and R17(c)** means that the function's body contains a gate call, or calls
    either of the following, followed exactly one hop:
    - a function declared in the same file whose body contains a gate call;
    - an identifier named-imported from an `@/…` or relative module, where the function of that name
      (its original name, for `import { a as b }`) in the resolved `.ts`/`.tsx` source has a body that
      contains a gate call.

    *Amended at Build:* the spec first said "that module's source contains a gate call". R21's first
    mutation (deleting the team page's gate) still passed under that rule, because the page calls
    `getVendorTeam` from `lib/roles-service.ts`, and only that module's sibling `setVendorRole` gates.
    The check is now per function. That is stricter, and all four R21 mutations fail under it.
R19. `tests/rbac-gate-matrix.test.ts` asserts minimum discovered counts, so a broken walker cannot
    pass on zero files:
    - at least 30 pages under R17(a);
    - at least 9 route files under R17(b);
    - at least 25 server-action modules under R17(c);
    - at least 8 platform-only files under R17(d).
R20. Every R17 assertion passes on the shipped tree. Where it found a real ungated export, the slice
    fixes the code with a gate (not the test), and `build-notes.md` names each such file.
R21. **Mutation proof.** Each of the following temporary single edits makes
    `npx vitest run tests/rbac-gate-matrix.test.ts` fail, and restoring the line makes it pass:
    - deleting the `requireVendorRole(` call line in `app/(admin)/staff/team/page.tsx`;
    - changing `requireVendorRole` to `getCurrentVendorId` in
      `app/api/admin/category-images/deactivate/route.ts`;
    - deleting the gate line in `features/admin/faqs.ts`'s first exported action;
    - deleting the `auth.via !== "platform-admin"` comparison in
      `app/(admin)/staff/platform/costs/export/route.ts`.

## Live walk (preview, then staging)

R22. Under `npm run preview`, after `npm run demo:accounts -- add` against the dev database
    (`DIRECT_URL` host checked first, per `CLAUDE.md`):
    - **Each account signs in** through `POST /api/auth/sign-in/email` at `localhost:8787`, then
      `GET /signed-in` answers 307 with this `Location`:

      | Account | `Location` |
      |---|---|
      | `demo-customer` | `/account` |
      | `demo-staff` | `/staff` |
      | `demo-admin` | `/staff` |
      | `demo-store-admin` | `/staff` |
      | `demo-platform-admin` | `/staff/platform` |

    - **`next`:** `GET /signed-in?next=%2Fcheckout` answers `/checkout` for `demo-admin`, and
      `GET /signed-in?next=%2F%2Fevil.example` answers `/staff` for `demo-admin`.
    - **Signed out:** `GET /signed-in` answers 307 to `/login`.
R23. Under the same preview, with each account's cookie:

    | Account | Request | Expected result |
    |---|---|---|
    | `demo-customer` | `/staff` | Staff refusal |
    | `demo-customer` | `GET /api/admin/category-images/assets` | 403 |
    | `demo-staff` | `/staff` | 200 without refusal |
    | `demo-staff` | `/staff/team` | Admin refusal |
    | `demo-staff` | `/staff/platform` | Platform refusal |
    | `demo-staff` | `POST /api/admin/category-images/deactivate`, body `{}` | 403 |
    | `demo-admin` | `/staff/team` | 200 without refusal |
    | `demo-admin` | `/staff/platform`, `/staff/platform/vendors`, `/staff/platform/costs`, `/staff/errors` | Platform refusal on each, and zero `data-platform-home` |
    | `demo-admin` | `/staff/platform/costs/export?section=models` | 403 |
    | `demo-admin` | `/dev` | 200 containing `Administrators only` |
    | `demo-platform-admin` | `/staff/platform` | 200 with `data-platform-home`, 7 `data-platform-metric` and 7 `data-platform-link` |
    | `demo-platform-admin` | each of those 7 link targets | 200 without `Platform admin only` |
    | `demo-platform-admin` | `/dev` | 200 without `Administrators only` |

R24. **Cross-store isolation**, under the same preview, using the SriMart host method in
    `docs/developer-portal/local-dev-playbook.md`:
    - `Host` and `Origin` set to `srimart.localhost:8787`, with `x-forwarded-proto: http` on every
      request;
    - `demo-admin` signs in on SriMart's host;
    - `GET /staff` is a staff refusal;
    - `GET /api/admin/category-images/assets` is 403;
    - `GET /signed-in` answers `/account`.

    On the same host, `demo-platform-admin` gets `/staff` with 200 and no refusal.
R25. After `deploy-staging`, and after the owner has run `npm run demo:accounts -- add` against
    staging:
    - on `https://staging.aheedfoodcentre.nocaped.com`, `demo-admin`'s `/signed-in` answers `/staff`,
      and its `/staff/platform` is a platform refusal;
    - `demo-platform-admin`'s `/signed-in` answers `/staff/platform`, and its `/staff/platform` has
      `data-platform-home`;
    - signed out, `/staff/platform` answers 307 to `/login`.

## Boundaries

R26. **No schema change:** `git diff origin/staging --stat -- prisma/` prints nothing.
R27. **No second auth system:** in `git diff origin/staging`, no added line imports from
    `better-auth` (any subpath), and `lib/auth.ts` and `lib/auth-rbac.ts` are unchanged.
R28. `CHANGELOG.md` has an `[Unreleased]` entry naming `#1319` (Gate 4).
R29. The following all exit 0:
    - `npm run lint`, `npm run format:check`, `npx tsc --noEmit`;
    - `npx vitest run --maxWorkers=4`;
    - `npm run build`;
    - `npm run kms:validate` and `npm run kms:check-generated`;
    - `npm run kms:assemble:internal`, followed by `npx next build --webpack` in `kms/site-internal`.
