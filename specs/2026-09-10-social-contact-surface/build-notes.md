# Social & contact surface — Facebook, Instagram and WhatsApp deep link (build notes)

Written at the end of Build, **before** the Clear. The validating context is fresh and has only the
spec, the artifact, and this file.

## What changed and why

**Schema and migration.** `VendorConfig` gains `facebookUrl`, `instagramUrl` and `whatsappNumber`,
all `String?`. Migration `20260910104002_p9_2_vendor_social_contact`. Nullable with no default, so
existing rows need no backfill and both seeded vendors start with all three `null` — which means the
`#239` null-hides path is the default state rather than something only a test reaches.

**Read path.** `lib/repositories/vendor.ts` — three fields added to the `VendorProfile` interface,
to `fetchVendorProfile`'s `config.select` block, and to its return object as `?? null`. Deliberately
unlike the `deliveryFeePence` lines a few rows below, which fall back to schema defaults: there is
no platform default for a social link.

**Write path.** `VendorStorefrontConfigInput` gains the three as optional `string | null`, and
`updateVendorStorefrontConfig` assigns each **directly** (`facebookUrl: data.facebookUrl`) rather
than through `#634`'s conditional spread. Prisma reads `undefined` in an `update` as "no change",
which is exactly the semantics needed, and it is the pattern `bannerNote`/`heroSubtitle` already
use two lines above. `updateDeliveryRules` passes only its own parsed value, so saving delivery
rules cannot clear a vendor's social links — its comment now says so explicitly.

**Validation.** `lib/social-contact-form.ts`, new, pure, DB-free, modelled on
`lib/delivery-rules-form.ts`. Reuses `ParseResult`/`FieldError` from `lib/catalogue-form.ts` rather
than defining new ones. Exports `parseSocialUrl`, `parseWhatsappNumber`, `parseSocialContact`, the
three field-name constants, and `initialSocialContactState` — that last one lives here and **not**
in `features/admin/storefront.ts` because a `"use server"` file may export only async functions
(`#159`), a rule nothing in `lint`/`typecheck`/`test` enforces.

**Render.** One client component, `components/layout/FloatingContact.tsx`, mounted in
`components/layout/StorefrontChrome.tsx`, which already receives `profile: VendorProfile`. A single
always-visible trigger sits above the cart button and expands on click to reveal whichever links the
vendor has configured. The panel is absolutely positioned above the trigger, so a collapsed panel
occupies no layout space and the trigger never moves as it opens.

**This replaced an earlier footer design mid-loop — see "Deviations" below.** The superseded
`SocialLinks.tsx` (footer links) and `WhatsAppLink.tsx` (floating, alone) were deleted rather than
left in place; the glyphs moved into `FloatingContact.tsx`.

**Admin.** `features/admin/storefront.ts` gains `updateSocialContact`, a `useActionState` action
shaped like `updateDeliveryRules` (field-level errors), and `components/staff/StorefrontConfigForm.tsx`
gains a third sibling `<form>` — never nested, since HTML forbids that and the three forms save
independently.

**Docs.** `docs/store-admin-guide/admin-tabs-guide.md`'s Storefront section updated across five of
its seven labelled parts. `specs/roadmap.md` change log records the WhatsApp scope reversal (R14),
and `specs/mission.md`'s out-of-scope bullet is narrowed in place rather than deleted — notifications
and marketing automation are still out.

## Decisions taken during the build

**Inline SVG for the Facebook and Instagram glyphs.** `lucide-react@1.30.0` ships 6056 icons and
**no brand marks at all** — `Facebook` and `Instagram` are both absent, removed upstream. Checked
rather than assumed. The two glyphs use lucide's own stroke geometry so they sit visually with the
rest of the icon set, and nothing was added to `package.json`, which is what `#407` actually asked
for ("rather than a new dependency"). `MessageCircle` **is** available and is used for WhatsApp.

**`bg-action`, not WhatsApp green.** Rejected `#25D366`: a hex literal breaks the token convention,
and a storefront rendering a third party's brand colour in its own chrome is the mistake `#239`
fixed. The control renders in Aheed's green and SriMart's blue.

**`bottom-24` / `sm:bottom-28` for the floating control.** `CartDrawerShell.tsx:L113` occupies
`bottom-6 right-6` (`sm:bottom-8 sm:right-8`) and is **unconditional** — only its item-count badge
is conditional, so it is present on every storefront page including an empty cart. The cart keeps
the corner because it is the primary commerce action. Arithmetic: the cart button is roughly 44px
tall, so its top edge sits near 68px (`bottom-6`) and 76px (`sm:bottom-8`); `bottom-24` is 96px and
`sm:bottom-28` is 112px, leaving ~28px and ~36px of clearance.

