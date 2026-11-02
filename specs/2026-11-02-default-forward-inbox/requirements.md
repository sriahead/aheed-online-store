# Client Setup default forward-to inbox (requirements / acceptance criteria)

Closes `#1399`, a follow-up to `#1217`
(`specs/2026-11-01-cloudflare-email-service/`). In Client Setup (`/staff/platform/client-setup`,
platform admins only), the receiving-address form's **Forward to** field is prefilled from a
platform config value, `INBOUND_DEFAULT_FORWARD`. The address list groups each store's receiving
addresses by the mailbox they forward to. No schema change. Read `plan.md` for the reasoning and
the exclusions.

Terms used below:
- **"The default"** is the result of `getInboundDefaultForward()` (R1).
- **"The page"** is `/staff/platform/client-setup` with a store selected and its Email section
  shown.

## Config

R1. `lib/config.ts` exports `getInboundDefaultForward()`. It returns
    `{ status: "set", address: string } | { status: "unset" } | { status: "invalid" }`, from
    `INBOUND_DEFAULT_FORWARD` read through the module's existing env reader (Cloudflare context
    first, then `process.env`):
    - unset, or blank after trimming, gives `{ status: "unset" }`;
    - a valid email address gives `{ status: "set", address }`, trimmed and lower-cased;
    - any other value gives `{ status: "invalid" }`.

    It never throws. A unit test covers all three cases, plus surrounding whitespace and mixed
    case (`"  Info-Hub@Example.COM "` gives `address: "info-hub@example.com"`).

R2. `INBOUND_DEFAULT_FORWARD` is not read by `emailSchema`/`getEmailEnv` or by
    `inboundEmailSchema`/`getInboundEmailEnv`. A unit test sets it to an invalid value and asserts
    that `getEmailEnv()` and `getInboundEmailEnv()` return the same result as with it unset (no
    throw introduced).

R3. `lib/config.ts` contains no fallback address for it. The command
    `grep -rn "merqifyhub" lib app components features workers scripts` prints nothing.

R4. `wrangler.toml` sets `INBOUND_DEFAULT_FORWARD = "info-merqifyhub@googlegroups.com"` in both
    `[env.staging.vars]` and `[env.production.vars]`, each with a `#1399` comment.

## Client Setup page

R5. `AddInboundAddressForm` (`components/staff/client-setup/EmailSetupForms.tsx`) accepts the
    default as a prop:
    - when the default's status is `set`, the `forwardTo` input renders with `defaultValue` equal
      to the address, and one helper line says it is the platform default and can be changed;
    - otherwise the input renders empty, with no helper line.

    In both cases the input keeps `type="email"` and `required`. A component test (Testing
    Library, as the repo's other component tests do) covers both cases.

R6. The page passes the default to `AddInboundAddressForm`. The "Sending status (this
    environment)" card shows a row labelled **Default forward-to**, whose value is:
    - the address, when the status is `set`;
    - "Not set", when it is `unset`;
    - "Invalid: check INBOUND_DEFAULT_FORWARD", rendered with `role="alert"`, when it is
      `invalid`.

R7. A plain (non-`"use server"`) module under `lib/client-setup/` exports a pure function that
    takes the store's `InboundAddressRow[]` and the default's address (or `null`). It returns
    groups of `{ forwardTo, isDefault, addresses }`:
    - groups are ordered by `forwardTo`, and addresses within a group by `address`, both
      ascending;
    - `isDefault` is true only for the group whose `forwardTo` equals the default address;
    - every input row appears in exactly one group.

    A unit test covers two addresses sharing one mailbox, a third with its own mailbox, the
    default flag set and unset, and an empty list (returns `[]`).

R8. The page's "Receiving addresses" card renders the R7 groups:
    - one block per group, headed by its `forwardTo`, with the platform-default label when
      `isDefault`;
    - under each heading, every address with its purpose and its Remove button.

    With no addresses it still shows "No receiving addresses yet." The list keeps its
    `data-inbound-addresses` attribute, and each group carries `data-forward-group="<forwardTo>"`.

R9. Two receiving addresses of one store can be saved with the same `forwardTo`. A test of
    `addInboundAddress` (`lib/client-setup-service.ts`), with a Prisma double for which neither
    address exists yet, asserts both calls return success. The existing loop refusal (a
    `forwardTo` that is itself a receiving address) still refuses, under its existing test.

R10. All copy added by this slice is vendor-neutral: no vendor name, and no grocery or other
    product example (`docs/developer-portal/app-conventions.md`, "User-facing copy"). The repo's
    existing copy guard test passes.

## Docs

R11. `docs/developer-portal/env-setup.md`, section "Email: sending and receiving":
    - its Keys table has an `INBOUND_DEFAULT_FORWARD` row (where: `wrangler.toml` `[vars]`, both
      envs; meaning: prefills Client Setup's Forward to; unset means no prefill);
    - the section says the inbound Worker's `INBOUND_FALLBACK_FORWARD` is set to the same platform
      inbox by convention, and that the default must also be a verified Email Routing destination.

R12. `docs/platform-admin-guide/platform-admin-guide.md`, Client Setup section, describes:
    - the prefilled Forward to, and how to change it;
    - the list grouped by forward-to mailbox;
    - the Default forward-to status row.

    Every sentence added traces to a control built in R5, R6 or R8.

## Gates

R13. `CHANGELOG.md` updated (Gate 4).

R14. `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4` and
    `npm run format:check` all exit 0 after this slice. `npm run kms:validate` exits 0, and
    `npm run kms:coverage` reports no new uncovered file.
