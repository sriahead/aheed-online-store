---
id: dependency-pin-ratification-plan
title: "Dependency pin ratification — make CLAUDE.md describe the pins that are actually running (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-03
visibility: internal
summary: Ratifies the Neon/Prisma adapter versions that have run in production since 2026-08-14, re-pins them exactly so npm cannot move them again, corrects three stale claims in CLAUDE.md's dependency-discipline paragraph, and adds a machine check so the rule stops being honour-system.
tags: [dependencies, pinning, prisma, neon, claude-md, ci]
---

# Dependency pin ratification (plan)

**Goal:** make `CLAUDE.md`'s dependency-discipline paragraph describe the dependency state that
actually exists, re-pin the two drifted packages exactly so a future `npm install` cannot move them,
and add the machine check that stops this paragraph going stale a fourth time. Shipping this closes
`#491` and removes a guardrail-versus-reality mismatch that has been read as current truth every
session for three weeks.

## Why this is a ratification and not a revert

`#491` was filed as *drift*. It is not. Both pins moved in a **single deliberate commit** —
`ac3f0d6` (2026-08-14, "Fix: Cloudflare Connection Exhaustion / Docs updated"):

```
-    "@neondatabase/serverless": "0.10.4",
+    "@neondatabase/serverless": "^1.1.0",
-    "@prisma/adapter-neon": "^6.19.3",
+    "@prisma/adapter-neon": "^7.9.1",
```

That is the same commit that rewrote `lib/db.ts` to introduce the hybrid `getPrisma()` (HTTP) /
`getPrismaWs()` (WebSocket) strategy which `CLAUDE.md` now documents as authoritative, and it added
the `tests/regression/test-checkout-loop.js` and `test-crash.js` harnesses alongside. It edited
`CLAUDE.md` in the same commit — but only the hybrid-strategy section, not the pin paragraph.

So the lockfile is the current artifact and the doc is the stale one. Pinning back to
`0.10.4` / `6.19.3` would revert the dependency half of a fix for a real production problem on the
strength of a paragraph nobody updated. The versions have roughly three weeks in production behind
them, spanning every P9.1 payment slice and `#454`, and `#489` wrote about 2,000 products through
this exact stack.

## Correcting the issue's own hypothesis

`#491` asks whether `@prisma/adapter-neon@7` *requires* `@neondatabase/serverless@1.x` as a peer,
"in which case the two moved together and `CLAUDE.md`'s pairing is simply stale." **It does not.**
The installed adapter declares:

```json
"dependencies": {
  "postgres-array": "3.0.4",
  "@neondatabase/serverless": ">0.6.0 <2",
  "@prisma/driver-adapter-utils": "7.9.1"
}
```

`@neondatabase/serverless` is a plain dependency, not a peer, and the range `>0.6.0 <2` is satisfied
by `0.10.4` as well. Raising both was a choice, not a constraint.

More importantly: **the adapter declares no `peerDependencies` at all.** That is precisely why
nothing warned about a 7.x adapter running against `@prisma/client@6.19.3` — npm had nothing to
check. The cross-major pairing is invisible to the toolchain by construction, which is the argument
for R5-R7's machine check rather than a doc fix alone.

**Scope (this slice):**

- `package.json` — change `"@neondatabase/serverless": "^1.1.0"` to `"1.1.0"` and
  `"@prisma/adapter-neon": "^7.9.1"` to `"7.9.1"`. Dropping the carets is the one part of `#491`
  that is unambiguously a defect whichever versions are correct: exact-pinning is the property the
  rule exists to provide, and it is currently absent for both packages. No version changes, so
  `package-lock.json` resolutions stay byte-identical and nothing is reinstalled.
- `CLAUDE.md` — rewrite the first bullet of "Dependency & version discipline" so it names the
  versions actually in use, cites `ac3f0d6` and the connection-exhaustion fix as the reason, and
  records the adapter-major-ahead-of-client state as **deliberate and known**, pointing at `#560`.
- `tests/dependency-pins.test.ts` — a new machine check asserting that the installed versions of the
  three DB-critical packages match the documented pins, and that `package.json` declares them with
  no range operator.
- `CHANGELOG.md` — Gate 4 entry.

