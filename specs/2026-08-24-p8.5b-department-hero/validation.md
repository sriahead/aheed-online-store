# P8.5b — Department hero (validation)

Everything DB-touching runs under `npm run preview` (OpenNext + Miniflare), never `npm run dev` —
plain `next dev` cannot load `@prisma/client/wasm` and renders a silent error state.

**Two standing traps this slice is especially exposed to.** First, the literal-check trap: a bare
grep for a class name or string counts the explanatory comment the change itself added, so the rows
below exclude comment lines or ask for the hit to be read. Second, and specific to accessibility:
**no lint rule checks WCAG SC 2.2.2**, so R10–R13 must be exercised in a real browser. A green
`npm run lint` is not evidence for any of them.

| Req | How to verify |
|-----|---------------|
| R1  | Under `npm run preview`, load `/` and confirm the hero panels match `getCategoryRepository().listTopLevel()` for that vendor in name and order — compare against the department strip below, which reads the same source. Then `grep -rn "HMC Halal Butchery\|Daily Desi Produce\|Basmati & Atta Sacks\|Aromatic Spice Vault\|Chilled Dairy & Frozen" app components` prints nothing (exit 1). Repeat the page check with `Host: srimart-staging.nocaped.com` and confirm SriMart's own departments appear, not Aheed's. |
| R2  | Read the hero component and confirm the mark is produced by `categoryIcon(category.slug)`, not a local map. Then add a temporary category with an unmapped slug on the **dev** Neon branch, reload, and confirm the generic basket renders rather than a blank space. Remove the temporary row afterwards. |
| R3  | A vitest unit test renders the panel component twice — once with the optional image prop and once without — asserting an `img` in the first and the icon in the second. `npm test` exits 0 and the test appears by name. |
| R4  | Under `npm run preview`, note the product name and price shown in a panel's callout, then read that product's row from the dev database (or its `/products/<slug>` page) and confirm both match. Change the product's price on the dev branch, reload, and confirm the callout follows. Verify the DB target before writing: diff `.env` against `secrets/staging.vars` and `secrets/production.vars` per `CLAUDE.md`, since a "staging-sounding" file is not evidence the host is staging. |
| R5  | Count queries for one `/` render, or assert it directly in a unit test against the new pure function: one invocation returns spotlights for N category ids. Read the function signature and confirm `prisma` and `vendorId` are explicit parameters. State which method was used. |
| R6  | On the dev branch, deactivate every top-level category for a test vendor (or use a vendor with none), load `/`, and confirm no hero section renders at all — not an empty bordered well. Restore afterwards. |
| R7  | In a real browser, `Tab` to a panel and press `Enter`; the URL becomes `/categories/<slug>` and the filtered catalogue renders. Confirm the control is an anchor in the DOM, not a `div` with a click handler. |
| R8  | Read the hero component and its CSS. Then `grep -rniE "#[0-9a-f]{3,6}\|rgba?\(\|emerald-\|slate-\|amber-\|purple-" <hero component path>` and read every hit — each must be on a comment line, or the row fails. Confirm the `clip-path` is present and that hover changes it. |
| R9  | `curl -s -H "Host: srimart-staging.nocaped.com" <preview-url>/ > /tmp/srimart.html` and the same for Aheed; diff the hero markup and the root `style` attribute. The colour values must differ. A passing `tests/vendor-theme.test.ts` is **not** evidence — see `CLAUDE.md` on #251, where `tokens.css` was right and every rendered page still showed the old colour. |
| R10 | In a real browser, confirm a pause control is present, has an accessible name (check the accessibility tree, not just a `title`), and that activating it stops rotation. Wait through at least two rotation intervals to confirm it stays stopped. |
| R11 | Hover the hero and confirm rotation stops, then unhover and confirm it resumes. Separately, `Tab` into the hero **without hovering** and confirm rotation stops on focus; `Tab` out and confirm it resumes. Keyboard focus is the half the reference implementation omits, so test it independently of hover. |
| R12 | Enable reduced motion at the OS or browser level, reload `/`, and confirm the hero never advances across at least three rotation intervals. |
| R13 | Inspect the accessibility tree: the current panel is exposed through a programmatic state (for example `aria-current`, or a live-region announcement), not by colour alone. Confirm every panel is reachable by `Tab` in DOM order. |
| R14 | `grep -rn "PromoCarousel\|getCurrentVendorPromotions\|promotions-service" app components lib features` returns no match outside `app/(admin)/staff/runbook/docs.ts` (generated). `git status` confirms the three files are deleted. |
| R15 | `grep -n "VendorPromotion" prisma/schema.prisma prisma/seed.ts` returns nothing. A new migration exists under `prisma/migrations/` dropping the table, and `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations --shadow-database-url "$DIRECT_URL"` reports no drift. Run migrations against the **dev** branch only. |
| R16 | `gh issue view 279` and `gh issue view 280` each show a closing or re-scoping comment naming this slice. |
| R17 | `npm test -- tests/repository-purity.test.ts tests/repository-vendor-scoping.test.ts` exits 0. |
| R18 | Under `npm run preview`, `/` returns 200 for both seeded vendor hosts, and the department strip, both product rows and the trust strip all render below the hero. Check the preview console for errors on each. |
| R19 | `grep -rn "unsplash\|images\." "app/(storefront)/page.tsx" <hero component path>` returns no image source outside `composePublicUrl`. Confirm in the browser's network tab that the hero issues no request to a host other than the CDN. |
| R20 | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and describes this slice. |
| R21 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` each exit 0 locally — and the `gates` workflow passes on the PR. CI on Linux is ground truth, not local Windows output. Because this slice edits `specs/`, also run `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` and check its **own** exit code, not a pipeline's. |