**`hover:scale-105` paired with `motion-reduce:hover:scale-100`,** copied from the cart button.
`tests/motion-reduce-coverage.test.ts` walks `app`/`components`/`features` from the filesystem with
no allowlist, so an unpaired scale utility fails the suite.

**Blank parses to `null`, not to an error.** Clearing a field is a deliberate act that hides the
link, so only a non-blank non-conforming value is refused.

**`http:` refused as well as `javascript:`/`data:`/`file:`.** Stricter than "not dangerous": a
mixed-content link from an HTTPS storefront is a downgrade the browser warns about, and no target
network is HTTP-only.

**Message text is a derived constant,** `Hi {vendorName}, I have a question about my order.`, not a
fourth column. `plan.md` excluded a per-vendor template.

## Deviations from the spec

**One, and it is in `plan.md`'s narrative rather than in a requirement.** `plan.md` says the icons
come from `lucide-react`, naming it as already-a-dependency. That is true for WhatsApp
(`MessageCircle`) and false for Facebook and Instagram, which lucide no longer ships at any version
in this major. Resolved with inline SVG as described above. **No requirement was violated** — R6 and
R7 ask for accessible names, `target`/`rel` and conditional rendering, and say nothing about which
package draws the glyph. Recorded here because a validator reading `plan.md` would otherwise expect
a `lucide-react` import that is not there.

**A second, larger one: the owner changed the design mid-loop, after Build and after the first
preclear passed.** Two requests, both acted on, and `requirements.md`/`validation.md` were amended
to match rather than left stale — validation runs from a fresh context against the spec, so a
behaviour change with an unamended spec would have failed R6 correctly and for the wrong reason.

1. **Social links moved from the footer to the floating cluster.** `#407` asked for the footer and
   the original R6 said so. They now float with WhatsApp. The links are **moved, not duplicated** —
   rendering the same link twice on one page is an accessibility and SEO negative — so R6 now
   requires *exactly one* match per network and an empty footer. This also turned a pair of server
   components into one **client** component, because a scroll listener needs the browser.
2. **The WhatsApp number rule was wrong, and it was a live defect, not a preference.** Recorded in
   full under "Known-shaky" below.

