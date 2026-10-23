# Colourful, vendor-themed, provider-agnostic icon system (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
> 
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Setup (read before any row)

**Which rows apply to which PR.** Run every row tagged with the PR under validation and with every
earlier tag (`requirements.md` lists the tag on each requirement). A row that cannot run for want of a
file the PR was not meant to add is "not applicable to this PR", never a pass.

**Table cells and pipes.** Inside a table cell a literal pipe is written `\|` (GitHub renders it as a pipe). When a command below shows `\|` between alternatives or before `wc`, type a plain `|`.

**Nothing here writes to a database.** Rows that need a running server use `npm run preview` against
the **dev** database only. Before any Prisma CLI or Node script, run
`for v in DIRECT_URL DATABASE_URL; do if printenv "$v" >/dev/null 2>&1; then echo "$v SET"; fi; done`.
If it prints a name, prefix every command with `env -u DIRECT_URL -u DATABASE_URL`. This slice's rows
touch no Prisma command, so the check is a precaution.

**Named test files** (the builder creates these exact names so a validator with no memory can find them):
`tests/icon-generator.test.ts`, `tests/icon-generated-data.test.ts`, `tests/icon-registry.test.ts`,
`tests/icon.test.tsx`, `tests/icon-lucide-parity.test.ts`, `tests/icon-imports.test.ts`,
`tests/icon-tone-contrast.test.ts`, `tests/department-illustrations.test.tsx`,
`tests/icon-lucide-manifest.test.ts`, `tests/department-scroller.test.tsx` (P1), `tests/verify-icon-markup.test.tsx`. Run vitest alone and capped: `npx vitest run --maxWorkers=4 <files>`.

**BASE checkout and the two servers.**

```
BASE="$(git log --diff-filter=A --format=%H -1 -- specs/2026-10-22-icon-system/requirements.md)^"
git worktree add ../icon-base "$BASE"
# the worktree has no untracked config: copy it
cp .env .dev.vars ../icon-base/ && (cd ../icon-base && npm ci && npm run db:generate)
```

