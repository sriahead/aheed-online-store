# Shared page container and a three-step width scale (build notes)

Written at the end of Build, before the Clear. Spec: `plan.md`, `requirements.md` (R1-R19),
`validation.md`. Issue `#1180`. Branch `feature/p1180-shared-page-container`.

Commits: `effa5d8` (spec), `82f1cb7` (the slice, 66 files, +702/-277), `33a8f81` (a `CLAUDE.md`
rule learned during the build — see "Known-shaky areas").

## What changed and why

**`components/layout/PageContainer.tsx` is new and is now every page's top-level container.**
Before this slice there was no shared container anywhere: `app/layout.tsx:41` declines to constrain
width by design, and neither route-group layout adds one — `app/(admin)/layout.tsx` and
`components/layout/StorefrontChrome.tsx` both render a bare `<div className="flex-1">{children}</div>`.
So 60 pages each chose a `max-width` alone while every chrome element above them was `max-w-7xl`
(`Header.tsx:173`, `:229`, `:363`, and `PanelNav.tsx:119` since `#1177`). The admin hub was
`max-w-5xl`, so it started 128px inboard of the nav heading it; `/staff/categories` rendered its
table in 672px.

Three widths — `wide` `max-w-7xl`, `standard` `max-w-5xl`, `narrow` `max-w-2xl` — all rendering
`mx-auto w-full px-4`. **The shared gutter is the fix, not the `max-width`.** A `narrow` page still
shares a left edge with the header; it just stops sooner. That is why three widths are allowed to
coexist without reintroducing misalignment.

**All 60 pages converted** (`app/(admin)` 32, `app/(storefront)` 27, `app/(landing)` 1), per the
R6/R7 tables. The admin was uniform apart from the width token — every page was literally
`<main className="mx-auto w-full max-w-{N} px-4 py-8">` — so that part was mechanical.

**`tests/page-container.test.ts`** (5 cases) is the guard. Fixing this once is a tidy-up; it drifts
back without one, which is what `#612` and `#626` were for the nav.

**`scripts/verify-mobile-layout.ts` gained `--desktop` and `--measure <selector>`.** Reuse before
create: it already drove Chrome over CDP, already printed `documentScrollWidth`, and already had
`--sign-in`. It could not measure a desktop layout honestly (`mobile: true` was hardcoded) or report
an arbitrary element's box, which R13 turns on.

**Two defects found while taking the inventory, fixed here because this slice rewrites those exact
lines:**
- `app/(storefront)/products/[slug]/page.tsx` was `mx-auto grid max-w-4xl gap-6 sm:grid-cols-2` —
  **no `px-4` and no vertical padding at all.** The product detail page ran flush to the viewport
  edge on a phone. It is a conversion page; this was live.
- `app/(storefront)/help/page.tsx` used a `<div>`, so that page had **no `<main>` landmark**.

**Docs:** `specs/design-system.md` 1.23.0 (the scale as a standing decision),
`docs/developer-portal/app-conventions.md` 1.18.0 (a new "Page containers" section ahead of the
staff-panel one, because the rule is app-wide), `CLAUDE.md` (one bullet under the staff-panel rule,
pointing at the app-wide rule).

## Decisions taken during the build

**`className` appends and cannot override — enforced, not just documented.** The repo carries no
`clsx` and no `tailwind-merge` (checked: neither is in `package.json`, and there is no `cn()`
helper). Two competing `max-w-*` classes would therefore resolve by stylesheet source order rather
than intent, silently and potentially differently per build. Rejected the alternative of adding
`tailwind-merge` — a new infrastructure-adjacent dependency for a formatting convenience is not a
trade this repo makes. The guard test rejects `max-w-`, `mx-auto` and `px-` in that prop instead.

**`padY` has two values, not four.** The inventory held `py-6`, `py-8`, `py-10` and `py-16`.
Rejected one variant per value: `py-10` is one page (`/feedback`) and `py-16` is one page (`/dev`),
and earning a named variant each would encode accident as intention. Both go to `py-8`; the visible
change is 8px on a feedback form and some whitespace on a dev-only page.

**`PageContainer` always renders `<main>`, with no `as` prop.** Every page but `/help` already used
`<main>`, and `/help` was a defect. Adding element configurability for one historical inconsistency
would be API surface bought with nothing.

**The grid on `/products/[slug]` moved to a child `div` rather than onto the container.** Keeping it
on the container would have meant either a `grid` class in `className` (allowed by the guard, since
it is not a layout-width class) or a `display` prop. A child element is what the markup actually
means, and the rendered result is identical: before, `main` was the grid and the gallery, detail
column and reviews section were its three items; now that is a `div` inside `main`, same three
children.

