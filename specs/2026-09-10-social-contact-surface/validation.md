# Social & contact surface — Facebook, Instagram and WhatsApp deep link (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
>
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing** — *Every feature.* Isolated business logic, utilities, components.
2. **Integration Testing** — *Every feature.* The component with its immediate dependencies.
3. **System / End-to-End Testing** — *Critical journeys and validation testing.*
4. **Regression & Acceptance Testing** — *Mainly before release, or when changing core flows.*
5. **Performance & Resilience Testing** — *Mainly before release, or for performance-sensitive APIs.*
6. **Security & Accessibility Testing** — *Before release, or earlier for auth, payments or UI changes.*

This slice is **Security-relevant earlier than usual**: R4 is an XSS guard on a value that lands in
an `href`, and R6 is an accessibility requirement on icon-only links. Both are verified here, not
deferred to release.

---

## Before you start

These four steps are ordered. Skipping any of them produces a confident wrong answer, not an error.

1. **Find the real vendor hosts — do not hardcode them.** Which hostname resolves which vendor is a
   property of the database you are connected to, not a platform constant. A previous slice's
   validation hardcoded `nocaped.com` hosts and every request silently redirected to
   `/coming-soon`. Run a short `tsx` script against the same `DATABASE_URL` the Worker uses
   (`prisma.vendorDomain.findMany()` plus `prisma.vendor.findMany()`) and use the `host` values it
   actually returns for every `curl -H "Host: ..."` below. Write it to a file under the repo and run
   `npx tsx <file>`; `npx tsx -e` fails silently on this Windows setup once a script imports a
   package.
2. **Confirm `.env` and `.dev.vars` point at the same Neon project**, and diff both against
   `secrets/staging.vars` and `secrets/production.vars` before any live-DB step. Two files agreeing
   with each other is not evidence they agree with the environment under test.
3. **Apply this slice's migration before any write-path row.** CI runs `prisma migrate deploy` only
   at merge, so the schema is one migration behind until you do. Run `npm run db:migrate:dev`
   against `DIRECT_URL`. It is additive and safe. Skipping this is a hard crash that looks exactly
   like a code defect.
4. **Use `npm run preview`, never `npm run dev`**, for every DB-touching row. `next dev` cannot load
   `@prisma/client/wasm` and renders a silent error state instead of failing.

**Grep note for this file.** Several rows below grep source for a string. Anchor to the construct,
not a bare word — this repo has repeatedly seen a hygiene grep match the explanatory comment written
to justify the very thing being searched for. Where a row says "in a `className`" or "as an
attribute", grep that shape rather than the bare token.

