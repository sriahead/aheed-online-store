# Client Setup default forward-to inbox (build notes)

Spec commit `de070e6c`, build commit `c3121a26`, branch `feature/1399-default-forward-inbox` (cut
from `origin/staging` at `9cccba2f`). Issue `#1399`, board **In Progress**.

## What changed and why

- **`lib/config.ts`: `getInboundDefaultForward()`** plus the exported `InboundDefaultForward` union
  (`set` / `unset` / `invalid`). This is a standalone reader, not a zod object schema, placed right
  after `getInboundEmailEnv`. It trims and lower-cases, then validates with `z.string().email()`
  through `safeParse`, so it never throws (R1). It is deliberately outside `emailSchema` and
  `inboundEmailSchema` (R2): an invalid value inside `inboundEmailSchema` would have made
  `getInboundEmailEnv()` throw, and the resolve route would have returned 503 for every inbound
  message.
- **`lib/client-setup-service.ts`:** `EmailPlatformStatus` gains
  `defaultForward: InboundDefaultForward`, filled by `getEmailPlatformStatus()`. The page already
  receives `email.platform`, so no new service function or page fetch was needed.
- **`lib/client-setup/inbound-groups.ts`** (new, plain module): `groupAddressesByForwardTo(rows,
  defaultAddress | null)` returns `ForwardGroup[]` (`forwardTo`, `isDefault`, `addresses`). Groups
  are sorted by `forwardTo` and the addresses within each group by `address`, both with
  `localeCompare` (R7).
- **`components/staff/client-setup/EmailSetupForms.tsx`:** `AddInboundAddressForm` takes a
  required `defaultForward` prop. When it is `set`, the `forwardTo` input gets
  `defaultValue={address}`, `aria-describedby="forwardTo-hint"` and a hint line: "The platform
  default inbox. Change it if this store has its own mailbox." It stays `type="email" required`
  (R5). It imports only the **type** from `lib/config`, which is erased at compile time, so the
  client bundle never pulls in `@opennextjs/cloudflare`.
- **`app/(admin)/staff/platform/client-setup/page.tsx`:** the status card gets a
  `Default forward-to` row (`data-default-forward`): the address, "Not set", or a
  `<span role="alert">` reading "Invalid: check INBOUND_DEFAULT_FORWARD" (R6). The "Receiving
  addresses" list is now a nested list: the outer `<ul data-inbound-addresses>` holds one
  `<li data-forward-group="…">` per mailbox, headed "Forwards to X" with a "Platform default" pill
  (`bg-accent-tint`, an existing token) when `isDefault`. The inner list keeps each address's
  purpose and its Remove button (R8). The old inline `→ forwardTo` text moved into the group
  heading.
- **`wrangler.toml`:** `INBOUND_DEFAULT_FORWARD = "info-merqifyhub@googlegroups.com"` in
  `[env.staging.vars]` (with the full comment) and `[env.production.vars]` (which points to it) (R4).
- **Tests (4 new files):**
  - `tests/config-inbound-default-forward.test.ts`: R1 (5 cases) and R2.
  - `tests/client-setup-inbound-groups.test.ts`: R7, including a check that there is no
    `"use server"`.
  - `tests/client-setup-add-address-form.test.tsx`: R5, using jsdom and Testing Library, with the
    actions module mocked.
  - `tests/client-setup-shared-forward.test.ts`: R9. An in-memory Prisma double enforces unique
    `address` only; it saves two addresses with one `forwardTo` (one typed in mixed case) and still
    refuses a loop.
- **Docs:**
  - `env-setup.md`: a Keys row, plus a "The platform inbox (`#1399`)" paragraph pairing it with
    `INBOUND_FALLBACK_FORWARD` and saying it must be a verified destination (R11).
  - `platform-admin-guide.md`, Client Setup: the prefill, the grouping, the status row, plus two
    limitation bullets (the default is a Worker setting; change a forward-to by remove and re-add)
    (R12).
  - `CHANGELOG.md`: an `[Unreleased]` entry (R13).
- **Rode along (spec commit):** the `env-setup.md` correction to the Email Routing state on
  `merqify.com`, made at Orient on 2026-11-02. Email Routing was enabled that day; the
  "demo-account rules already exist" claim was false (`#1369`); and it adds a testing tip about a
  group owner not receiving their own post.

## Decisions taken during the build

- **The default rides on `EmailPlatformStatus`** instead of a separate prop chain or service
  function. It is platform-wide status, and that type is where the page already reads platform
  email facts.
- **A union, not `string | null`**, so the page can tell "invalid" apart from "unset" (R6 needs
  both texts).
