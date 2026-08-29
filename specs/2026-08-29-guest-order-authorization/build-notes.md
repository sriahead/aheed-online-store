# Guest order authorization — confirmation and cancellation (build notes)

Written at the end of Build, before the Clear. Two commits on
`feature/427-guest-order-authorization`: `f286d07` (spec only) and `97febb2` (implementation).

**Built in the main checkout at `E:/GitRepositories/aheed-online-store`, not in a sub-agent
worktree.** `git worktree list` shows one entry. Nothing is hiding one directory down.

## What changed and why

**The credential.** `Order.confirmationToken` is a nullable, unique column minted with
`crypto.randomUUID()` inside `placeOrder`'s existing `$transaction`, in the same `tx.order.create`
call that writes `orderNumber` — so no order created from here on can exist without one. It rides
back out on `PlacedOrder` and forward to `payments.createPayment`, which is already the boundary
where the return URLs are built.

**`PlacedOrder` carries the token, and that is the non-obvious half of the slice.**
`features/checkout/place-order.ts:142` falls back to `/checkout/${orderNumber}` whenever
`redirectUrl` is null — and that is not an edge case, it is *every* checkout wherever
`STRIPE_SECRET_KEY` is unset, which means local preview and CI. Putting the token only on Stripe's
URLs would have shipped a build where the stub path hands the shopper a URL the new rule immediately
refuses, and no unit test would have noticed. This was found while drafting the spec, not while
coding, which is why R5/R6 exist at all.

**The rule** lives in one place, `findOrderForViewer`, and both callers reach it through
`getByOrderNumber`. Member orders are owner-only and ignore the token entirely — a non-owner holding
a valid token is still refused. Guest orders require a non-empty token matching a non-null stored
value. Both null checks are load-bearing: an order placed before this migration stores `null`, and
`null === null` would otherwise have handed every pre-migration guest order to a caller passing
nothing, which is the hole this slice closes rather than one it may open.

The token is destructured out of the result alongside `userId`, so it cannot reach `OrderSummary` —
the type every order page renders from.

**Uniform refusal.** Both pages replace `notFound()` with a single redirect to
`/orders/lookup?orderNumber=…`. One branch for "no such order", "wrong token" and "not the owner", so
nothing confirms which order numbers are real, and the shopper lands somewhere they can recover with
the order-number-plus-email pair they actually have.

**The cancel path.** `app/api/checkout/cancel/route.ts` is deleted. Stripe's `cancel_url` returns the
browser with a `GET`, so that route was a destructive `GET` any link prefetcher, mail scanner, chat
unfurler or crawler could fire — cancelling a live order and releasing its stock. A token alone would
not have fixed that; only the GET/POST split does. The `GET` is now a page that asks
(`app/(storefront)/checkout/[orderNumber]/cancel/page.tsx`), and the write sits behind a POST server
action (`features/checkout/cancel-order.ts`) that re-proves the token rather than trusting the form's
hidden fields — the posture `eraseGuestOrder` already takes with the order-number/email pair.

**The migration could not be generated the normal way.** `npx prisma migrate dev --create-only`
refuses and demands a full dev-database reset, because an earlier migration's checksum drifted — open
issue **#378**, hit live here rather than theoretically. It was generated with
`npx prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --script`, which applies
nothing and touches no migrations table. The reasoning is written into `migration.sql` itself so it
survives independently of this file.

## Decisions taken during the build

- **A fourth superseded docstring was corrected.** R24 names three. `OrderRepository.getForUser`'s
  docstring also asserted "the unguessable number is the credential" as current behaviour, in the
  same file. It is the same defect class R24 exists for, so it was fixed rather than left to become
  the fifth instance of CLAUDE.md's recurring "a docstring outlived the property it claimed" lesson.
  Recorded here because it is strictly beyond R24's literal text.
- **`prisma migrate diff` also reported drift this slice did not cause** — three `DROP INDEX`
  statements for the `pg_trgm` trigram indexes created by
  `20260820143949_p7_5de_order_search_trigram`. That is precisely the cost CLAUDE.md predicts for
  hand-authored DDL the Prisma schema cannot express. Their origin was verified before excluding
  them; `migration.sql` contains only the two statements Prisma generated for the new declaration.
  **Nobody should "fix" that drift by letting a future `migrate dev` drop those indexes.**
- **Plain string equality on the token, deliberately, with the reasoning in code and in `plan.md`.**
  A hand-rolled constant-time compare in JavaScript would let the code claim a property JIT
  behaviour and string interning make unprovable. If it is ever revisited, the correct fix moves the
  comparison into the `where` clause so Postgres performs it.
- **`?? ""` on the token read back from `create`.** Prisma types the column as nullable, and the
  create always supplies it, so the coalesce is unreachable — and it fails *closed* if it ever were
  reached, because `findOrderForViewer` refuses an empty token. Chosen over a non-null assertion for
  that reason.
- **The cancel page redirects a non-`PENDING_PAYMENT` order to the confirmation page, carrying `t`
  through.** The spec did not say what a settled order should see. Sending them onward with the
  token in hand beats a dead end, and there is nothing left to decide.
- **The "keep my order" control is a `Link`, never a second submit button.** A button inside that
  same form would cancel the order it is meant to preserve.
- **A separate, tiny Prisma double for the authorization tests** rather than extending
  `placeOrder`'s harness. It honours the `where` clause instead of always returning its row —
  otherwise the cross-vendor case would pass while proving nothing.

## Deviations from the spec

**One, and it is an addition rather than a departure:** the fourth docstring above
(`OrderRepository.getForUser`) is outside R24's named three. Everything R1–R28 asks for was built as
written; nothing was narrowed, substituted or skipped.

R29–R31 are live rows and were **not** attempted at Build — the migration has not been applied to any
database and nothing has been exercised under `npm run preview`. That is the stage boundary, not a
gap.

## Known-shaky areas

- **The live rows are the whole risk surface.** Every check that has actually run is a unit test or a
  static one. R29–R31 are the first time the token travels a real redirect into a real Postgres row.
  `validation.md`'s preamble carries the `npm run db:migrate` step they depend on — skipping it does
  not degrade gracefully, it throws an error that reads like a code defect.
- **The stub-adapter fallback (R6) is the single most likely thing to be wrong**, because it is the
  path validation will actually walk. If a guest lands on `/orders/lookup` immediately after
  checkout rather than on their confirmation, look there first, not at `findOrderForViewer`.
- **`crypto.randomUUID()` under workerd.** It is a global in both Node and workerd, and
  `lib/cart-identity.ts` already calls it the same way, so this is expected to be fine — but every
  execution of it so far has been in Node under vitest, never in the Workers runtime.
- **Nothing has exercised a pre-migration order.** The null-stored-token refusal is covered by a unit
  test, but no real row with `confirmationToken IS NULL` has been read through the new rule. Any
  guest order already in the dev database qualifies and is worth one query.
- **The cancel action's cart restore is untested at any level.** It was moved verbatim from the
  deleted route and typechecks, but no test covers it and R31(b) is its first real exercise. If the
  line does not reappear in the basket, that is where to look.
- **The second vendor is unexercised.** Nothing here is branding-dependent, but SriMart's storefront
  was not walked; `validation.md` does not require it, and it is noted only so its absence is a known
  quantity rather than an oversight.