**A third change, later in the same loop: the floating cluster became a disclosure.** The owner
asked for the links grouped behind one expandable button, closed by default, opening only on
click/tap — explicitly not on scroll or hover. So the scroll listener added in the previous
revision is **gone entirely**, not layered underneath the toggle: `FloatingContact` now registers no
listener at all, which is what makes "opens only on click" structural rather than a promise. R8b and
R8a were rewritten accordingly (R8a is now the disclosure's ARIA contract, not the old scroll
effect's dependency array), and R9 now checks the trigger itself is absent for an unconfigured
vendor — an empty disclosure would advertise links that do not exist.

**A fourth change, and the only one outside this slice's subject: the landing hero's carousel
column (`#715`).** The grid carried `lg:items-center`, an explicit override of CSS grid's `stretch`
default, which sized the right column to its own content and left dead space above and below the
panel. Restoring `items-stretch` plus `h-full` down the panel/track/slide chain lets it fill the
column. It ships here at the owner's request, has its own issue, and is specified as R19 so it is
validated rather than slipping through — but it is unrelated to social and contact links, and
`plan.md` says so explicitly so the PR is not quietly carrying an unexplained layout change.

Everything else matches the spec as written.

## Known-shaky areas

**A real defect was found by the owner before validation ran, and it was a SPEC defect.** The first
WhatsApp number entered through the admin form was `07448894146` — UK national format. The original
R5 said "digits-only, 7 to 15 digits", which that satisfies, so the parser accepted it and stored
it. `https://wa.me/07448894146` then **opens WhatsApp and starts no chat**, with no error in the
browser, no error in the log, and nothing to distinguish it from the feature simply not working. An
E.164 number never begins with `0`. R5 and the parser now both reject a leading zero with a message
naming the fix, and the stored dev row was repaired to `447448894146`.

Two transferable things here. **The requirement was wrong, and the code implemented it faithfully**
— a unit suite written against that requirement passed 25/25 while the feature was broken in the
only way that mattered. And **the failure mode is silent**: this is the same shape as the Workers AI
`result.response` bug in `CLAUDE.md`, where a plausible-looking value produced no error and no
output. Any future field whose value is handed to a third-party URL scheme deserves a live click,
not just a passing parser test.

**Nothing else has been exercised against a running app.** This slice was built and unit-tested only;
no row of `validation.md` has been run. The whole live surface — footer render, floating-control
position, admin form, refusal path — is unverified. `validation.md`'s "Before you start" carries
four ordered steps, and step 1 matters most here: **query `VendorDomain` for the real hostnames
rather than hardcoding them**, because both live rows depend on reaching the right vendor.

**The migration is applied to the dev branch only.** Staging is one migration behind until
`npm run db:migrate` runs against it. Skipping that is a hard crash that reads like a code defect.

**GAP-011 fired again — seventh occurrence.** `prisma migrate dev` generated `DROP INDEX` for all
three hand-authored `pg_trgm` indexes. `--create-only` caught it before anything reached the
database; the drops were removed and the migration carries a note. Verified afterwards by SQL
assertion that all three indexes are still present and all three columns exist. **If a future
migration on this branch is generated, expect the same and read the SQL again.**

**The trigger's clearance is arithmetic, not observation.** `bottom-24`/`sm:bottom-28` was derived
from the cart button's classes and an estimated height, and it now only has to clear that one
button — the disclosure fixed the footprint problem the three-button stack had, since a collapsed
panel takes no layout space. What is still unobserved is the panel **expanded** with all three links
on a short phone viewport, with the cookie banner also showing. R8's (a) compares class values,
which is a proxy; a real page at both breakpoints is what would prove it.

**The expand/collapse behaviour has no automated coverage.** R8b and R8a are source reads plus
manual browser checks. Nothing in the suite renders the component or clicks the trigger. The two
paths worth trying by hand are the keyboard one — with the panel closed, Tab should move from the
trigger straight past the links, because collapsed links carry `tabIndex={-1}` — and confirming
that scrolling and hovering never open it, which is the specific behaviour the owner asked for and
the reason the scroll listener was removed rather than kept.

**A grep in this file's own validation row was wrong and would have failed a correct build.** R8's
(d) originally used `#[0-9a-fA-F]{3,8}`, which matches the issue references in the component's doc
comment (`#407`, `#405`, `#239`) because digits are hex characters — it reported two hex-literal
violations against a file containing no colour at all. Corrected to a six-digit anchor, with a
sanity check against `StorefrontConfigForm.tsx` (8 real placeholders) so the pattern is known to
still bite. This is the `CLAUDE.md` hygiene-grep trap, and it is worth knowing it fired inside this
slice's own spec.

**Two vendors, and only one of them exercises each path.** Aheed will have values set during
validation; SriMart's three stay `null`. R9's absence check must run against **SriMart** — an
absence grep against Aheed cannot distinguish "hidden" from "this vendor's own data happens not to
contain the string".

**`tests/repository-transaction-safety.test.ts` failed under full-suite load and passed in 1.99s
alone.** That is `#538`, a known 5000ms timeout, not a regression from this slice — though this
slice does add content to `lib/repositories/vendor.ts`, which that test parses.

**Suite totals moved to 118 files / 1585 tests** (from 117/1557). The new test file carries 25; the
remaining 3 come from filesystem-driven `it.each` tests picking up the two new components. The
**first** full run reported 103 files / 1463 tests with 15 files silently never executed — the
documented forks-worker trap. Check the file count, not the exit code.

## Fix (after /validate)

**R15 failed — a real doc defect, not a validation.md wording problem.** `/validate` found
`docs/store-admin-guide/admin-tabs-guide.md`'s Storefront section still describing the social and
WhatsApp links as appearing "in the footer," in two sentences, unchanged since before the mid-loop
redesign moved every link into the floating disclosure and emptied the footer of social content
(see "Deviations" above). `components/layout/StorefrontChrome.tsx`'s `<footer>` contains only
copyright and Terms/Privacy — `FloatingContact` renders as a sibling, not inside it — confirmed live
by extracting the rendered `<footer>` from `npm run preview` output and finding zero facebook/
instagram matches inside it. This is the exact class of defect R15's own validation row names
(`#634`'s four false capability claims in this same file): the code moved mid-loop and this doc
section was never revisited to match.

**Fixed by editing the two sentences** to describe the actual control (a single expandable button,
bottom-right, above the cart button, revealing whichever links are configured) and to say plainly
that nothing social renders in the footer, rather than by loosening R15 or validation.md's check —
the row was right, the doc was wrong. No `requirements.md`/`validation.md` change. Re-ran
`npm run kms:build-index` (content changed, front-matter did not — the same asymmetry §KMS docs of
`CLAUDE.md` describes) and `tests/operator-doc-coverage.test.ts` (74/74). No observable app
behaviour changed, so no `CHANGELOG.md` entry.

**Suite totals at re-validation: 118 files / 1589 tests**, not the 1585 recorded above — four more
than this file claimed, with no uncommitted change to explain it at the time it was checked. Traced
to the three post-Build commits (`b028e10`, `ea34a78`, `c92a17f`) each amending this file in place
without re-running the full suite after their own edits; `b028e10` alone added 22 cases to
`tests/social-contact-form.test.ts`. Recording the real number here rather than chasing the exact
per-commit delta further.
