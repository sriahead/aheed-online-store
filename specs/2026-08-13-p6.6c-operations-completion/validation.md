# P6.6c — Operations Views Completion (validation)

> **Rewritten 2026-08-18 under #231.** The previous file was a checklist of unnumbered boxes with no
> requirement numbering to map onto, and its navigation item asserted an exact tab count that P6.7
> later falsified by legitimately adding `Team`. Every row below names a command, a file property or
> an observable behaviour, and maps 1:1 onto `requirements.md`'s `R1..R17`.

**Run the live rows against `npm run preview`, never `npm run dev`.** Sign-in against preview works
(`http://localhost:8787`); a port-less `Origin` is correctly refused. Confirm which Neon project the
app is on before trusting a live result.

Demo accounts: `demo-admin@example.com` (platform + vendor ADMIN), `demo-store-admin@example.com`
(vendor ADMIN only), `demo-staff@example.com` (STAFF), `demo-customer@example.com` (no panel access).

| Req | How to verify |
|-----|---------------|
| R1  | Sign in as `demo-admin@example.com`, load `/staff`, and record the full tab list rendered by `PanelNav`. Confirm the nine required entries are all present. Extra tabs are not a failure — record them. |
| R2  | Sign in as `demo-staff@example.com`, load `/staff`, and record the full tab list. Confirm Overview, Live Inventory, Orders and Runbook are present. |
| R3  | From the same staff session's recorded list, confirm none of Catalogue, Categories, Loyalty, Discounts or Reports appears. |
| R4  | In both sessions, confirm an Overview entry linking to `/staff` and that following it renders the portal root. |
| R5  | At a 375px viewport on `/staff`, read the nav element's `scrollWidth`, `clientWidth` and `offsetHeight`, plus `document.documentElement.scrollWidth` vs `clientWidth`. Confirm `scrollWidth > clientWidth` (it scrolls), the height equals a single row, and the document does not scroll horizontally. Record the numbers. |
| R6  | On `/staff` as each tier in turn, confirm a Live Inventory card and an Internal Operational Runbook card render. |
| R7  | On `/staff` as ADMIN, confirm a Reports card renders; as STAFF, confirm it does not. |
| R8  | Confirm `app/(admin)/staff/runbook/page.tsx` exists; load `/staff/runbook` and confirm discrete documentation articles render. |
| R9  | Confirm the page calls `requireVendorRole("STAFF", "ADMIN")`. Request `/staff/runbook` as `demo-customer@example.com` and record the actual refusal observed — the rendered component and the HTTP status. Do not assume a 403: a Server Component refusal in this codebase renders `PanelRefusal`. |
| R10 | Inspect the rendered runbook container's computed background; confirm the dark slate treatment with accent highlights, distinct from the light panel surfaces on `/staff`. |
| R11 | Confirm `app/(admin)/staff/reports/page.tsx` calls `requireVendorRole("ADMIN")`. Request `/staff/reports` as `demo-staff@example.com` and record the observed refusal (component and status). |
| R12 | Read the page's imports: confirm the aggregate comes from `lib/repositories/*` and that neither `@/lib/db` nor `@prisma/client` is imported. Confirm the query is vendor-scoped by comparing the reported order count against a direct vendor-scoped count taken over `DIRECT_URL`, and against the total across all vendors — the two must differ, or the vendor scoping is unproven. |
| R13 | Load `/staff/reports` as ADMIN; confirm exactly three metric cards titled Total Revenue, Total Orders and Average Basket Value. |
| R14 | Record the three figures. Place an order for that vendor, reload, and confirm Total Orders increased by exactly one and Total Revenue increased by that order's `totalPence`. |
| R15 | For each role, follow every visible nav link and record the resulting HTTP status. Confirm none is 404 and none renders an unhandled error. |
| R16 | `git diff <base> -- CHANGELOG.md` — non-empty. |
| R17 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` — all exit 0. CI on Linux is the authority over a local Windows `format:check`. |
