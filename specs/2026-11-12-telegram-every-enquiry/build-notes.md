# Telegram alert for every contact-form enquiry (build notes)

Issue #1548. Worktree `E:\GitRepositories\aheed-1548` (branch `feature/1548-telegram-every-enquiry`,
`node_modules` junctioned to the main checkout; rmdir the junction before `git worktree remove`).

## What changed

- `lib/contact/submit.ts`: the `type === "COMPLAINT" || orderNumber !== null` gate is gone. The brief
  now carries `contactType: input.type`.
- `lib/order-alert/brief.ts`: `contactType?: ContactType`. The heading is `Complaint`/`Enquiry`
  when set, otherwise `Order inquiry` (email route, Client Setup test alert).
- Tests: the "enquiry with no order does not alert" case is inverted (R1, R3). The complaint brief
  expects `contactType`. New `formatOrderAlert` cases cover both headings and the staging tag (R4).
- Docs: platform admin guide "Know what triggers an alert", env-setup Telegram sanity check steps
  6 and 8.

## Evidence that prompted it (Aheed staging, 2026-11-12, before the change)

- ENQUIRY through `/contact`: `VendorEnquiry` row `OPEN` recorded, no alert attempted.
- COMPLAINT: `status=sent` to `-1003925079524`; `-5277792253` failed `telegram 400: chat not found`
  (stale recipient, owner to remove in Client Setup; not a code issue).
- Driving the contact Server Action with curl: header `Next-Action: <id>`, field
  `0=[<prevState>,"$K1"]`, form fields prefixed **`_1_`** (React's `formFieldPrefix + "_" + id + "_"`),
  not `1_`. PowerShell 5.1 strips JSON quotes from native args, so use `curl -K <config>`.

## Validation context

Validated in-session (owner skips the pre-validation Clear for small slices); not independent.