## A third stale claim, found while rewriting the paragraph

The same bullet also says `@cloudflare/workers-types` "must match wrangler's major (v5)". Checked:
`@cloudflare/workers-types` resolves to **5.20260804.1** and `wrangler` to **4.119.0**. Their majors
are 5 and 4 — they do **not** match, so the sentence is false as written, and it is false in the
exact paragraph this slice exists to correct.

It is corrected here to record the observed pairing rather than assert a relationship this slice has
not verified. Deliberately **not** done: extending exact-pinning or the new test to
`@cloudflare/workers-types`. It is a types-only package on date-based versioning, it ships no runtime
behaviour, and widening the approved scope to it would be a different decision than the one `#491`
asked for. Carried as an open item below.

## A fourth stale claim, found while writing validation.md

`CLAUDE.md`'s Windows-shell section records the suite as **74 files / 874 tests** and teaches that
number as *the tell* for a silent worker-startup failure: "know what the suite's file/test totals
should be and treat any shortfall as a non-result." Measured directly at this slice's `/spec` on
2026-09-03, run alone on a machine with no orphaned processes, the suite is **76 files /
897 tests**. `#454`'s build notes already said 76/897; `CLAUDE.md` was never updated to match.

A recorded count that is wrong by two files does not merely age badly — it **disables the detection
mechanism the section exists to provide**, because a validator seeing 74 would read a two-file
shortfall as the documented expectation. This slice adds a test file, taking the true count to 77,
so leaving the number stale would make it wrong by three as a direct result of this work. Corrected
here under R12a for that reason.

The `/spec` run also refined the trap's description: it fired **immediately after a heavy Next
build** despite the suite running alone, and it exited **1**, not the exit 0 `CLAUDE.md` describes.
Both details are recorded in `validation.md`'s scope note so the next reader does not mistake this
trap for a real failure, or vice versa.

**Deliberately excluded:**

- **Aligning `@prisma/client` / `prisma` up to 7.x** so the adapter and client share a major. That
  is a breaking generator migration touching `engineType = "client"`, `@prisma/client/wasm`
  resolution, the documented HTTP-versus-WebSocket error-code split and the
  `updateMany`/`createMany` HTTP-adapter behaviour — every one of which needs live re-verification
  against a real database. It is filed as **`#560`** (P10) and is out of scope by explicit
  agreement at `/propose`, not by omission.
- **Any runtime code change.** `lib/db.ts` is not touched. This slice deliberately produces no
  behavioural diff — the versions being pinned are already the versions running.
- **`npm install` / lockfile regeneration.** Removing a caret from a manifest entry whose resolved
  version already satisfies the exact constraint does not change what `package-lock.json` resolves.
  R4 exists to prove that rather than assume it.
- **Exact-pinning `@cloudflare/workers-types`**, per the section above.
- **Auditing every other dependency** against the exact-pin rule. The rule names "DB drivers,
  adapters, runtime types"; this slice covers the three DB packages `#491` is about. A broader sweep
  is a different slice with a different risk profile, and `CLAUDE.md` warns that
  `npm audit fix --force` downgrades wrangler and re-breaks the OpenNext peer, so any such sweep
  must be targeted rather than audit-driven.

**Open items carried forward:**

- **`#560`** — the adapter/client major straddle. Contained by this slice's test (the pairing can no
  longer move silently) but not resolved by it.
- **`@cloudflare/workers-types` is not exact-pinned** and its documented relationship to wrangler's
  major is now recorded as observed rather than as a rule. Whether it should be exact-pinned like
  the DB packages is unresolved and unfiled; raise at `/propose` if it matters before launch.
- **`#491` and `#560` both sit on Project #2 at Backlog with no Phase**, because the board's Phase
  field offers no option past `P8`. Left blank deliberately rather than tagged `P8`, which is the
  wrong-phase state `#390` and `#416` are already in. Tracked by **`#513`**; not this slice's work.
- **Dropping the carets puts both packages on a manual-review footing** for future security patches
  — a future advisory will no longer be picked up by a routine `npm install`. That is the intended
  behaviour of an exact pin, recorded here so it is a known trade rather than a surprise.
