# P6.7 closeout & catch-up promotion (validation)

**Before any row below.** The live rows mutate a shared database. Establish the target first:

```bash
# Prints KEYS ONLY — never the values. (#175: DATABASE_URL ends in BASE_URL, so an
# unanchored grep for BASE_URL prints the Neon connection string, password included.)
grep -oE '^[A-Z_]+' secrets/staging.vars
grep -oE '^[A-Z_]+' secrets/production.vars

# Compare hosts without printing credentials:
for f in .env .dev.vars secrets/staging.vars secrets/production.vars; do
  printf '%s\t' "$f"
  grep -m1 -oE '@[^/]+' "$f" | head -1
done
```

`DIRECT_URL`'s host must equal `DATABASE_URL`'s host with `-pooler` removed, and must be the
staging project — **not** `ep-young-glitter-…`, which is production (`CLAUDE.md`).

`npm run demo:accounts` and the R8 script run in real Node, so they read `.env` / explicit process
env. `demo-accounts.ts` calls `import "dotenv/config"`, and dotenv does **not** override variables
already present in the environment — so the inline `DIRECT_URL=…` assignments below win over `.env`.

| Req | How to verify |
|-----|---------------|
| R1  | `npx tsx -e "import('./scripts/demo-accounts.ts').then(m => console.log(JSON.stringify(m.DEMO_ACCOUNTS)))"` prints a 4-element array whose 4th element is exactly `{"email":"demo-store-admin@example.com","name":"Demo Store Admin","platformRole":"CUSTOMER","vendorRole":"ADMIN"}`. |
| R2  | `npm test` exits 0. Confirm the roster test actually covers the new entry: `grep -n "demo-store-admin@example.com" tests/demo-accounts.test.ts` prints at least one line inside the `DEMO_ACCOUNTS roster` describe block. |
| R3  | With staging's direct URL in the environment and a password set, run:<br>`DIRECT_URL="$(grep -m1 '^DIRECT_URL=' secrets/staging.vars | cut -d= -f2- | tr -d '"')" DEMO_ACCOUNT_PASSWORD='<staging demo password>' npm run demo:accounts -- add`<br>Exit code is 0 and stdout contains `+ demo-store-admin@example.com (platform CUSTOMER, vendor ADMIN)`. The tool masks the connection string in its own banner (`maskUrl`, `scripts/demo-accounts.ts:157`). |
| R3a | `grep -n "Neon host" specs/2026-08-17-p6.7-closeout-promotion/build-notes.md` prints the masked host recorded at R3. Confirm it matches: `grep -m1 -oE '@[^/]+' secrets/staging.vars` — same host, and the `DATABASE_URL` host in that file is the same string with `-pooler` added. |
| R4  | In a real browser at `https://staging.aheedfoodcentre.nocaped.com`, sign in as `demo-admin@example.com` and open `/staff/team`. Walk `specs/2026-08-14-p6.7-team-role-management/validation.md` §1.1 row by row: assign `ADMIN` to `demo-customer@example.com` (Team list then shows it as Store Admin), assign `STAFF` to it after demoting (Team list shows Staff), then demote back to `USER` (succeeds). Record each observed result in `build-notes.md`. |
| R5  | Sign out; sign in as `demo-store-admin@example.com`; open `/staff/team`. Walk §1.2: assign `STAFF` to `demo-customer@example.com` (succeeds); confirm the role selector renders **no** `ADMIN` option (inspect the `<select>`/menu markup in DevTools — absence of the option in the DOM, not just its visual state); then invoke the assign action for `ADMIN` anyway and confirm the response is `{ success: false, error }` with no Team-list change; then attempt to demote `demo-admin@example.com` and confirm the same refusal shape. See `specs/sdd-workflow.md`'s Validate stage for driving a server action directly when the UI offers no affordance. |
| R6  | Sign out; sign in as `demo-staff@example.com`; navigate to `/staff/team`. The team management UI does not render — a redirect or an error page instead. Record the actual observed behaviour (which of the two) in `build-notes.md`. |
| R7  | The guard counts `VendorMembership` rows with `role: "ADMIN"` for the vendor and only fires when `auth.via === "ADMIN"` (`lib/repositories/roles.ts:80-87`), so `demo-store-admin` must be the **only** such row. Signed in as `demo-admin@example.com` (platform admin — its own `isSelfDemotion` is false, so it can do this), demote `demo-admin@example.com`'s own vendor membership to `USER`. Then sign in as `demo-store-admin@example.com` and attempt to demote itself to `USER`, then to `STAFF`; both are refused with `Cannot demote the last remaining Store Admin`. Confirm the row survived by re-running the R8 script — the membership still reads `ADMIN`. **Recovery is guaranteed two ways**: `demo-admin` retains platform-admin power regardless of its membership (`lib/auth-rbac.ts:63`), and `npm run demo:accounts -- add` re-upserts the membership idempotently. Restore it before moving on. |
| R8  | Write `<scratchpad>/audit-check.ts` importing `PrismaClient` from the bare `@prisma/client` (real Node, per `CLAUDE.md` — **not** `/wasm`) with `PrismaNeon`, querying `vendorRoleAuditLog` ordered by `createdAt desc` with `take: 25`, selecting `actorId`, `userId`, `vendorId`, `oldRole`, `newRole`, `createdAt`. Run it with staging's `DIRECT_URL` inline, as in R3. Confirm one row per change made in R4–R7, in order, with `actorId` matching the acting account's user id and `oldRole`/`newRole` matching each observed transition. Paste the (id-masked) table into `build-notes.md`. |
| R9  | Run `sed -n '/^## 1\./,/^## 3\./p' specs/2026-08-14-p6.7-team-role-management/validation.md > /tmp/p67-12.txt`, then `grep -c '\[ \]' /tmp/p67-12.txt` prints `0` and `grep -c '\[x\]' /tmp/p67-12.txt` prints a non-zero count. Read the status blockquote at the top of that file and confirm it states §1 and §2 were walked live on staging on 2026-08-17 (it currently says the opposite). |
| R10 | `sed -n '/## Smoke pass/,/^## /p' specs/2026-08-17-p6.7-closeout-promotion/build-notes.md` prints a section naming P6.5, P6.6, P6.6c and P7a, each with the checks run and their result, plus an explicit "not covered" statement. Confirm every check listed in R10 appears: storefront branding, add-to-cart + drawer, checkout to Stripe redirect, admin order dashboard + a status transition, staff inventory view, cookie banner, one legal page. |
| R11 | `test ! -e specs/Validation.md && echo gone` prints `gone`. `grep -n "docs/regression-tests.md" ARTIFACT_INDEX.md` prints a row — this is the real check, since the index builder silently excludes any file whose front-matter is missing or invalid (`kms/scripts/build-index.ts:10-12`), so an indexed row *is* proof the front-matter validates. Do **not** rely on `npm run kms:validate` exiting 0 here: it reports missing front-matter as a warning, not a failure (`kms/schema/validate.ts:7`), which is exactly why orphaned `specs/Validation.md` never tripped CI. |
| R12 | Read the P6.5 and P7a rows in `specs/roadmap.md`'s change log. Each states the slice reached `staging` by direct push with no anchoring issue or PR, and names its commit — `982eafb` for P6.5, `624a842` for P7a. Confirm those SHAs are real and match: `git log --oneline -1 982eafb` and `git log --oneline -1 624a842`. Read the rows; do not grep for the absence of `#180`/`PR #183`, since a row explaining the miscitation may legitimately still name it. |
| R13 | `gh project item-list 2 --owner sriahead --format json --limit 100 -q '.items[] \| "\(.content.number) \(.status)"' \| grep -E '^(176\|183\|184\|185\|187) '` prints `183 In Review`, `184 In Review`, `185 In Review`, `187 In Review`, `176 Backlog`. For the P6.6 item, find it by title in the same listing and confirm it exists; check its Phase is `P6` with `gh project item-list 2 --owner sriahead --format json --limit 100` and reading that item's `phase` field. |
| R14 | `npm run sdd:audit` exits 0 and its output includes `specs/2026-08-17-p6.7-closeout-promotion/` with both `✓ roadmap change-log entry` and `✓ present in ARTIFACT_INDEX.md`. |
| R15 | `npm run kms:build-index && git diff --exit-code ARTIFACT_INDEX.md` exits 0. Run this **last**, after every front-matter edit — the index embeds each artifact's `version`/`updated`, so a later bump re-stales it (`specs/sdd-workflow.md`, Clear checklist). |
| R19 | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and the added lines sit under `[Unreleased]`. Write it before opening the PR — Gate 4's CI check diffs against the PR's *current* base, so a base that moves under you can make an after-the-fact entry vanish. |
| R20 | `npm run lint && npm run typecheck && npm test && npm run format:check` — all exit 0. If `format:check` flags files this slice never touched, that is the `core.autocrlf` artifact, not drift: confirm by writing the committed blob out with LF (`git show HEAD:<file>`) and running `prettier --config .prettierrc.json --check` on it **from a directory prettier can resolve the config from**. CI on Linux is the authority. |

