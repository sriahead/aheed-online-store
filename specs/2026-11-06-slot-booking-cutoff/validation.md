# Slot booking cut-off (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.

## Before you start

- **Work in this slice's worktree,** recorded in `build-notes.md`, never in the main checkout.
- **Before any Prisma CLI command,** check `DIRECT_URL` and `DATABASE_URL` one at a time, as described in `CLAUDE.md`. Prefix the command with `env -u DIRECT_URL -u DATABASE_URL` if either is set. Print hosts only.
- **The owner applies the dev migration** with a `!` command. Do not run `migrate deploy` yourself.
- **Dev demo store admin** is `demo-store-admin@example.com`. The password is `.dev.vars` `DEMO_ACCOUNT_PASSWORD`. Drive staff actions with `curl`, as `docs/developer-portal/local-dev-playbook.md` describes.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | `grep -n "slotBookingCutoffMinutes" prisma/schema.prisma` shows `Int @default(60)` on the line after `slotHoldDurationMinutes`, with a `#1441` comment beside it. `npx prisma validate` exits 0. |
| R2 | Unit / Integration | 1. Read the migration file. It has one `ALTER TABLE … ADD COLUMN` exactly as in R2, a header naming `#895`, and `grep -c DROP` gives 0.<br>2. `npx prisma migrate diff --from-schema-datamodel <(git show origin/staging:prisma/schema.prisma) --to-schema-datamodel prisma/schema.prisma --script` emits the same statement. Write the old schema to a temporary file if process substitution fails on Windows.<br>3. After the owner applies it to dev, `npx prisma migrate status` reports up to date, and the datasource host is the dev host. |
| R3 | Unit | Read `lib/slot-cutoff.ts`. It has one export with R3's signature, imports `parseLocalInput`, and contains no `Date.now`, `new Date()` or `process.env`. Check with `grep -n "Date.now\|new Date()\|process.env" lib/slot-cutoff.ts`, which should give no output. |
| R4 | Unit | `npx vitest run tests/slot-cutoff.test.ts` passes. The file has a case for every bullet in R4, using the exact dates and times listed. |
| R5 | Unit / Integration | 1. Read `getAvailableSlotsForDate`. It takes `now: Date = new Date()`, selects `timezone` and `slotBookingCutoffMinutes` from the config, and filters with `isSlotBookable` before computing capacity.<br>2. **Real-adapter check.** Write a tsx script inside the repo (`misc/` is gitignored) that builds `getPrisma()`, the adapter the code uses, against **dev**. The script calls `getAvailableSlotsForDate` for a dev vendor that has slots. Pass today's weekday date in the vendor's zone and a `now` that lies between two of that day's slot starts. Expected: only slots starting more than 60 minutes after `now` are returned, and the next week's same weekday returns all of them. Delete the script afterwards. |
| R6 | Unit | `npx vitest run tests/slot-capacity.test.ts` (or the file the build adds) passes, with the three cases in R6. |
| R7 | Unit | `git diff origin/staging --stat -- components/checkout/SlotPicker.tsx lib/slot-grid.ts` gives no output. |
| R8 | Unit | Read `placeOrder`. The `isSlotBookable` call comes before `tx.order.count`, its arguments match R8, and `SLOT_CLOSED` is in the code union. `grep -n "SLOT_CLOSED" lib/repositories/orders.ts` lists the union entry and the throw. |
| R8 | E2E | On `npm run preview`, sign in as a dev shopper with a cart. Submit the checkout server action with a `fulfilmentSlotId` whose start, on the submitted date, is within 60 minutes or already past. The date must be today in Europe/London, for a slot that exists for that weekday; read the slot IDs from the dev database. Expected: the form state carries `That time slot can no longer be booked. Please choose another.`, and no new `Order` row exists for that cart, checked with a `getPrisma()` script. If no dev slot falls in that window at validation time, add a temporary slot from `/staff/fulfilment` and remove it afterwards. |
| R9 | Unit | The `placeOrder` test for `SLOT_CLOSED` passes and asserts no `order.count` and no `order.create` call. `npx vitest run tests/slot-capacity.test.ts tests/concurrency-slot-booking.test.ts` passes. |
| R10 | Unit | Read `lib/fulfilment-form.ts`: the constant is `1440`, the input type has the field, and the parser's lower bound is `0`. |
| R11 | Unit / E2E | 1. `grep -n "slotBookingCutoffMinutes" features/admin/fulfilment.ts lib/repositories/fulfilment-slots.ts` shows the form read, the select, the `?? 60` default and the update.<br>2. On preview, as the demo store admin, save `/staff/fulfilment` settings with `slotBookingCutoffMinutes=90` by `curl` or a browser. Reload: the field shows `90`. Restore `60`. |
| R12 | Unit / E2E | On preview, `curl` `/staff/fulfilment` as the demo store admin. The HTML has `id="slotBookingCutoffMinutes"` with `min="0"` and `max="1440"`, the label text, and the help text. It comes after the `slotHoldDurationMinutes` input in document order. |
| R13 | Unit | `npx vitest run tests/fulfilment-form.test.ts` passes, with the accepted and rejected values listed in R13. |
| R14 | Unit | `grep -n -i "cut-off" docs/store-admin-guide/admin-tabs-guide.md docs/operations-research/order-fulfilment-core.md` finds the new text in both files, and both front-matter versions differ from `origin/staging`. `npm run kms:validate` and `npm run kms:check-generated` exit 0. Run `npm run kms:assemble:internal`, then a Next build in `kms/site-internal`; it succeeds. |
| R15 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an `[Unreleased]` entry naming `#1441`. |
| R16 | Unit | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run build` exit 0. `npx vitest run --maxWorkers=4`, run alone, reports 0 failed. |
