# KMS — Schema & Validator (requirements / acceptance criteria)

Scope of this first slice: the front-matter contract and its validator only — the foundation
everything else (`build-index.ts`, `assemble.ts`, the two Nextra sites, CI gate wiring) depends on.
See `plan.md` for the full design; those pieces are follow-up work, not this slice.

R1. `kms/schema/frontmatter.ts` exports a Zod `FrontMatter` schema matching `plan.md` §3 exactly:
    `id`, `title`, `audience`, `type`, `status`, `version`, `updated`, `visibility`, `summary`,
    `tags` (required, `tags` defaults to `[]`); `owner`, `related` optional. `visibility` has no
    default — a doc must declare it explicitly, never silently defaulting to `public`.
R2. `trackFor(fm)` derives `Track` from `audience` (customer → `customer-help`, else staff →
    `staff-ops`, else `internal-eng`) so track can never disagree with audience.
R3. `kms/schema/validate.ts` walks `**/*.md(x)` (excluding `node_modules`, `.next`, `.open-next`),
    parses each file's front-matter, and validates it against `FrontMatter` when present.
R4. Files with **no** front-matter block are reported as a warning list, not a hard failure — most
    existing docs (`specs/`, `docs/`, `CLAUDE.md`) don't have front-matter yet; backfilling them is
    separate follow-up work, not blocked on this slice.
R5. Files **with** a front-matter block that fails schema validation are a hard failure: the script
    exits non-zero and prints the file path + Zod error.
R6. `npm run kms:validate` runs the validator locally with human-readable output (pass/fail count,
    per-file errors, list of front-matter-less files).
R7. Unit tests (`tests/kms-frontmatter.test.ts`) cover: a valid front-matter block parses;
    `visibility` is required (no default-to-public); a malformed `id` (uppercase/spaces) is
    rejected; `trackFor` derives the right track for each audience case.
R8. Not in scope for this slice (explicitly deferred): `build-index.ts`, `assemble.ts`, the
    `site-internal`/`site-public` Nextra apps, `gates.yml`/`deploy-docs-*.yml` wiring, and
    backfilling front-matter onto existing docs.