Only one `npm run preview` can hold port 8787. Run the BASE capture to completion, stop it (kill the
whole `node`/`workerd` chain, or the next build fails with `EBUSY`), then repeat at HEAD. The SriMart
host is `srimart.localhost:8787` (`lib/tenant.ts`'s host-with-port fallback). **Use
`demo-customer@example.com`, `demo-store-admin@example.com` (Aheed) and `demo-srimart-admin@example.com`
with the `DEMO_ACCOUNT_PASSWORD` from `.dev.vars` only** (`.env` holds a different value and returns a
clean 401 that looks like a broken auth path). Prefix any Git Bash command that has a path-like
argument with `MSYS_NO_PATHCONV=1`.

**Path lists used by R34 and R35.**

- Storefront, Aheed (`PATHS_A`): `/`, `/categories`, `/categories/fruit-veg`, `/search?q=rice`, `/cart`,
  `/login`, `/register`, `/help`, `/privacy`, `/products/bananas-1kg`.
- Storefront, SriMart (`PATHS_S`): `/`, `/categories`, `/categories/sri-electronics`, `/search?q=cable`,
  `/cart`, `/login`, `/register`, `/help`, `/privacy`, `/products/sri-usb-c-cable-2m`.
- Signed in, Aheed customer (`PATHS_CUST`, `demo-customer@example.com`): `/account`, `/account/orders`,
  `/account/lists`, `/account/loyalty`, `/account/favourites`, `/quick-shop`, `/shop-your-list`.
- Staff, Aheed store admin (`PATHS_STAFF_A`, `demo-store-admin@example.com`): `/staff`, `/staff/products`,
  `/staff/orders`, `/staff/categories`, `/staff/reports`.
- Staff, SriMart admin (`PATHS_STAFF_S`, `demo-srimart-admin@example.com`): `/staff`, `/staff/products`.

**Preconditions found by `#1226` (2026-10-23), which are the validator's to check, not the build's.**
(1) Node on Windows cannot resolve `srimart.localhost`; use a hosts-file entry or a DNS preload through
`NODE_OPTIONS` (R61 documents both). (2) `demo-srimart-admin@example.com` returned 401 because its dev-database
password hash predates `DEMO_ACCOUNT_PASSWORD`; the owner repairs it (this validation never writes to a
database). Check it first: `curl -sS -o /dev/null -w '%{http_code}' -X POST http://srimart.localhost:8787/api/auth/sign-in/email -H 'content-type: application/json' -H 'origin: http://srimart.localhost:8787' -H 'x-forwarded-proto: http' -d '{"email":"demo-srimart-admin@example.com","password":"<DEMO_ACCOUNT_PASSWORD>"}'`
prints `200`. If it prints 401, the SriMart staff pair of R35 is UNVERIFIED.
**A cloud session cannot run R34 and R35** (no `.env`, `.dev.vars` or `secrets/`; the egress proxy refuses
the staging hosts). They run on the owner's machine, as `#1226` did, and the result is posted on the pull
request. A cloud validation reports them UNVERIFIED and runs every other row.

**Bundle measurement** (R37), run in the repository root after `npx opennextjs-cloudflare build` (it runs
the Next build, so one build gives both figures). The Worker figure is what Cloudflare would upload, not
the entry shim `.open-next/worker.js` (2 KB), which would pass any regression:

```
find .next/static -name '*.js' -print0 | xargs -0 -n1 sh -c 'gzip -9 -c "$0" | wc -c' | awk '{s+=$1} END{print s}'
npx wrangler deploy --dry-run --outdir /tmp/wr-out 2>&1 | grep 'Total Upload'
```

The second command prints `Total Upload: <N> KiB / gzip: <M> KiB`; use `M`.

Run the same two commands in `../icon-base` for the BASE figures, and compare with the figures
`build-notes.md` recorded at the start of Build (they must agree within 2 KB; if not, trust the fresh
BASE run and report the discrepancy).

**Evidence for the owner (not pass or fail).** After P3 and after P4a, capture a desktop screenshot of
`/` and `/categories` on both vendors with the preinstalled Chromium
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless --no-sandbox --window-size=1280,900
--screenshot=<file> <url>`) and attach them to the PR. They inform the owner's review; no row passes or
fails on them.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npm run kms:validate` exits 0 with `invalid front-matter (failing): 0`. Then open `specs/decisions/ADR-008-icon-system.md` and confirm, by reading, that it states all five items of R1 (build-time bundling and the CSP reason; semantic-name registry; tiers plus the illustration mechanism; functional tier Lucide only; ISC, MIT and Apache-2.0). Any missing item is a FAIL. |
| R2  | Unit | Extract the section: `awk '/^## Icons/{f=1;next} /^## /{f=0} f' specs/design-system.md > /tmp/icons-section.txt`. `grep -c 'components/icons' /tmp/icons-section.txt` is at least 1; the section contains the numbers `12`, `16`, `20`, `24`, `32`, `48` and the words `functional`, `status`, `decorative`; `grep -c 'no wrapper component' /tmp/icons-section.txt` prints `0`; `grep -cE 'directly from .?lucide-react' /tmp/icons-section.txt` prints `0`. |
| R3  | Unit | `grep -nE '@iconify/utils|@iconify-json/(lucide|ph|noto)' specs/tech-stack.md` shows four lines, each with a version matching `[0-9]+\.[0-9]+\.[0-9]+` and one of `ISC`, `MIT`, `Apache-2.0`; read the surrounding text for `devDependencies` and the statement excluding Creative Commons Attribution sets unless the owner approves. |
| R4  | Unit | `awk '/^## Design tokens/{f=1;next} /^## /{f=0} f' CLAUDE.md \| grep -n 'components/icons'` prints one bullet that also contains `ADR-008` (reading across the bullet's wrapped lines is allowed). |
| R5  | Unit | `node -e "const p=require('./package.json');for(const n of ['@iconify/utils','@iconify-json/lucide','@iconify-json/ph','@iconify-json/noto']){const v=p.devDependencies[n];if(!/^\d+\.\d+\.\d+$/.test(v)\|\|p.dependencies?.[n])throw new Error(n+' '+v)}"` exits 0; `npx vitest run --maxWorkers=4 tests/dependency-pins.test.ts` exits 0 and its source names the four versions. |
| R6  | Unit | `grep -nE '@iconify/react\|@iconify/tailwind4\|unplugin-icons' package.json` prints nothing (exit 1). |
| R7  | Unit | `npm run icons:build; echo "exit=$?"` prints `exit=0`; `git status --porcelain > /tmp/s1; npm run icons:build >/dev/null; git status --porcelain > /tmp/s2; diff /tmp/s1 /tmp/s2` prints nothing. |
| R8  | Unit | `npm run icons:check; echo "exit=$?"` prints `exit=0`. Then `cp components/icons/generated/icon-data.ts /tmp/icon-data.bak; printf ' ' >> components/icons/generated/icon-data.ts; npm run icons:check; echo "exit=$?"` prints a non-zero exit and output naming `icon-data.ts`; restore with `cp /tmp/icon-data.bak components/icons/generated/icon-data.ts`. Repeat the append, check and restore for `public/third-party-icon-licenses.txt`. |
| R9  | Unit | `awk '/^  quality:/{f=1} /^  kms:/{f=0} f' .github/workflows/quality.yml \| grep -nE 'icons:check\|typecheck'` shows both `npm run typecheck` and `npm run icons:check` inside the `quality` job. |
| R10 | Integration | `npx vitest run --maxWorkers=4 tests/icon-generator.test.ts` exits 0; read the test to confirm it spawns the real `scripts/build-icons.ts` (`child_process`) for each failure case and asserts a non-zero exit code and that stderr names both the semantic name and the id: a missing id and a duotone icon without its layer through `--registry`, and the four unsafe-markup bodies (script, foreignObject, `javascript:`, an `on*` handler) through `--registry` plus `--sets-dir` against a fixture directory, with a safe body in the same fixture exiting 0. Then run the real script by hand once against a one-entry registry with a bogus id: `npx tsx scripts/build-icons.ts --registry <that file>; echo "exit=$?"` prints a non-zero exit, and once against a fixture directory with a poisoned body (`--registry <file> --sets-dir <dir>`) likewise. |
| R11 | Unit | `npx vitest run --maxWorkers=4 tests/icon-generated-data.test.ts` exits 0; the test builds an entry for the Lucide id `check-circle-2` (an alias of `circle-check` in the pinned release, which the test asserts) and asserts its body equals the body built from `circle-check`. |
| R12 | Unit | Same file as R11: the test asserts set equality in both directions between `Object.keys(ICON_REGISTRY)` and the generated data's keys; it exits 0. |
| R13 | Unit | `npx vitest run --maxWorkers=4 tests/icon.test.tsx` exits 0; the test loops over every Lucide-provider entry and asserts the six root attributes and that no descendant element has `fill="none"` or a `stroke-width` attribute unless the installed `lucide-react` renders the same attribute on the same element (each such case is listed in the test with a reason; report the count). Also render `Icon` with `className="fill-current"` for the `heart` and `star` names and confirm the root still has `fill="none"` and the class (so the override applies on the root). **Page evidence:** after P2a, open `/products/bananas-1kg` (Aheed) with a rating present, or the favourite heart on a product card, and confirm in the HTML from R33 that the heart and star `<svg>` roots carry `fill="none"` and a `fill-` class. |
| R14 | Unit | Same file as R11: for every `ph` entry the root has `fill="currentColor"`; for duotone entries the body contains `var(--icon-secondary,currentColor)` and `var(--icon-secondary-opacity,.2)` and `grep -c 'opacity=\"\\.2\"'` over the generated file prints `0`. `npx vitest run --maxWorkers=4 tests/icon-generated-data.test.ts` exits 0. |
| R15 | Unit | `npx vitest run --maxWorkers=4 tests/icon-registry.test.ts` exits 0; the test asserts the key regular expression, the forbidden substrings and the entry shape for every entry. |
| R16 | Unit | Same file as R15 loops over every `functional` entry asserting provider `lucide` (exit 0). Type check: append a temporary line to `tests/icon-registry.test.ts` that builds a `functional` entry with `provider: "ph"` and run `npx tsc --noEmit`; it exits non-zero with an error on that line; remove the line and confirm `npm run typecheck` exits 0 again. |
| R17 | Unit | `npx vitest run --maxWorkers=4 tests/icon.test.tsx` exits 0; read the `search` test and confirm it asserts `data-icon`, `xmlns`, `focusable="false"`, `viewBox` and `width="24" height="24"`. |
| R18 | Unit | Same file: the size test asserts 12, 16, 20, 24, 32, 48 for the six tokens (exit 0). |
| R19 | Unit | Same file: one test without `label` asserts `aria-hidden="true"` and no `role`; one with `label` asserts `role="img"`, `aria-label` and no `aria-hidden` (exit 0). |
| R20 | Unit | Same file: tests assert the class is appended, `style` is merged with tone variables and `strokeWidth={1.25}` yields `stroke-width="1.25"` on a Lucide entry (exit 0). |
| R21 | Unit | Same file: the unknown-name test asserts `data-icon-fallback="true"` and no throw; run `npx tsc --noEmit` after temporarily adding `<Icon name="not-a-name" />` to a scratch `.tsx` and confirm a type error, then remove it. |
| R22 | Unit | `grep -n 'use client' components/icons/Icon.tsx` prints nothing; `grep -nE 'useState\|useEffect\|useRef\|useMemo\|useCallback' components/icons/Icon.tsx` prints nothing; `npx vitest run --maxWorkers=4 tests/icon.test.tsx tests/department-scroller.test.tsx` exits 0, and the second file renders `DepartmentScroller` (a `"use client"` component) and asserts it contains `svg[data-icon]` elements named by `categoryIconName`. (From P4a, `tests/department-illustrations.test.tsx` also renders it; it does not exist in P1.) |
| R23 | Unit | `npx vitest run --maxWorkers=4 tests/icon.test.tsx` exits 0; the tone test covers all six tones against the table in `plan.md` (class and secondary variables, including `--icon-secondary:var(--color-accent)` and `--icon-secondary-opacity:.7` for `action`, and nothing for `current`). |
| R24 | Unit | `grep -nE '#[0-9a-fA-F]{3,8}\b' components/icons/Icon.tsx components/icons/generated/icon-data.ts` prints nothing (exit 1). |
| R25 | Unit | `grep -rnE '(text\|bg\|fill\|stroke\|border)-(primary\|action\|accent\|danger)(-[a-z]+)?/[0-9]+' components/icons` prints nothing (exit 1). |
| R26 | Unit | `npx vitest run --maxWorkers=4 tests/icon-lucide-parity.test.ts` exits 0. Read the test to confirm it compares against the installed `lucide-react` export through `scripts/lib/svg-geometry.ts` (normalised geometry, tolerance 0.06), and read `LUCIDE_PARITY_EXCEPTIONS` in `tests/fixtures/icon-parity-exceptions.ts`: each entry has a reason. Report the number of exceptions (zero is expected, any other count is reported, not failed, provided each has a reason and the test passes). Also confirm `node_modules/@iconify-json/lucide/package.json` has the version pinned in `package.json`. |
| R27 | Integration | `grep -nE '^(Lucide\|Phosphor\|Noto Emoji)' public/third-party-icon-licenses.txt` shows a section for each set the registry (and, from P4a, the illustration map) uses (Lucide in P1; Phosphor from P3; Noto Emoji from P4a); for each, `curl -sS <url from that set's info.json licence url, raw form>` and `diff` the upstream text with the section's licence block, which must match verbatim (all copyright lines). Then temporarily move aside the licence file of a USED set (`scripts/icon-licences/ISC.txt` in P1; also `MIT.txt` from P3 and `Apache-2.0.txt` from P4a) and run `npm run icons:build; echo "exit=$?"` (non-zero, naming the missing file), and restore it. |
| R28 | E2E | With `npm run preview` running: `curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8787/third-party-icon-licenses.txt` and the same for `http://srimart.localhost:8787/third-party-icon-licenses.txt` print `200 text/plain`; `curl -sS http://localhost:8787/third-party-icon-licenses.txt \| grep -c 'Lucide'` is at least 1 (and `Phosphor` from P3, `Noto Emoji` from P4a). Use `MSYS_NO_PATHCONV=1` under Git Bash and drop `-o /dev/null` in favour of piping the body to `wc -c` if `/dev/null` is rewritten. |
| R29 | Unit | `npx vitest run --maxWorkers=4 tests/category-icon.test.ts` exits 0 and asserts a mapped slug returns a semantic name string and an unmapped slug returns `tag`; `grep -rn 'svg\.lucide-' tests` prints nothing (exit 1). |
| R30 | Unit | `grep -n 'lucide-react' components/staff/nav-items.ts` prints nothing; `npx vitest run --maxWorkers=4 tests/staff-nav-parity.test.ts` exits 0, and `git diff BASE..HEAD -- tests/staff-nav-parity.test.ts` shows no weakened assertion (reading the diff: a deleted or loosened `expect` is a FAIL). |
| R31 | Unit | `npx vitest run --maxWorkers=4 tests/icon-lucide-manifest.test.ts` exits 0. Independently regenerate the list at BASE from the worktree: `npx tsx scripts/list-lucide-imports.ts --root ../icon-base > /tmp/base-icons.txt` (that is the command named in the fixture's `producedBy` field; it parses with the TypeScript compiler, and a line grep undercounts), then `node -e "const m=require('./tests/fixtures/lucide-icons-in-use.json');console.log(m.icons.map(i=>i.export).sort().join('\n'))" \| diff - /tmp/base-icons.txt` prints nothing and `wc -l < /tmp/base-icons.txt` prints `102`. |
| R32 | Unit | `npx vitest run --maxWorkers=4 tests/icon-imports.test.ts` exits 0; then run `grep -rlE "from ['\"](lucide-react\|@iconify[^'\"]*)['\"]" app features lib components --include=*.ts --include=*.tsx \| grep -v '^components/icons/'` which prints nothing (exit 1). Read the test to confirm its self-test feeds an in-memory violating file and expects a failure. |
| R33 | Integration | `npx tsx scripts/verify-icon-markup.ts --base http://localhost:8787 --path / 1>/tmp/out.jsonl 2>/tmp/err.txt; echo "exit=$?"` prints `exit=0`; `node -e "const l=require('fs').readFileSync('/tmp/out.jsonl','utf8').trim().split('\n');if(l.length!==1)process.exit(1);const a=JSON.parse(l[0]);if(!Array.isArray(a)\|\|!a.length)process.exit(1)"` exits 0 (stdout is one JSON line per path, so progress text is on stderr); the keys of the first element are exactly `geometry, width, height, className, ariaHidden`; no class token in the output starts with `lucide`; `npx vitest run --maxWorkers=4 tests/verify-icon-markup.test.tsx` exits 0 (it runs the real script against a local server: stdout shape, non-200 and redirect failures, sign-in headers, `--compare`). |
| R34 | E2E | Capture at BASE: start `npm run preview` in `../icon-base`; for each path of `PATHS_A` run `npx tsx scripts/verify-icon-markup.ts --base http://localhost:8787 --path <p> >> base-a.jsonl`; for `PATHS_S` against `http://srimart.localhost:8787` into `base-s.jsonl`; and with `--sign-in demo-customer@example.com:<DEMO_ACCOUNT_PASSWORD from .dev.vars>` for `PATHS_CUST` into `base-cust.jsonl` (the script at HEAD is used for every capture; run it from the HEAD checkout, pointing `--base` at the server). Stop the server. Repeat at the P2a head into `head-a.jsonl`, `head-s.jsonl`, `head-cust.jsonl`. Then `--compare base-X.jsonl head-X.jsonl; echo "exit=$?"` prints `exit=0` and `identical: 10 page(s)` for `a` and `s` and `identical: 7 page(s)` for `cust`. Also read the PR diff of `app`, `components` and `features` and confirm no migrated icon changed its `className` text and none gained a `size` prop (R58 to R60 automate that). Any difference is a FAIL unless explained by a documented, reasoned exception in `build-notes.md` that this validator agrees is purely geometry-neutral. |
| R35 | E2E | Same procedure with `--sign-in demo-store-admin@example.com:...` for `PATHS_STAFF_A` into `base-staff.jsonl`/`head-staff.jsonl`, and `--sign-in demo-srimart-admin@example.com:...` against `http://srimart.localhost:8787` for `PATHS_STAFF_S` into `base-sstaff.jsonl`/`head-sstaff.jsonl`, comparing with `--compare`: `identical: 5 page(s)` and `identical: 2 page(s)`, both `exit=0`. Run at **both** the P2a head and the P2b head; at the P2b head also re-run every list of R34 (`a`, `s`, `cust`). Run the precondition sign-in check of Setup first: a SriMart staff pair whose sign-in does not return 200 is UNVERIFIED, which does not fail P2a and does fail P2b. (Sign-in on the SriMart host needs `x-forwarded-proto: http`, which the script sends for an http base; see the playbook note.) |
| R36 | Unit | `grep -rn 'LucideIcon' app components features lib --include=*.ts --include=*.tsx --exclude=docs.ts` prints nothing (exit 1); the exclusion is the generated `app/(admin)/staff/runbook/docs.ts`, which embeds this slice's own plan text, and an absence check that matches generated copies of spec prose rewards deleting the spec; `grep -rnE 'icon[:=] ?\{?[A-Z]' components app --include=*.tsx --include=*.ts --exclude=docs.ts` prints nothing that passes an imported component as an icon value (each remaining hit must be a string literal semantic name or an `IconName`-typed field: read each one); `grep -rn 'ComponentType<{ className' components app --include=*.tsx --exclude=docs.ts` prints nothing; `npm run typecheck` exits 0. |
| R37 | Performance | Run the bundle commands of Setup at HEAD and at BASE (and compare with `build-notes.md`; build both the same way, back to back, because P1's stored baseline was 11.7 KiB wrong). After P2a and after P2b the client sum minus BASE is at most 15,360 bytes and the Worker `gzip:` figure minus BASE is at most 100 KiB; after P3 at most 25,600 bytes and 100 KiB; after P4a at most 30,720 bytes and 100 KiB. Report all four numbers per PR (P1 measured +794 bytes and +4.42 KiB). |
| R38 | Unit | For each row of the "Phase 3 surfaces" table in `plan.md`: `grep -nE "<Icon " <file>` shows the listed icons now rendered through `Icon` with the listed `tone`, `grep -n 'lucide-react' <file>` shows only functional or status icons remain (or nothing), and `node -e` over `components/icons/registry.ts` (or the registry test's dump) confirms each used name has `tier: "decorative"` and `provider: "ph"`; `git diff BASE..HEAD -- components/account components/staff components/layout/PanelNav.tsx "app/(storefront)/quick-shop"` shows only the mechanical P2 changes (no `provider` or `tone` change). Registry check: `git show <P2b head>:components/icons/registry.ts` versus HEAD's: every key present in the first has the same `provider` and `tier` in the second (a changed pre-existing key is a FAIL). |
| R39 | E2E | With the P3 build under `npm run preview`: `curl -sS http://localhost:8787/ > /tmp/home-a.html` and `curl -sS http://srimart.localhost:8787/ > /tmp/home-s.html`; for each, `node` extracts every `<svg ... data-icon="NAME">` element, and for names that the registry marks decorative asserts the element contains `--icon-secondary` and does not match `#[0-9a-fA-F]{3,8}\b`; at least three such elements exist per page (the trust strip). |
| R40 | E2E | `grep -o -- '--color-accent:[^;"]*' /tmp/home-a.html \| head -1` and the same on `/tmp/home-s.html` print two different values; `git diff BASE..HEAD --stat -- lib/vendor-theme.ts design-system/tokens/tokens.css` prints nothing. |
| R41 | Unit | `npx vitest run --maxWorkers=4 tests/icon-tone-contrast.test.ts` exits 0; read the test to confirm it covers the three primitive sets quoted in R41 (default, Forest Green, Berry Bold) and the four tokens against white, cream and the matching tint (`primary` against all three tints). |
| R42 | Unit | `npx vitest run --maxWorkers=4 tests/department-illustrations.test.tsx` exits 0; the test asserts the 16 slug-to-id pairs of R42 exactly (no extras: it compares the full object), a path for each, and `null` for `does-not-exist`. |
| R43 | Unit | `ls public/illustrations/departments \| wc -l` prints `16`; `for f in public/illustrations/departments/*.svg; do head -c 4 "$f"; grep -c 'viewBox' "$f"; wc -c < "$f"; done` shows `<svg`, a count of at least 1 and a size at most 16384 for every file; `cat public/illustrations/departments/*.svg \| wc -c` is at most 98304; `grep -lE '<script\|<foreignObject\|javascript:\|\son[a-z]+=' public/illustrations/departments/*.svg` prints nothing. |
| R44 | Unit | `npx vitest run --maxWorkers=4 tests/department-illustrations.test.tsx` exits 0; its `DepartmentScroller` test asserts `<img src="/illustrations/departments/fruit-veg.svg"` with `alt=""` and no `<svg` inside that tile for a mapped slug, and `data-icon="tag"` with no `<img` for an unmapped one. |
| R45 | Unit | Same file: asserts `h-16 w-16` on each tile, `h-12 w-12` on each illustration, and tile classes `bg-action-tint`, `bg-accent-tint`, `bg-action-tint` for zero-based indices 0, 1, 2. |
| R46 | Unit | `grep -c 'DepartmentGlyph' components/layout/DepartmentHero.tsx` is at least 2 (an import plus both uses; read the file and confirm the two uses are the no-image branch and the `ImageWithFallback` `fallback`), and `grep -nE '<Icon\b\|categoryIconName' components/layout/DepartmentHero.tsx` shows no direct corner-glyph rendering. Same test file as R44: renders `DepartmentGlyph` for a mapped slug asserting the illustration `<img>` with `h-24 w-24 md:h-32 md:w-32`, and for an unmapped slug asserting `data-icon="tag"` and `stroke-width="1.25"`; and renders `DepartmentHero` with a mapped department having no `imageKey` asserting that `<img>`. |
| R47 | Unit | Same file: renders a strip of eight mapped slugs and asserts every `<img>` has `width`, `height` and `decoding="async"`, the first six `loading="eager"`, the last two `loading="lazy"`. |
| R48 | Unit | `cp public/illustrations/departments/fruit-veg.svg /tmp/fv.bak; printf ' ' >> public/illustrations/departments/fruit-veg.svg; npm run icons:check; echo "exit=$?"` prints a non-zero exit and output naming `fruit-veg.svg`; restore with `cp /tmp/fv.bak public/illustrations/departments/fruit-veg.svg` and confirm `npm run icons:check` exits 0. |
| R49 | Unit | `npx vitest run --maxWorkers=4 tests/vendor-neutral-copy.test.ts` exits 0; `grep -rnE 'fruit-veg\|halal\|bakery\|dairy\|Aheed\|SriMart' components/icons --include=*.ts --include=*.tsx \| grep -v 'components/icons/illustrations.ts'` prints nothing (generated data and registry contain no vendor or category word; the illustration map is the one place slugs appear). |
| R50 | E2E | `git diff BASE..HEAD --stat -- next.config.mjs` prints nothing. For `/` and `/categories` on both vendors, save the HTML and run `grep -oE 'https?://[^"'"'"' )]+' <file> \| sed -E 's#(https?://[^/]+).*#\1#' \| sort -u`: every host is the page's own origin, `*.nocaped.com`, or a host that the same command prints for BASE's capture of the same page (a host new at HEAD is a FAIL); `grep -ci iconify <file>` prints `0` for each file. |
| R51 | E2E | With the P4a build under `npm run preview`: `curl -sS http://srimart.localhost:8787/categories \| grep -oE '/illustrations/departments/[a-z0-9-]+\.svg' \| sort -u` prints only `/illustrations/departments/sri-electronics.svg` and/or `/illustrations/departments/sri-home.svg`; the same command against `http://localhost:8787/categories` prints no path whose file name starts `sri-` and at least one Aheed illustration. |
| R52 | Unit | `grep -n '1223' CHANGELOG.md` prints at least one line under the `[Unreleased]` heading (confirm by reading that the line is above the first dated release heading). |
| R53 | Unit | `node -e "const p=require('./package.json');if(!p.dependencies['lucide-react'])process.exit(1)"` exits 0. |
| R54 | Regression | In order, each alone: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run icons:check`, `npm run kms:validate`, `npm run kms:check-generated`, `npm run build` all exit 0; `npx vitest run --maxWorkers=4` exits 0 or fails only `tests/add-to-cart-feedback.test.tsx:93`, in which case `npx vitest run tests/add-to-cart-feedback.test.tsx` run three times passes all three. Quote the final `Test Files` and `Tests` lines. |
| R55 | Regression | `npm run kms:build-index` after the last doc edit, then `npm run kms:check-generated; echo "exit=$?"` prints `exit=0` (it normalises the index footer, which embeds a timestamp and commit and so changes on every build; `git status` cannot be required to stay unchanged). Then `npm run kms:assemble:internal; echo "assemble=$?"` prints `assemble=0` and `(cd kms/site-internal && npx next build --webpack; echo "build=$?")` prints `build=0` (read the real status, not the exit of a pipe). |
| R56 | Unit | Run with the P1 merge `c439d3b` and the P2a head: `git diff --name-only c439d3b..HEAD -- "app/(admin)" components/staff` prints nothing; `grep -rlE "from ['\"]lucide-react['\"]" app features lib components --include=*.ts --include=*.tsx \| grep -v '^components/icons/' \| grep -vE '^(app/\(admin\)\|components/staff)/'` prints nothing (exit 1); the same grep without the last `grep -v` prints exactly 39 paths, and `git show c439d3b:<each path>` imports `lucide-react` for every one. At the P2b head `git diff --name-only c439d3b..HEAD -- "app/(admin)" components/staff` lists those 39 paths; any other path it lists is read and must be justified in `build-notes.md`. |
| R57 | Unit | For each of the five files: `grep -n 'lucide-react' <file>` prints nothing; `grep -nE 'LucideIcon\|ComponentType<\{ className' <file>` prints nothing; read the file and confirm every icon-bearing prop or field is typed `IconName` (`NavLink`'s `icon`, `ViewSwitcher`'s `views`, `COLLECTIONS`, `AddToCartButton`'s state-dependent name chosen among `loader-circle`, `check`, `plus`), that no component is held as a value, and that every `className` text and conditional (for example `animate-spin` on `AddToCartButton`) is unchanged against `git show c439d3b:<file>` (`git diff c439d3b..HEAD -- <file>`; a changed `className` literal is a FAIL). `npx vitest run --maxWorkers=4 tests/account-nav.test.tsx tests/add-to-cart-feedback.test.tsx tests/quick-shop-hub.test.tsx` exits 0 (the known flake `tests/add-to-cart-feedback.test.tsx:93` excepted, R54) and `git diff c439d3b..HEAD --stat -- tests` shows no assertion in those or any other pre-existing test weakened (read the diff; a deleted or loosened `expect` is a FAIL), and `ViewSwitcher` and `CollectionNav` (no dedicated test today) are each rendered by at least one test the P2a PR adds or already existing (`grep -rlE 'ViewSwitcher|CollectionNav' tests`; if none, the PR adds one asserting each icon's `data-icon` name). These five are in `CLASSNAME_PARITY_ALLOWLIST`, so R34 and R35 are their live proof. |
| R58 | Unit | `npx tsx scripts/verify-classname-parity.ts --base-root ../icon-base --head-root . --allow <the five paths of R57>; echo "exit=$?"` runs and prints a final `checked N file(s), M not migrated, K allowed` line on stderr (its exit code is judged by R60). Read the script and confirm it parses with the TypeScript compiler (not a line grep), pairs BASE Lucide tags with HEAD `Icon` tags in document order, compares each `className` initialiser's source text, requires HEAD props to equal BASE props minus `aria-hidden` plus `name`, and rejects `size`, `tone`, `label` and spread at HEAD. |
| R59 | Integration | `npx vitest run --maxWorkers=4 tests/verify-classname-parity.test.ts` exits 0; read it and confirm it spawns the real script (`child_process`) against temp fixture trees for each of the six cases of R59 and asserts exit code and stderr (a naming of file and line for the failures), that the identical-pair case exits 0, and that `tests/fixtures/classname-parity-allowlist.ts` is asserted equal to the five files of R57 with a reason each. Then, as a guard that the script can fail on real input, in a scratch copy of the P2a head change one `className` of one migrated file and run the script from R58 on it: non-zero, naming that file; discard the copy. |
| R60 | Integration | At the P2a head: `npx tsx scripts/verify-classname-parity.ts --base-root ../icon-base --head-root . --allow "app/(storefront)/quick-shop/page.tsx" --allow components/account/AccountNav.tsx --allow components/layout/ViewSwitcher.tsx --allow components/product/CollectionNav.tsx --allow components/cart/AddToCartButton.tsx 2>/tmp/parity.txt; echo "exit=$?"` prints `exit=0`, and `tail -1 /tmp/parity.txt` reads `checked <N> file(s), 39 not migrated, 5 allowed`. At the P2b head add `--require-migrated`: `exit=0` and `0 not migrated`. |
| R61 | Unit | `grep -nE 'srimart\.localhost' docs/developer-portal/local-dev-playbook.md` shows a sentence that names `ENOTFOUND`, says `curl.exe` resolves it, and names both remedies (a hosts-file entry; a DNS preload through `NODE_OPTIONS`); `grep -nE 'demo-accounts' docs/developer-portal/local-dev-playbook.md` shows a sentence saying `add` does not reset an existing account's password and that the sign-in then returns 401; read both for accuracy against `scripts/demo-accounts.ts`; `git diff c439d3b..HEAD -- docs/developer-portal/local-dev-playbook.md` shows `version` and `updated` bumped; `npm run kms:validate` exits 0. |
| R62 | Unit | `awk '/^## Design tokens/{f=1;next} /^## /{f=0} f' CLAUDE.md \| grep -nE 'being migrated\|do not add new ones'` prints nothing, and the same section's icon bullet contains `tests/icon-imports.test.ts`; `git show c439d3b:components/icons/registry.ts` against HEAD's: every key present in the first is present in the second with the same `provider` and `tier` (a removed or changed key is a FAIL), and `npx vitest run --maxWorkers=4 tests/icon-registry.test.ts` exits 0 (R15 for added keys). |

<!--
  One row per requirement, same order as requirements.md. A DB-touching or Workers-runtime row says
  `npm run preview` explicitly: `npm run dev` cannot load @prisma/client/wasm.
-->
