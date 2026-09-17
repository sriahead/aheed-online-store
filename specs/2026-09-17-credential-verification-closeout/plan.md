---
id: credential-verification-closeout-plan
title: "Credential verification closeout (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-17
visibility: internal
summary: "Closes the three defects found while resolving the R2 credential outage: a verifier blind to the deployed Worker, an undocumented deploy wedge, and an unvalidated brand-colour write path."
tags: [credentials, storage, deployment, validation]
---

# Credential verification closeout (plan)

**Goal:** make the next credential rotation verifiable. Tonight's R2 rotation (`#755`) needed four
steps beyond what the repository documents, and the two tools that should have caught the gap —
`scripts/verify-storage-credentials.ts` and `CLAUDE.md`'s deployed-version section — each reported
or implied that everything was fine while both production Workers served a revoked key. This slice
closes that, and fixes a third defect found in the same session.

## Why this exists

`CLAUDE.md`'s Storage section currently contains both of these claims, eight lines apart:

- `npx tsx scripts/verify-storage-credentials.ts` "is the one command that answers `do these
  credentials actually work?`"
- a file-only rotation "leaves the deployed Worker on the old value"

Both are written down. Together they are a contradiction: the file knows the credential lives in
two stores, and then names a command that reads one of them as the definitive answer. On
2026-09-16 that combination reported **ACCEPTED for all three environments** at a moment when the
deployed staging and production Workers were both still serving the revoked key, because the new
values sat in Cloudflare versions that had been created but never deployed.

This is the failure shape `CLAUDE.md` already records in another section — *a rule that names its
own enforcement must be checked against that enforcement, or it documents a guarantee nobody
provides*. Repairing the script without repairing the sentence would leave the trap standing.

The same investigation surfaced a second, louder consequence of the undeployed-version state, and
a third defect unrelated to credentials but found while verifying `#713` in the same session.

**Scope (this slice):**

### Part 1 — the verifier can see only one of two stores (`#780`)

`scripts/verify-storage-credentials.ts` probes R2 with values parsed out of env files. Two gaps:

- Its `TARGETS` list holds `.env`, `secrets/staging.vars` and `secrets/production.vars`.
  **`.dev.vars` is absent**, and per `CLAUDE.md`'s config-precedence rule that is the file which
  wins under `npm run preview`. A rotation that updates `.env` and forgets `.dev.vars` passes this
  script cleanly and leaves local preview broken.
- It has no knowledge of what the deployed Worker carries. Cloudflare bakes secret values into an
  immutable version, so "the newest version is not the deployed version" is exactly the state that
  made tonight's failure invisible, and it is readable through the REST API.

Both are fixed here. The deployed-version check covers **staging and production only**: `.env`
carries no `CLOUDFLARE_API_TOKEN` (verified) and dev has no deployed Worker, so there is nothing to
compare for the dev row.

### Part 2 — the deploy wedge is undocumented (`#781`)

`CLAUDE.md`'s `#767`/`#771` section documents the *quiet* half of an undeployed version: a binding
missing from the running Worker while `wrangler secret list` shows it present. It does not document
the loud half, which is worse operationally.

Both `deploy-staging.yml` and `deploy-production.yml` open their deploy step with
`wrangler secret put`, and wrangler refuses that call outright while an undeployed version is
newest:

```
Secret edit failed. You attempted to modify a secret, but the latest version of your
Worker isn't currently deployed.
```

So a single dashboard secret edit fails **every subsequent deploy on that environment**, including
deploys carrying unrelated fixes, until someone runs `wrangler versions deploy` on the pending
version. The error names secrets rather than deployment state, so the natural reading is "the token
is wrong". Both deploy reruns failed this way on 2026-09-16 before the cause was understood.

This part is documentation. The recovery is one command once you know it; the cost was entirely in
not knowing it.

### Part 3 — `saveStorefrontTheme` has two defects (`#782`)

Found while verifying `#713` (which is closed — its own branding-form scope is complete and live).
`saveStorefrontTheme` in `features/admin/storefront.ts` is a different write path to the same eight
colour columns, added later by `#714`, and it was never covered:

- It validates only the theme **name**. The eight `BrandPrimitives` reach
  `lib/repositories/vendor.ts`'s `saveVendorTheme` and are written verbatim with no hex check. It
  is a real server action, so a browser-side control would not close it.
- Its duplicate-name branch tests `err?.code === "P2002"`, but that write runs through
  `getPrisma()` — the HTTP adapter — which surfaces a unique-constraint violation as the raw
  Postgres SQLSTATE `23505`. The intended message is therefore unreachable, and a duplicate name
  produces "An unexpected error occurred saving the theme." A repository-wide sweep confirms this is
  the **last** direct `P2002` comparison in application code; every other match is prose.

Severity here is lower than `#713`'s and the spec says so deliberately: `brandStyle()`'s R7
fail-safe (shipped by `#713`) replaces a malformed primitive with the system default before it
reaches the contrast clamp, so this is data integrity, not an admin lockout.

**Deliberately excluded:**

- **No schema change.** The eight colour columns stay `String`, as `#713` decided.
- **No new dependency**, and no change to either deploy workflow's structure. Part 2 is
  documentation rather than a CI guard: making the pipeline detect an undeployed version is a
  larger argument about where that check belongs, and it should be made on its own evidence rather
  than carried in on the back of a documentation fix.
- **No second validator for Part 3.** `lib/brand-colour-form.ts` already exists and already has the
  right error shape; this slice gives it a primitives entry point rather than writing a parallel
  implementation.
- **No change to `applyStorefrontTheme`.** It copies an existing stored theme rather than accepting
  caller input, so validating the write path is what closes the hole.
- **No rotation of any credential.** `#755` and `#219` are both closed; this slice changes tooling
  and documentation only, and touches no secret in any store.
- **Not widening the deployed-version check beyond storage.** The same staleness would affect any
  Worker secret, but this script's subject is S3 credentials and keeping its scope honest is the
  point of Part 1.

**Open items carried forward:**

- Whether the deployed-version divergence deserves a CI guard rather than a script warning stays
  open, and is the natural follow-up if Part 1's warning ever fires in anger.
- The per-environment Cloudflare token split recommended by `#219` step 3 was considered and not
  adopted; `secrets/staging.vars` and `secrets/production.vars` still hold one shared token. Out of
  scope here, and recorded on that issue.
