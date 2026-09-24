---
id: local-dev-playbook
title: "Local Development Playbook — Windows shell, and proving things live without a browser"
audience: [dev]
type: runbook
status: approved
version: "1.5.0"
updated: 2026-09-24
visibility: internal
summary: How to work on this repo on Windows and prove a change works live — shell/encoding traps, process cleanup, vitest forks-pool, silently-ignored TZ overrides, the dev machine's BST clock as a free browser timezone override, curl-driven server actions, grep-vs-rendered-HTML pitfalls.
tags: [local-dev, windows, validation, playbook]
---

# Local Development Playbook

Two situations bring a reader here: **"I am running something on this machine"** and **"I need to
prove this works without a browser."** Runtime failures that survive a green build belong in
`runtime-pitfalls.md`; per-layer authoring rules belong in `app-conventions.md`.

Every entry below was paid for once. `CLAUDE.md` carries the one-line imperative; this file carries
the evidence and the recipe.

## Windows shell and file encoding

- **Never rewrite a repo file through `Get-Content` / `Set-Content` on Windows PowerShell 5.1.**
  `Get-Content -Raw` reads with the system ANSI codepage unless `-Encoding utf8` is passed, so every
  non-ASCII character in a UTF-8 file (this repo's docs are full of em-dashes and arrows) is decoded
  as mojibake and then written back **double-encoded** — `—` becomes `â€”` throughout. It also
  rewrites line endings, so a two-line version bump lands as a 147-line diff. Hit in P6b2 bumping
  front-matter on `architecture.md`, `tech-stack.md` and ADR-003; caught only because the diff
  size was implausible, and fixed by `git checkout --` on all three and redoing the edits with the
  Edit tool. **Use the Edit/Write tools for file content; keep PowerShell for git, npm and gh.**
- **Check `git diff --numstat` after any scripted file rewrite.** A line count far larger than the
  edit is the cheapest possible signal that an encoding or line-ending rewrite happened.
- **`format:check` failing on dozens of untouched files was the `core.autocrlf` artifact — FIXED in
  PR #328 (`.gitattributes`, #327), so it is no longer the expected explanation.** `eol=lf` now pins
  the working tree, which is what makes local Prettier agree with CI; `git add --renormalize .`
  produces zero changes and `prettier --check .` passes across the repo. **If `format:check` fails
  on files you did not touch today, treat it as real drift and read the diff** rather than reaching
  for the old ritual. Should a line-ending question genuinely resurface, the way to settle it is
  still to write a file's committed blob (`git show HEAD:<file>`) out with LF endings and run
  `prettier --config .prettierrc.json --check` on it — **in a directory prettier can resolve the
  config from, or passing `--config` explicitly**, since checking a copy in a temp directory
  silently falls back to prettier's *defaults* and reports failures that mean nothing. CI on Linux
  remains the authority.
- **Anchor patterns when grepping an env file.** `DATABASE_URL` ends in `BASE_URL`, so a filter for
  `BASE_URL` prints the Neon connection string, password included (#175). Prefer `^SEED_` over
  `SEED_`, and prefer printing keys over lines.
- `gh` args containing double quotes break native argument parsing in PS 5.1 (`accepts 1 arg(s),
  received 8`). Write the body to a file and use `--body-file`.
- **In Git Bash specifically (not PowerShell), a `gh` string argument that starts with `/` gets
  silently rewritten to a Windows path before `gh` ever sees it** — MSYS's automatic POSIX-path
  conversion fires on any argument that merely looks path-shaped, with no way to tell from the
  argument alone that it was meant as literal text. Hit live in P2.6 slice 6's `/document`
  (2026-09-05): `gh issue create --title "/staff/search-synonyms is unlinked from the staff hub…"`
  (filed as `#602`) shipped with a title of `C:/Program Files/Git/staff/search-synonyms is
  unlinked…` — silently wrong, no error, and easy to miss since only the leading segment changes.
  Prefix the command with `MSYS_NO_PATHCONV=1` (as already used elsewhere in this repo's own
  scripts) to suppress the conversion, and always read back a filed issue/PR's title after creating
  it from Git Bash if it starts with `/`. Fixed after the fact via `gh issue edit`, same env-var
  prefix.
- **`npx tsx -e "<multi-line script>"` fails silently on this Windows setup the moment the script
  imports an installed package (e.g. `@prisma/client`) — no stdout, no stderr, exit 0, even with an
  explicit `.catch()`/`.finally()` around every promise.** It isn't a working-directory problem
  (the shell's cwd is already the repo, so `node_modules` resolves fine) — a script that does
  nothing but `console.log('hello')` via `-e` works, but the same process with a real `import`
  produces no output at all, indistinguishable from success without independently confirming the
  side effect happened. Hit in the dev-environment slice's `/validate` (R10's live isolation
  check, inserting a marker `HealthCheck` row into a Neon branch) — three silent `-e` attempts
  before switching to a real `.ts` file. **Write the script to a file inside the repo (so module
  resolution and `tsx`'s own error reporting both work) and run `npx tsx path/to/script.ts`
  instead of `-e`** for anything beyond a trivial one-liner; delete the scratch file afterward.
- **Stopping `npm run preview` does not stop `npm run preview`.** The task-runner kill only ends the
  top-level `npm` process; `opennextjs-cloudflare preview` chains into `wrangler dev`, which spawns
  its own `wrangler.js` and `workerd.exe` children that survive the parent's termination on Windows.
  The next `npm run preview` then fails the build with `EBUSY: resource busy or locked, rmdir
  '.open-next\assets'` — the orphaned `workerd.exe` still has the directory open. Killing just
  `workerd.exe` is not enough either; the whole chain (`npm run-cli.js run preview` →
  `opennextjs-cloudflare … preview` → `npm … exec wrangler dev` → `wrangler.js dev` →
  `wrangler-dist\cli.js dev` → `workerd.exe` ×2) must go. Find it with
  `Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'" | Select
  ProcessId,CommandLine` (match on the repo path and `wrangler dev` in the command line, not just
  the image name — other unrelated `node.exe`/`workerd.exe` processes are common) and
  `taskkill /F /PID <every id>` before retrying the build.
- **Never pipe a live-writing script's output through `head` (or anything else that closes the pipe
  early).** The reader closing the pipe sends the writer SIGPIPE, which can kill the process **before
  its own cleanup section runs** — indistinguishable from the command completing normally except for
  a shorter-than-expected output. Hit at `/validate` for #411/#412 (2026-08-27):
  `npx tsx scripts/verify-repository-injection.ts | head -30` — a script that creates real rows and
  deletes them itself at the end — got cut off mid-run and left one `__verify-`-prefixed product, two
  images and one category behind in the dev database, found only by a follow-up query and cleaned up
  by hand before the real (untruncated) run could be trusted. **Redirect to a file and `Read` it, or
  let it print in full** — never truncate a script's stdout with a command that can close the pipe
  before the writer's own exit path runs.
- **Never run `npx vitest run` concurrently with another heavy build on this machine — vitest
  reports `exit 0` while whole test files silently never execute.** Under load its forks pool fails
  to start workers (`Error: [vitest-pool]: Failed to start forks worker for test files ...` /
  `[vitest-pool-runner]: Timeout waiting for worker to respond`), and those files are counted as
  **unhandled errors, not failures** — so the process still exits 0 and a casual reading of the
  summary looks like a pass. Hit 2026-09-02 during `#539`'s Build: the suite was launched alongside
  `next build --webpack` for `kms/site-internal` and reported every file it ran as passing, with a
  non-zero `Errors` line, exit 0. Run alone seconds later, the same tree ran **ten more files and
  ninety more tests** that had never executed at all.
  **How to detect it without a recorded baseline.** This file used to carry the suite's expected
  file and test totals so a reader could spot a shortfall. That number went stale roughly twenty
  times, and each time the staleness silently disabled the very detection it existed to provide —
  a validator trusting a stale total reads a genuine ten-file shortfall as roughly right. It was
  removed deliberately (`#584`); **do not reintroduce a hardcoded total here or anywhere else.**
  The trap is detectable without one, because it is a property of a *pair* of runs rather than of
  an absolute number:
  1. **Compare two runs of the same tree.** Run the suite, note the `Test Files` and `Tests`
     counts, then run it again with nothing else running. If the second run reports **more** files
     or more tests than the first, the first run hit the trap. The tree did not change; only the
     load did.
  2. **Read the `Errors` line, not just the exit code.** Any non-zero `Errors` count accompanied by
     `Failed to start forks worker` or `Timeout waiting for worker to respond` is this trap
     regardless of what the pass counts say.
  3. **Check for orphaned processes before re-running**
     (`Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'"`). An empty
     result means simply re-running is the right move.
  **Two refinements from hitting it again during `#491`'s Build:** it fired immediately after a
  heavy `kms/site-internal` build even with the suite run **alone**, so "concurrently" understates
  it — a build that has just *finished* is enough; and that run exited **1**, not the `exit 0`
  described above, so a non-zero exit carrying `Failed to start forks worker` is this trap rather
  than a real failure. This is distinct from **`#538`**, which is a genuine 5000ms timeout on
  `tests/repository-transaction-safety.test.ts` under full-suite load (green in about 2s in
  isolation) and reports as a real *failure*; that test parses every file in `lib/repositories/`,
  so expect it to keep creeping as that directory grows. CI's Linux runners are the authority for
  both.
  **A full DATABASE is indistinguishable from broken code in a test summary.** Three live-DB test
  files once failed for an afternoon with `could not extend file because project size limit
  (512 MB) has been exceeded` — nothing to do with their own subject matter — because an oversized
  reference-data import had filled the dev Neon project. If a live-DB test fails with a message
  that has no relationship to what it tests, check `pg_database_size(current_database())` against
  the project ceiling before debugging the test.
  **Three test files are guarded with `it.skipIf(!process.env.DATABASE_URL)`** and report as
  **skipped**, not run, in CI — so CI's own summary legitimately runs fewer tests than a local run
  with a real `DATABASE_URL`. That is expected, not a shortfall.

## A `TZ` override is silently ignored on Windows when the value contains a slash

Measured 2026-09-19 (`#363`/`#811`). **On this project's Windows dev machine, `TZ=Europe/Berlin cmd`
does not set `process.env.TZ` at all** — the variable arrives `undefined` and the process runs in
the system zone, so a command written to prove timezone-independence proves nothing and reports a
confident pass.

```
TZ=UTC              node -e "..."   ->  env=UTC          resolved=UTC                  # works
TZ=Pacific/Auckland node -e "..."   ->  env=undefined    resolved=Europe/London        # IGNORED
TZ=PST8PDT          node -e "..."   ->  env=PST8PDT      resolved=America/Los_Angeles  # works
TZ=EST5EDT          node -e "..."   ->  env=EST5EDT      resolved=America/New_York     # works
```

`env TZ=… cmd` and a preceding `export TZ=…` behave the same way — it is the slash, not the syntax.

- **Use slash-free values locally**: `UTC`, `PST8PDT`, `EST5EDT`. They propagate and do change the
  zone, including what `Intl` resolves.
- **Any IANA name works on the Linux CI runner**, so a CI-only two-zone run is sound. The trap is
  local only.
- **Assert the override took effect rather than trusting it.** Compare the UTC **offset**
  (`-new Date().getTimezoneOffset()`), not the zone name: `TZ=PST8PDT` legitimately resolves as
  `America/Los_Angeles`, so a name comparison reports a change that did happen as if it had not.
  `specs/2026-09-19-p363-vendor-timezone/verify-vendor-timezone.ts` prints an `AMBIENT ZONE` line
  doing exactly this.

This matters beyond time zones: it is the same class as the vitest forks-pool trap above — a
command that cannot fail is worse than no command, because it is recorded as evidence.

## A browser-side timezone bug needs no DevTools override on a UK dev machine, March–October

Used at `#363`/`#811`'s `/ship` (2026-09-19) to reproduce and disprove the live BST slot-picker
defect in a real Chrome tab, no CDP `Emulation.setTimezoneOverride`/Sensors panel required.

`Intl.DateTimeFormat().resolvedOptions().timeZone` and `-new Date().getTimezoneOffset()` reflect the
**OS's** timezone, and this repo's Windows dev machine's OS zone is `Europe/London`. From late March
to late October that is **British Summer Time, UTC+1** — the exact non-UTC offset a client-side
timezone defect needs to reproduce against a UTC Worker. No override, no `TZ` env var (that only
reaches Node's own process, not Chrome), no DevTools Sensors panel: just open the page in the normal
browser and read a submitted value.

Confirmed the discriminator directly rather than by eyeballing a slot list: against **currently-
deployed (pre-fix) staging**, selecting today's date and reading
`document.querySelector('input[name="fulfilmentDate"]').value` returned
`"2026-09-18T23:00:00.000Z"` — the browser's local midnight serialised as an instant, one day behind
what was clicked. The identical action against the fixed branch (`npm run preview`, then staging
again post-merge) returned the bare day `"2026-09-19"`. A `javascript_tool`/console read of the
hidden field's `value` is enough; no network capture needed, since (as built) date selection here is
client state, not a per-date server round trip.

**This stops working outside BST** (late October–late March, when the dev machine's own zone is
GMT/UTC+0 and no longer discriminates) — fall back to a real DevTools Sensors timezone override, or
to the server-side two-`TZ`-run technique above, at that time of year.

## Live-testing staff panel server actions without a browser

- **A plain progressive-enhancement server-action form (`<form action={someServerAction}>`, no
  client component) can be submitted with `curl`, with no browser and no JS runtime at all** —
  that is the entire point of building it that way. The rendered HTML carries the target as a
  hidden field named `$ACTION_ID_<hash>` (empty value) inside a `multipart/form-data` form whose
  own `action` attribute is empty (posts to the current page URL). Fetch the page once, grep for
  `\$ACTION_ID_[a-f0-9]*` paired with the row's other hidden fields (e.g. `refusalId`), then
  `curl -X POST <page-url> -H "Cookie: <session>" -H "Origin: <same-origin>" -F '$ACTION_ID_<hash>=' -F 'refusalId=<id>'`
  reproduces exactly what a no-JS browser submit would send. Used this way to drive
  `/staff/payments`'s reconcile/recover actions end-to-end against a real dev database and a real
  Stripe test-mode session for `#454`'s `/validate` and `/ship`, with no Chrome extension
  available for part of that session.
- **A `useActionState`-bound form (still a real `<form action={...}>`, but wrapped in a client
  component so a field error can render from the action's return value) is ALSO curl-drivable, but
  carries a different hidden-field shape than the plain progressive-enhancement pattern above —
  grepping for `\$ACTION_ID_` on one finds nothing.** Instead of a single `$ACTION_ID_<hash>` field,
  React renders `$ACTION_REF_<N>` (empty value), `$ACTION_<N>:0` (JSON `{"id":"<action-hash>",
  "bound":"$@1"}`), `$ACTION_<N>:1` (JSON-encoded previous state, e.g.
  `[{"error":null,"field":null,"notice":null}]`), and `$ACTION_KEY` (a per-row nonce that changes
  every render, so it must be re-read from a fresh page fetch before each submission, not reused
  across requests). Confirmed live in P2.6 slice 3 (#566) driving `/staff/search-synonyms`'s
  add/edit/remove/approve/reject forms end-to-end with no Chrome extension available — same
  `curl -F` approach as the plain-form case, just with these four fields instead of one, plus the
  named fields the action actually reads (e.g. `alias`, `canonical`, `intent`).
- **A `useActionState` result can come back correctly WITHOUT ever appearing as literal text in the
  curl response — check the flight payload, not just the rendered HTML, before calling a row
  failed.** Confirmed at `#116`'s `/validate` (2026-09-19) on `/shop-your-list`'s two stacked
  `useActionState` forms (match, then save): the **match** action's new state (`lines`) fed a large
  subtree (the whole review list) and rendered as literal `<li>`/`<select>` HTML in the same
  response — a plain `grep` against it worked exactly like the plain-form case above. The **save**
  action's new state (`{"outcome":"capped"}`) fed one small conditional `<p>` in the same client
  component, and did NOT appear anywhere in the rendered HTML — only inside a
  `self.__next_f.push([2,[{"outcome":"capped"}, ...]])` script tag, React's client-side "form
  replay" payload for a no-JS submission, which a curl-only client never executes. The action DID
  run correctly (confirmed independently: no 21st row written, `outcome` correctly `"capped"` in
  that payload) — the visible sentence just needs a JS-executing client to materialise. **Parse the
  `self.__next_f.push(...)` JSON for the action's own state field when a `useActionState` result's
  visible text comes up empty**, rather than concluding the UI failed to render it.
- **A plain-quote regex against a fetched RSC page (`grep -oE '"name":"([^"]+)"'` or the JS
  equivalent) silently matches nothing, even when the data is right there** — the page's flight
  payload is JSON serialised *inside* a JS string literal, so every quote is backslash-escaped
  (`\"name\":\"...\"`, two characters, not one) in the raw response body. Hit at `#877`'s `/validate`
  (2026-09-24), narrowing a category page to `?packSize=1-KILOGRAM` with no Chrome extension
  available: a `/"name":"([^"]+)"/g` regex against the saved HTML returned zero matches on a page
  that visibly (per a plain `curl | grep` text search moments earlier) held real product names,
  reading as "the filter returned nothing" rather than "the regex is checking for the wrong bytes."
  Confirmed by locating the same product by a plain substring search first (which matches, because
  it looks for exact bytes) and only then reading the surrounding backslash-escaped context.
  **Match the literal escaped marker (`\\"name\\":\\"` in a JS string, i.e. `\"name\":\"` as actual
  file bytes) instead of a bare-quote regex** when parsing a saved RSC response for structured
  field values.
- **A server action a client component calls directly (`await someAction(arg1, arg2)`, e.g.
  `addToCart`) rather than binding to a `<form action={...}>` is ALSO curl-drivable, but as a
  wholly different wire protocol — neither `$ACTION_ID_<hash>` nor the `useActionState` four-field
  shape appears anywhere in the HTML, because there is no form for React to render one into.** Next
  ships these as a POST to the current page URL carrying a `Next-Action: <action-id>` header (the
  action's id — the same stable build-time hash `.next/server/server-reference-manifest.json` maps
  to a `filename`/`exportedName`, per the existing entry below) with a plain-text body that is a
  JSON **array** of the call's positional arguments, in order — `["<productId>", 1]` for
  `addToCart(productId, delta)`. No cookie-derived nonce, no per-render key: `curl -b <cookies>
  -X POST <page-url> -H "Next-Action: <id>" -H "Content-Type: text/plain;charset=UTF-8" --data-raw
  '["<arg1>", <arg2>]'` reproduces the call exactly, and the response is the page's normal RSC
  payload (parse it for the effect, e.g. re-fetch the affected page rather than trying to read a
  return value out of the stream). Used this way in `#612`'s `/validate` to add a real product to a
  guest cart (`features/cart/add-to-cart.ts`'s `addToCart`) with no browser and no client JS, so
  `features/checkout/place-order.ts`'s delivery-postcode refusal (R24) could be driven end-to-end
  against a real cart rather than stopping at the cheaper storefront-header signal (R23).
- **`npm run preview`'s `next build` step type-checks every `.ts` file its tsconfig includes —
  which, by default, means the repo root — so a type error in a scratch validation script placed
  at the repo root (rather than under `lib/`, `app/`, etc.) fails the WHOLE build**, not just that
  script. `npx tsx path/to/scratch.ts` alone won't catch this, because `tsx` only type-checks (or
  rather doesn't type-check at all, by default) the file it runs — the failure only surfaces on
  the next `next build`/`npm run preview`, wasting a full OpenNext build cycle. Run `npx tsc
  --noEmit` once after writing a repo-root scratch script and before relying on it inside a
  preview cycle.
- **Better Auth's session validation is bound to the Host/Origin a request declares, not just to
  a valid session cookie** — replaying a genuine session cookie (captured signing in at
  `127.0.0.1:8787`) against the same server with a spoofed `Host: srimart.localhost:8787` header
  (to simulate reaching a second local vendor domain without a second real hostname) is correctly
  rejected with `401`/`Invalid origin`, not silently accepted. This is Better Auth's own
  cross-origin protection firing, not a bug in this app's vendor-scoping. **Signing in fresh under
  the spoofed host doesn't work either** — Better Auth's `trustedOrigins` only lists this
  project's real dev/staging/production hosts, so a made-up local alias is rejected outright with
  `Invalid origin` at sign-in. Cross-tenant **write** scoping can still be proven without ever
  switching hosts: submit the action against a row belonging to a *different* vendor while signed
  in and already on your own vendor's host — the scoping lives in the query's `where` clause, not
  in which host served the page, so this exercises the exact same guard a real cross-tenant attack
  would hit. Cross-tenant **read/list** scoping (a page never showing another vendor's rows) is
  provable the same way, from one side only: confirm your own vendor's list excludes a row you
  know belongs to someone else, rather than trying to view the other vendor's own list.
- **A `grep` pattern written against a literal string (e.g. a doc title containing `&`) can silently
  false-negative against a page's real, rendered HTML, because HTML-escapes it as `&amp;` — and a
  `validation.md` row's own example command is not exempt from this.** Hit at `#633`'s `/validate`
  (2026-09-06): the spec's own suggested check, `grep -c 'Platform & Technical Admin Guide'
  runbook-admin.html` / `runbook-platform.html`, was meant to print `0` then a non-zero count,
  proving the platform-admin guide is withheld from a vendor admin and shown to a platform admin.
  Run literally, it printed `0` for **both** files — not because the feature was broken, but because
  Next's rendered output always carries `Platform &amp; Technical Admin Guide`, so the unescaped
  pattern never matches the positive case either. Confirmed the feature actually worked by re-running
  with the escaped string; the code was correct, the validation doc's example command was not.
  **Before treating a grep-against-live-HTML row as failed (or as passed) on the strength of a
  zero/non-zero count, check whether the literal string being matched contains `&`, `<`, `>`, `"`, or
  `'`** — any of which a browser or React's server renderer will escape — and grep for the escaped
  form instead of assuming the spec's literal example command is already correct.
- **The same failure shape recurs without any HTML escaping involved — a `grep` command in
  `validation.md` can false-positive on its own explanatory prose or its own file-inclusion flags,
  not just on rendered output.** Hit twice in the same slice's `/validate` (accessibility
  remediation, 2026-09-07, `#649`/`#650`). First: a row asserting `lib/form-classes.ts` carries no
  `"use server"` **directive** used `grep -c "use server" lib/form-classes.ts`, expecting `0` — it
  returned `1`, because the file's own doc comment *explains* it is not a `"use server"` file, and
  that sentence contains the phrase being searched for. Second: a row asserting zero
  `focus:outline-none` occurrences added `--include=*.ts` (needed to reach `lib/form-classes.ts`,
  which isn't `.tsx`) and collaterally re-included `app/(admin)/staff/runbook/docs.ts` — the
  generated KMS bundle the same file's own "Before you start" section had already said to exclude,
  which legitimately quotes this very spec's prose discussing the phrase. Neither was a real
  violation; both were confirmed by hand (`grep -n '^"use server"'` for the first; adding
  `| grep -v "runbook/docs.ts"` for the second) and the `validation.md` rows corrected at
  `/document` rather than left to mislead the next reader. **A grep-based validation row proves
  what it claims only when the pattern can't also match a comment, docstring, or generated bundle
  explaining or quoting the very thing being searched for** — anchor to a directive's actual
  position (`^"use server"`, not a bare substring) or explicitly exclude the generated artefact,
  the same way the `&`-escaping case above requires checking the pattern before trusting the count.
- **A whole-page grep for an attribute that has a legitimate reason to appear MORE THAN ONCE on the
  same page proves nothing about the one occurrence a requirement actually cares about.** Hit at
  the storefront-browse-discovery-completion `/validate` (2026-09-09, `#694`): a requirement that
  `CollectionNav` render with no `aria-current="page"` inside it specified its check as
  `grep -c 'aria-current="page"' cat.html` printing `0` — but a real category page also renders
  `DepartmentScroller` and `SubcategoryLinks`, both of which correctly carry `aria-current="page"`
  on the active department/subcategory tab, for reasons that have nothing to do with
  `CollectionNav`. The literal command would never print `0` on any category page, regardless of
  whether `CollectionNav` itself was built correctly. The underlying requirement was genuinely met
  — confirmed by narrowing the check to the specific element (`grep -oE '<nav aria-label="Collections".{0,1500}'`
  and inspecting that no `aria-current` appears inside it) — so this was a spec-wording defect, not
  a code defect: the check counted the whole page when the requirement was about one landmark
  inside it. **The same rule as the two entries above, one level up**: a grep-based validation row
  proves what it claims only when the pattern (or, here, the *scope* being searched) can't also
  match something unrelated that has its own legitimate reason to look identical — scope the search
  to the specific element a requirement is actually about, not the whole rendered page, whenever
  more than one thing on that page could plausibly carry the same attribute.
- **`curl -b jar.txt -c jar.txt` combined with a custom `-H "Host: ..."` header can silently fail
  to persist a `Secure`-flagged `Set-Cookie` for a multi-label local hostname, while the same
  pattern works fine for a single-label one — with no error, just an empty jar file.** Hit at
  `#748`'s `/validate` (2026-09-14), testing both seeded local vendor hosts under `npm run
  preview`: `curl -c jar.txt -H "Host: localhost:8787" http://127.0.0.1:8787/...` correctly wrote
  the returned `aheed_cart` cookie into the jar (domain `localhost`, `Secure` flag preserved), but
  the identical pattern against `-H "Host: srimart.localhost"` produced a jar containing only the
  file header comments — no cookie line at all — even though the response's `Set-Cookie` header was
  present and well-formed. Every subsequent request replaying that empty jar got a **fresh**
  guest-cart id each time (the server correctly treats "no cookie" as "no identity" and mints a new
  one), which reads as "the cart never persists" rather than "curl never saved the cookie." The
  fix is to skip the jar entirely for a multi-label local host: extract the value straight out of
  the `Set-Cookie` response header (`grep -i "^set-cookie: <name>" | sed -E 's/^[Ss]et-[Cc]ookie:
  ([^;]+);.*/\1/'`) and pass it back explicitly on every later request as `-H "Cookie: <name>=<value>;
  ..."`, rather than relying on `-b`/`-c` at all. This matters specifically for this repo's own
  documented two-vendor testing pattern (`validation.md`'s "Two vendors matter here" rule) — Aheed's
  local host is single-label (`localhost:8787`) and works fine with a jar; SriMart's
  (`srimart.localhost`) does not, so a validator who only smoke-tested the jar approach against
  Aheed would trust it for both.
- **Replaying an existing record's edit form by hand must name every checked box explicitly, not
  just the field(s) the row under test cares about — an absent field is indistinguishable from an
  unchecked one.** Hit at `#876`'s `/validate` (2026-09-23), driving `/staff/products/<id>`'s
  `useActionState` update form for R16's live cycle: the hand-built submission set `quantity` and
  `expectedRestockDay` (the two fields R16 was actually proving) but omitted `isActive`, which the
  real form always sends as `"on"` when its checkbox is checked. `checkbox()` in
  `lib/catalogue-form.ts` treats an absent field as unchecked by construction (the same rule R6/R8
  document for the feature itself) — the product silently went inactive. Not a code defect; the fix
  was re-submitting with every field the real form renders checked, not only the ones under test.
  Confirm this by diffing the edit page's actual `defaultChecked`/`defaultValue` set against the
  hand-built field list before trusting a live edit's result, the same discipline the `$ACTION_KEY`
  four-field recipe above already requires for the action metadata.
- **A department/category page's real product count can be far larger than what a validator expects
  to page through by eye, entirely from prior scale-testing seed data — not a defect in whatever
  slice is being validated.** Hit at `#876`'s `/validate` (2026-09-23): `/categories/snacks` legitimately
  holds 224 active products, almost all `gen-*`-slugged rows from the catalogue-depth-and-scale seed
  (`#489`), so a real seeded product (`date-bites`) never appeared on page 1 and a plain
  `curl`/`grep` of the category page found nothing — reading as a broken facade rather than
  ordinary pagination. Confirmed the true product count with a direct DB query before concluding
  anything was wrong, then narrowed the live page itself with the product's own price
  (`?minPrice=X&maxPrice=X`, a filter the category route already supports) to isolate it in one
  request rather than paging through cursors by hand. Worth checking a department's real row count
  before trusting a "product not found on this page" result as a code defect, on any dev checkout
  that has run the scale-testing seed.