**The per-page `wide`/`standard`/`narrow` assignment is written down in the test, not derived.**
There is nothing in the filesystem to derive "is this page a table or a form" from. Two of the five
guard cases exist to make a hand-maintained map safe: a page on disk missing from the map fails, and
a mapped page that no longer exists fails. Neither can rot silently, which is the property `#626`
bought for the nav test and is deliberately imitated here.

**The four auth pages keep a `max-w-sm` card inside a `narrow` container.** The guard is therefore
depth-aware: it rejects `mx-auto` + `max-w-` only on the element a page *returns*, not anywhere in
the file. A card is not a page container.

**The guard was proven to fail before being trusted**, in three directions — a hand-rolled
top-level container, a `className` smuggling `max-w-3xl`, and a new page absent from the map — then
restored green. Recorded here because the evidence does not survive in the diff.

## Deviations from the spec

**One, and it is an addition the spec anticipated as a possibility rather than specified.**
`CLAUDE.md` gained a rule about capping the vitest worker pool (`33a8f81`), which no requirement
asks for. It is recorded under R-nothing deliberately: it is a lesson from the build, not a
deliverable, and `CLAUDE.md` is where "something that should change every future session" belongs.
Flagging it so validation does not read it as unrequested scope.

Everything else matches `requirements.md` as written. R1-R11 and R15-R17 were built as specified;
R12's two script flags were specified after the adversarial pass and built as specified.

## Known-shaky areas

**1. The local full-test-suite signal on this machine is unreliable, and it lies convincingly.**
This cost real time during the build and will cost it again at validation if not expected.

At the default worker count, `npx vitest run` produced **2 to 10 failures scattered across
unrelated files** — `storefront-chrome-rewards-gate`, repository-purity, design-token and
fulfilment-capacity tests — each taking **5-9 seconds for a trivial assertion**. The failing set
moved between runs. Three consecutive runs on this branch failed; one run on `origin/staging`
passed, which made it look like a real regression this slice had introduced.

**It was contention, not code.** Two signals distinguish it, and both matter at validation:
- the durations (a structural `readFileSync` test does not take 7 seconds);
- **reverting code made the failure set GROW** — 2 failures became 10 with the page changes backed
  out. A real culprit does the opposite. Do not bisect against this.

`npx vitest run --maxWorkers=4` returned the same tree to **286 files / 3583 tests green**.
`--minWorkers` is not a valid flag. This is now in `CLAUDE.md` under the Windows section, which
previously warned only about running vitest beside a heavy build.

**2. R13's alignment check is the one requirement with no static proof.** Every other requirement is
checkable from source or a unit test. R13 needs `npm run preview` plus the extended script plus a
staff session. If it cannot be run, report it **unverified with the reason** — do not infer it from
the fact that both values are `max-w-7xl` in source, because that is exactly the reasoning
`PanelNav.tsx:106` used in `#1177` to justify a mismatch that turned out to be visible.

**3. `--desktop` and `--measure` are new and were exercised only by the author.** The default-output
guarantee (the `measured` key omitted entirely when no `--measure` is passed) is the part most worth
checking, because other slices' validation reads that JSON. R12's row says to diff the no-flag
output against `origin/staging`'s.

**4. The product-grid column counts (R15) are the most plausible place for a real regression.**
`/categories/[slug]` and `/search` were already `max-w-7xl`, so nothing about their width changed —
but `specs/design-system.md` records the column steps and the `#1173` collapsed-sidebar exception as
deliberately owner-tuned, and this slice touched both files. Measure, do not reason.

**5. `app/(storefront)/products/[slug]/page.tsx` shows 243 changed lines.** That is prettier
re-indenting the body after the grid moved one level in, not a rewrite. Reviewing it as a 243-line
change will waste time; `git diff -w` shows the real shape.

**6. `npm run sdd:audit` exits 1 on this branch, with exactly one gap, and that is correct.** It
reports `NO roadmap change-log row cites specs/2026-10-20-p1180-shared-page-container/`. That row
records merge commit, deploy run and production health, none of which exist before Ship, so it is
written at this slice's own `/document` stage. **Do not try to close it during validation.** The
audit went from 2 gaps to 1 here: `#1177`'s row was genuinely missing (its `/document` never ran)
and both of its rows — staging merge PR #1178 and promotion PR #1179 — were added on this branch
under the carry-forward rule, along with the slice-path citation the audit actually matches on.
**The audit matches the slice FOLDER PATH, not the issue number**; a row naming only `#1177` does
not satisfy it, which is why the first attempt still failed.

**7. The storefront's vertical rhythm shifted on two pages only** — `/feedback` (`py-10` to `py-8`)
and `/dev` (`py-16` to `py-8`). If a visual check flags vertical spacing anywhere else, that is a
real defect, because nothing else was meant to move vertically.
