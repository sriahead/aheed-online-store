# Blocking admin alert, and a second local vendor by host (validation)

Run from a fresh context. Both fixes are verifiable without touching production; neither changes
data.

> **Testing strategy.** Both are covered by tests that need no database and no network — the
> component through jsdom with `fetch` and `alert` stubbed, the tenant resolver through the existing
> mocked-Prisma harness in `tests/tenant.test.ts`. The one thing worth doing live is R6 under
> `npm run preview`, because #514's whole point is that the behaviour differs between a real
> deployment and local preview.

| Req | How to verify |
|---|---|
| R1 | `grep -rn "alert(" components/staff/ "app/(admin)/"` returns nothing that reports a result. (`role="alert"` is a different string and does not match `alert(`.) |
| R2 | `npx vitest run tests/backfill-images-button.test.tsx` — the success case asserts a `role="status"` element containing the message and "3 generated". |
| R3 | Same file: the 403 case asserts a `role="alert"` element containing the route's `error` text, and the rejected-fetch case asserts the network message. **Reading `message` on a 403 would render `undefined`** — that is why the error field is asserted specifically. |
| R4 | Same file: after a run the button's `disabled` is `false`. Plain DOM assertion — `@testing-library/jest-dom` is deliberately not a dependency, so `toBeDisabled()` does not exist here. |
| R5 | Every case in that file asserts `alert` was not called. This is the assertion that matters: checking only that a message renders would pass with the `alert()` still in place. |
| R6 | `npx vitest run tests/tenant.test.ts` covers it. **Also worth running live**: under `npm run preview`, seed a `VendorDomain` row for `srimart.localhost:8787`, then `curl -sv -H "Host: srimart.localhost:8787" http://localhost:8787/categories` and confirm a 200 rendering SriMart rather than a 307 to `/coming-soon`. |
| R7 | In `tests/tenant.test.ts`, the portless case asserts `findUnique` was called exactly **once**. This is the row that proves real deployments pay nothing for the fallback. |
| R8 | Same file: with a port present and the stripped lookup matching, `findUnique` is called exactly once and the stripped row's vendor wins. |
| R9 | Read `lib/tenant.ts`: the fallback looks up `rawHost.toLowerCase()`. `upsertVendorDomain` in `prisma/seed.ts` lower-cases on write, so an upper-case `Host` header would otherwise never match. |
| R10 | The three new cases in `tests/tenant.test.ts` use the existing mocked `getPrisma`; no `DATABASE_URL` is read. |
| R11 | `git diff origin/staging -- CHANGELOG.md` shows an entry referencing #507 and #514. |
| R12 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` all exit 0. CI on the PR is the authority. |

## Notes for the validator

- **R5 is the point of #507's fix**, not R2. The defect was never "no message shown" — it was that
  the message arrived in a modal that froze the tab, including for any automation trying to verify
  the button. A test that only checks for rendered text would not have caught it and would not
  catch a regression.
- **R7 is the point of #514's fix.** The risk in touching `getCurrentVendorIdOrNull` is not
  correctness but cost: it runs on **every request**. The guard means a portless host issues the
  same single query it always did, and the test asserts the call count rather than the result.
- Neither fix touches production data. #514's issue notes the dev database was worked around by
  rewriting a row by hand during #501's validation; that row is fine either way now, since both
  spellings resolve.