**R16–R18 are Ship-stage rows.** They can only be checked *after* this branch merges into `staging`
and the promotion PR merges into `main`, both of which happen after Validate. At Gate 3, report them
as **not yet applicable** with that reason — not as failures.

| Req | How to verify |
|-----|---------------|
| R16 | `gh pr view <promotion-pr> --json state,baseRefName` shows `MERGED` into `main`. `gh pr checks <promotion-pr>` shows `gates` with conclusion `success`. `gh run list --workflow deploy-production --branch main --limit 1 --json status,conclusion` shows `completed`/`success`. If a check sits `pending` implausibly long, read the run API directly (`gh run view <id> --json status,conclusion`) — `gh pr checks` has reported a finished run as pending for 56 minutes here before (`specs/sdd-workflow.md`, Ship). |
| R17 | `curl -s -o /dev/null -w '%{http_code}\n' https://aheedfoodcentre.nocaped.com/api/health` prints `200`, and `curl -s https://aheedfoodcentre.nocaped.com/api/health` returns JSON whose `db.ok` is `true`. |
| R18 | `gh issue view 186 --json state -q .state` and `gh issue view 190 --json state -q .state` both print `CLOSED`. Their Project #2 items show Status `Done` — note that moving an item to `Done` auto-closes the issue, so a `gh issue close --comment` afterwards silently drops the comment; comment first, then move. |