- **The form receives the whole union.** Deriving `prefill` inside the component keeps the page
  free of form logic, and R5's test can pass the union straight in.
- **No `key` reset on the form.** After a successful add, React 19 resets an uncontrolled form
  to its `defaultValue`s, so the prefill should come back for the next address. This is untested;
  see Known-shaky areas.
- **Grouping is applied in the page**, not in `getEmailSectionData`. Doing it there would have
  changed `EmailSectionData.addresses`, which `toClientSetupFacts` counts for the guide.

## Deviations from the spec

None. The test files' names differ from the placeholders in `validation.md`. Only
`tests/config-inbound-default-forward.test.ts` was named exactly there; the others match the
descriptions ("the slice's component test file", and so on):
- R5: `tests/client-setup-add-address-form.test.tsx`
- R7: `tests/client-setup-inbound-groups.test.ts`
- R9: `tests/client-setup-shared-forward.test.ts`

## Known-shaky areas

- **The live checks (R6, R8) were NOT run in Build.** No `npm run preview` and no
  `npm run build` was run on this branch. Typecheck, lint, format, `kms:validate`,
  `kms:coverage` and the full `npx vitest run --maxWorkers=4` all passed (377 files, 5542 tests).
  - The page's grouped JSX and status row are covered by no automated test. Only the pure function
    and the form are tested.
  - Start Validate with `npm run build` (webpack) to confirm the client component's type-only
    import of `lib/config` does not bundle server code.
- **Form reset after a successful add.** Expected behaviour: the Forward to field returns to the
  default, and the address field clears. If React instead keeps the typed value, that is cosmetic,
  but worth one look during R8's live step.
- **`localeCompare` ordering** is locale-dependent for non-ASCII addresses. Stored addresses are
  lower-case ASCII in practice.
- **Staging's live value.** After deploy, staging's Client Setup should show
  `info-merqifyhub@googlegroups.com` in the status row. The inbound Worker's
  `INBOUND_FALLBACK_FORWARD` was set to the same address on 2026-11-02, by the owner running a
  script. **Production** `INBOUND_EMAIL_TOKEN` / `INBOUND_FALLBACK_FORWARD` are **not set yet**:
  an owner step, not this slice.

## Validation record (2026-11-02, in-session, NOT independent)

The owner chose to validate in the build context, on Opus rather than Sonnet, with no Clear in
between. Every row was checked against the artifact, not this file.

| Req | Result |
|---|---|
| R1, R2, R5, R7, R9, R10 | Pass. The slice tests exist, cover every case `validation.md` lists, and are green. |
| R3 | **Spec amended** (`54fd4f30`). The original grep matched `app/(admin)/staff/runbook/docs.ts`, the generated KMS bundle that embeds `env-setup.md`. The amended grep (`--exclude=docs.ts`) prints nothing, and `getInboundDefaultForward` has no fallback address. |
| R4, R11, R12, R13 | Pass, read from the files. |
| R6 | Pass, live under `npm run preview` (dev DB `ep-dry-morning`, signed in as `demo-platform-admin@example.com`). With `default-inbox@example.com`, the status row shows the address, and the input renders `value=…`, `required`, `aria-describedby` and the hint. With `"nope"`, the row reads "Invalid: check INBOUND_DEFAULT_FORWARD" in `role="alert"`, the input is empty, and there is no hint. |
| R8 | Pass, live. `a@` and `b@` forwarding to `default-inbox@` and `c@` forwarding to `other@` render as two `data-forward-group` blocks, and the default's block is labelled "Platform default". All three were removed with their Remove buttons, and "No receiving addresses yet." returned. |
| R14 | Local pass: lint, `format:check`, `tsc --noEmit`, `npx vitest run --maxWorkers=4` (377 files, 5542 tests), `kms:validate`, `kms:coverage`, and the webpack build ("Compiled successfully" under preview). **CI `gates` is still owed at Ship.** |

Observations, not defects:
- **Every DB write from local `workerd` took 25-60 s here, and two timed out.** `a@` returned a 500,
  but its row was written. `b@` reported "Adding the address failed", then saved on retry. The DB has
  no unique index on `forwardTo` (migration `20261101120000_vendor_inbound_address`). These are this
  machine's known slow Cloudflare and Neon links (`workerd` cannot be told to prefer IPv4), not the
  slice.
- **The dev demo roster is still `@example.com`** (staging and production use `@merqify.com`). Its
  password is the `.dev.vars` `DEMO_ACCOUNT_PASSWORD`, not the `.env` one.
- **The form-reset behaviour after a successful add was not exercised in a browser.** Posts went
  through the no-JS form path, which re-renders the page with the prefill.
