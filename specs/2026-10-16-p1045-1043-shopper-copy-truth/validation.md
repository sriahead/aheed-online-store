# Shopper copy that contradicts the system (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice changes user-facing copy and one derived string. There is no new branch logic, no schema
change and no new dependency, so the weight sits on **Unit** (the shared sentence helper and the
guard tests) and **System/E2E** (the per-vendor placeholder, which only a real request can prove).
Two risk-based additions apply:

- **Multi-vendor.** CLAUDE.md requires verifying against a **second vendor**, because several checks
  false-positive against Aheed. R9 is the whole point of `#1043` and cannot be satisfied on the
  Aheed host alone.
- **Suite integrity.** `#1125` means a `vitest` run can silently drop whole test files while still
  printing a pass line, so R12 verifies the **file count**, not just the exit code.

`npm run preview` is required for the R9 row, never `npm run dev` — `next dev` cannot load
`@prisma/client/wasm` and renders an error state instead of the page (CLAUDE.md, Database).

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/assistant-content.test.ts` exits 0, including a case that asserts `pointsExpirySentence(12)` returns exactly `Points expire if your account goes 12 months without an order. Placing an order resets the clock.` (string equality, not a regex — a regex would pass against a longer sentence that re-introduced the error). |
| R2  | Unit | `grep -n "pointsExpirySentence" "app/(storefront)/help/page.tsx"` prints a match inside the `loyalty.pointsExpiryMonths !== null` block, and `npx vitest run tests/help-vendor-facts.test.tsx` exits 0. |
| R3  | Unit | `grep -n "pointsExpirySentence" lib/assistant-content.ts` prints a match, and `npx vitest run tests/assistant-content.test.ts` exits 0 — including the existing case that asserts no `/expire/i` text when `pointsExpiryMonths` is `null`. |
| R4  | Regression | `grep -rn "months after you earn" app/ components/ lib/ --include=*.ts --include=*.tsx \| grep -v "runbook/docs.ts"` prints **nothing** (exit 1). |
| R5  | Unit | `grep -n "Points expire after this many months without an order" components/staff/LoyaltyConfigForm.tsx` prints a match, and `grep -n 'htmlFor="pointsExpiryMonths"' components/staff/LoyaltyConfigForm.tsx` still prints a match. |
| R6  | Unit | `grep -n "placeholder" "app/(storefront)/orders/lookup/page.tsx"` shows the placeholder built from `vendorOrderPrefix(...)`, and `grep -c "AHE-" "app/(storefront)/orders/lookup/page.tsx"` prints `0`. |
| R7  | Integration | `grep -n "getCurrentVendorProfile" "app/(storefront)/orders/lookup/page.tsx"` prints a match. For the no-new-query half: `grep -n "lib/repositories" "app/(storefront)/orders/lookup/page.tsx"` prints **exactly one** line, and it is the pre-existing `import type { GuestLookupOrder }` — a **type-only** import, erased at compile time, which issues no query. A `lib/repositories` line that is not `import type` is a failure. |
| R8  | Regression | `grep -n '"AHE-"' tests/vendor-neutral-copy.test.ts` prints a match, and `npx vitest run tests/vendor-neutral-copy.test.ts` exits 0. |
| R9  | E2E (two vendors) | `npm run preview`, then both of: `curl -s http://localhost:8787/orders/lookup \| grep -o 'e\.g\. [A-Z]\{3\}-[0-9]\{8\}-[A-Z0-9]\{6\}'` prints `e.g. AHE-20260813-K4M2XQ`, and `curl -s -H "Host: srimart.localhost:8787" http://localhost:8787/orders/lookup \| grep -o 'e\.g\. [A-Z]\{3\}-[0-9]\{8\}-[A-Z0-9]\{6\}'` prints `e.g. SRI-20260813-K4M2XQ`. **Use the `Host` header, not a `srimart.localhost` URL** — Windows does not resolve `*.localhost`, and tenant resolution (`lib/tenant.ts`) reads the header anyway, so this exercises the same path without depending on DNS. Two different prefixes out of one code path is the pass condition. Afterwards kill the whole `node`/`workerd` chain — stopping `npm run preview` does not stop it, and the next build fails with `EBUSY` (CLAUDE.md). |
| R10 | Regression | `grep -c "without an order" tests/help-vendor-facts.test.tsx tests/assistant-content.test.ts` prints a non-zero count for **both** files, and `grep -rn "toMatch(/expire 12 months" tests/` prints **nothing** (exit 1). Do **not** grep `tests/` for `after you earn`: both files mention the old wording in explanatory comments, and `tests/assistant-content.test.ts` asserts `.not.toMatch(/after you earn/i)` deliberately — that line is the guard, so its presence is a pass, not a failure. |
| R11 | Acceptance | `git diff --name-only origin/staging...HEAD \| grep -x "CHANGELOG.md"` prints `CHANGELOG.md`. |
| R12 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0. Then `npx vitest run` **alone** (not beside a build — CLAUDE.md) exits 0, and its `Test Files` total equals the output of `git ls-files '*.test.ts' '*.test.tsx' \| grep -v -E '^\.claude/' \| wc -l` (**259** at the time of writing; recount rather than trusting that number). A run reporting fewer files is a **failed** run under `#1125`, even if it prints no failures. |

## Notes for a validator with no memory of this slice

- **The old wording was pinned by a passing test.** `tests/help-vendor-facts.test.tsx:142` asserted
  `/expire 12 months/i` before this slice. If that assertion is still present, the slice is
  incomplete regardless of whether the suite is green — R10 exists to catch exactly that.
- **`AHE-` surviving anywhere is not automatically a failure.** It legitimately remains in
  `lib/order-totals.ts`'s doc comment (a `.ts` file, inside a comment — out of
  `tests/vendor-neutral-copy.test.ts`'s reach on both counts) and in seeded data. R6 scopes the
  check to the lookup page only.
- **R9 cannot be satisfied from the Aheed host alone.** A hardcoded `AHE-` passes the Aheed half of
  that row. The SriMart half is the actual test.
- **`npm run kms:coverage` may fail locally for a reason unrelated to this slice, and must not be
  re-baselined.** It walks the filesystem, not git, so a **gitignored** markdown file counts against
  it. At the time of writing `misc/issue-club-a.md` (local scratch, ignored via `.gitignore:62`)
  makes it report `misc: baseline 0, measured 1 (increased)`. CI checks out from git and never sees
  that file, so running `kms:coverage -- --update` would commit a baseline describing one machine's
  scratch directory — and CI would then report a *decrease*. Confirm any `kms:coverage` complaint
  names a tracked file (`git ls-files <path>` prints something) before acting on it. This slice's
  own `plan.md` is covered: the failing run reported no change outside `misc`.