**Baseline for the suite.** `npx vitest run` reported **117 files / 1557 tests** before this slice.
A shortfall means workers silently failed to start, not a pass — re-run alone. This slice adds at
least one file (R16), so expect the totals to be higher; record the new numbers in `build-notes.md`.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Integration | `grep -nE '^\s+(facebookUrl\|instagramUrl\|whatsappNumber)\s+String\?' prisma/schema.prisma` prints exactly 3 lines. Then `ls prisma/migrations/` shows one new directory versus `git diff --name-only origin/staging...HEAD`, and `grep -ci 'drop' prisma/migrations/<new-dir>/migration.sql` prints `0`. Read that `migration.sql` in full before applying it — every `migrate dev` run in this repo since `#508` has proposed dropping the `pg_trgm` indexes, so confirm no `DROP INDEX` is present. |
| R2 | Unit | `grep -nE '(facebookUrl\|instagramUrl\|whatsappNumber): string \| null' lib/repositories/vendor.ts` prints 3 lines inside the `VendorProfile` interface. `grep -nE '(facebookUrl\|instagramUrl\|whatsappNumber): true' lib/repositories/vendor.ts` prints 3 lines (the `config.select` block). `grep -nE "vendor\?\.config\?\.(facebookUrl\|instagramUrl\|whatsappNumber) \?\? null" lib/repositories/vendor.ts` prints 3 lines — confirming `null`, not a fallback string. |
| R3 | Unit | `test -f lib/social-contact-form.ts` exits 0. `grep -cE "from \"@/lib/(db\|auth\|auth-rbac\|tenant)\"\|from \"next/headers\"" lib/social-contact-form.ts` prints `0`. `grep -c 'throw ' lib/social-contact-form.ts` prints `0`. |
| R4 | Security | `npx vitest run tests/social-contact-form.test.ts` passes. Then prove it bites: in a `node`/`tsx` scratch script, call the URL parser with `https://facebook.com/aheed` (expect success), then with `javascript:alert(1)`, `data:text/html,x`, `file:///etc/passwd` and `http://facebook.com/aheed` (expect a returned error, not a throw, for each), then with `""` and `"   "` (expect success with a `null` value). Delete the scratch file. |
| R5 | Unit | Same scratch script: the WhatsApp parser accepts `447700900123`, rejects `+447700900123`, `44 7700 900123` and `44-7700-900123`, rejects `123456` (6 digits) and a 16-digit value, and returns success with `null` for `""`. **Then the case this requirement exists for:** it rejects `07448894146` — digits-only and in range, but national format — and its error message names dropping the leading zero. This was live for real: the first number entered through the admin form was exactly that, and `wa.me` opened WhatsApp with no chat and no error. |
| R6 | Security & Accessibility | With Aheed's three fields set (see R13), fetch the storefront home under `npm run preview` using the host from step 1: `curl -s -H "Host: <aheed-host>" http://127.0.0.1:8787/ > home.html`. Then `grep -oE '<a[^>]*facebook[^>]*>' home.html` and the Instagram equivalent each print **exactly one** match, and each printed tag contains `noopener`, `noreferrer`, and an `aria-label` containing both the vendor name and the network name. Exactly one, not "at least one" — the links moved out of the footer and must not be rendered in both places. Confirm the footer is clean by extracting it (`grep -oE '<footer.{0,1200}'`) and checking no `facebook`/`instagram` occurs inside it. |
| R7 | E2E | In the same `home.html`: `grep -oE 'https://wa\.me/[0-9]+\?text=[^"]*' home.html` prints exactly one match, whose digits equal the `whatsappNumber` stored for Aheed and whose `text=` parameter is non-empty. |
| R8 | Integration & Accessibility | (a) In `home.html`, `grep -oE '<div class="fixed bottom-[^"]*"' home.html` prints one match; confirm its `bottom-` utility is numerically greater than `6` and its `sm:bottom-` greater than `8`, and cross-check `grep -n 'fixed bottom-6 right-6' components/cart/CartDrawerShell.tsx` still prints the cart button's line — if the cart button moved, this row's premise changed. Confirm the links panel carries `absolute bottom-full`, so a collapsed panel takes no layout space. (b) **The decisive check — `grep -c 'addEventListener' components/layout/FloatingContact.tsx` prints `0`.** There is no scroll listener, so no scroll position or direction can open the panel; combined with (a) that is what makes "opens only on click" structural rather than a promise. Confirm the initial state is collapsed (`useState(false)`), and in a browser at `npm run preview`: the panel is closed on load, scrolling up and down never opens it, hovering the trigger never opens it, one tap opens it, a second tap closes it. (c) `npx vitest run tests/motion-reduce-coverage.test.ts` passes, and the panel carries `motion-reduce:transition-none`. (d) `grep -cE '#[0-9a-fA-F]{6}\b' components/layout/FloatingContact.tsx` prints `0`. **Anchor to six digits — do not loosen this to `{3,8}`.** Digits are hex characters, so a `{3,8}` pattern matches the issue references every file in this repo carries in its doc comment (`#407`, `#405`, `#239`) and reports two failures on a file containing no colour at all. Sanity-check the pattern still bites by running it against `components/staff/StorefrontConfigForm.tsx`, which legitimately holds eight hex placeholders and must print `8`. Grep the source, not `home.html`: a rendered page legitimately embeds the vendor's own brand hex in `brandStyle()`'s inline custom properties, so a live-HTML hex grep cannot distinguish a hardcoded literal from a vendor primitive (`#631`). |
| R8a | Accessibility | In `home.html`, the trigger `<button>` carries `aria-expanded="false"` on first render and an `aria-controls` whose value matches the panel `<div>`'s `id`. `grep -oE '<a[^>]*tabindex="-1"[^>]*>' home.html` prints one match per configured link — collapsed links must not be reachable by keyboard. In a browser: with the panel closed, Tab moves from the trigger straight past the links to the next page control; after one click the trigger reads `aria-expanded="true"`, the links become tabbable, and the accessible name changes. The panel must remain in the DOM while collapsed (`grep -c 'aria-hidden="true"' home.html` is non-zero and the links are still present in the markup). |
| R9 | E2E | Fetch the **second vendor's** storefront, whose three columns are still `null` after seeding: `curl -s -H "Host: <srimart-host>" http://127.0.0.1:8787/ > srimart.html`. Then `grep -c 'wa\.me' srimart.html`, `grep -ci 'facebook' srimart.html` and `grep -ci 'instagram' srimart.html` each print `0`, and the trigger itself is absent (`grep -c 'aria-controls="vendor-social-links"' srimart.html` prints `0`) — the component returns `null` when all three values are, so no empty disclosure ships. Use the second vendor rather than Aheed-with-nulls: a live-HTML absence check is only meaningful against a vendor whose own data cannot coincidentally supply the string. |
| R10 | Unit | `grep -nE '(facebookUrl\|instagramUrl\|whatsappNumber)\?: string \| null' lib/repositories/vendor.ts` prints 3 lines in `VendorStorefrontConfigInput`. In `updateVendorStorefrontConfig`'s `vendorConfig.update` data object, each of the three is a direct `data.<field>` assignment (the `bannerNote` pattern), **not** wrapped in a conditional spread. |
| R11 | Security | `grep -n 'requireVendorRole' features/admin/storefront.ts` shows the new action calls it before any write, and `grep -n 'auth.vendorId' features/admin/storefront.ts` shows the vendor comes from the auth result. Then drive it live: `curl -X POST` the action against `/staff/storefront` with **no** `Cookie` header and confirm nothing is written (re-read the row afterwards). See `CLAUDE.md`'s "Live-testing staff panel server actions" for the `useActionState` four-field shape (`$ACTION_REF_N`, `$ACTION_N:0`, `$ACTION_N:1`, `$ACTION_KEY` — the key is per-render, so re-fetch the page before each submission). |
| R12 | Integration | Note Aheed's three social values. Under `npm run preview`, submit the **delivery-rules** form (changing the delivery fee only), then re-read `VendorConfig` for Aheed and confirm `facebookUrl`, `instagramUrl` and `whatsappNumber` are byte-identical to before and the fee changed. |
| R13 | E2E | Signed in as a store admin, `curl -s -b <cookies> -H "Host: <aheed-host>" http://127.0.0.1:8787/staff/storefront > sf.html`; `grep -cE 'name="(facebookUrl\|instagramUrl\|whatsappNumber)"' sf.html` prints `3`, and each input's `value` matches the stored value. Then submit the form with `facebookUrl=javascript:alert(1)` and confirm the response re-renders with an error naming that field, and that a re-read of the row shows the stored value unchanged. |
| R14 | Regression | `grep -n 'wa\.me\|WhatsApp' specs/roadmap.md` shows a Roadmap Change Log row citing `#405` and stating that the MVP out-of-scope line for WhatsApp is being consciously reversed. |
| R15 | Acceptance | `npx vitest run tests/operator-doc-coverage.test.ts` passes. Then read `docs/store-admin-guide/admin-tabs-guide.md`'s `## Storefront — /staff/storefront` section and, for **each** capability sentence added, point at the specific input on `/staff/storefront` that provides it — `#634` shipped four false capability claims in this exact file, and no test can catch that. |
| R16 | Unit | `npx vitest run tests/social-contact-form.test.ts` passes and its output names cases covering: accepted https URL, rejected `javascript:`, rejected `http:`, blank URL to `null`, accepted digits-only number, rejected number containing `+`. |
| R17 | Regression | `git diff --name-only origin/staging...HEAD \| grep -qx 'CHANGELOG.md'` exits 0, and the new entry names `#407` and `#405`. |
| R18 | Regression | `npm run lint`, `npx tsc --noEmit`, `npm run format:check`, `npx vitest run` and `npm run build` each exit 0. Run `vitest` with nothing else building — check the reported file/test totals against the baseline above rather than trusting the exit code. Because this slice edits `specs/*.md`, also run `npm run kms:validate` and `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)`, reading the real exit status rather than piping it. |
