# Remove staging hosts from production's VendorDomain (build notes)

Written at the end of Build, before the Clear. Branch `fix/stale-vendor-domains`, cut from a
freshly-fetched `origin/staging` at `da4d961`.

Small slice: one new script, one data correction in production, no application code touched.
As with the two slices before it, the production half ran live during Build and is verified below.

## What changed and why

**`scripts/remove-vendor-domains.ts`** (new) is the only file added. `--env-file` plus one or more
`--remove <host>`, dry run unless `--apply`. Prints the resolved database host and the whole current
table before acting.

**Explicit hosts, not a pattern.** The obvious implementation is "delete anything whose host
contains `staging`". That is the kind of rule that quietly deletes a legitimate row in an
environment nobody had in mind when it was written — a future preview host, or a vendor whose real
domain happens to contain the word. Naming each host on the command line puts the blast radius in
the shell history where it can be reviewed.

**The last-canonical-host guard is the point of the script**, not a nicety. Removing a vendor's only
canonical row does not corrupt anything visibly — it makes `lib/tenant.ts` fail to resolve that
host, and the vendor silently serves `/coming-soon` **with a 200**. A typo in a `--remove` list is
therefore a live outage that looks like a successful run. The guard refuses regardless of arguments.

## What was actually found

Production held four rows, all `isCanonical: true`, so each vendor had **two** canonical hosts:

| vendor | host |
|---|---|
| aheed-food-centre | `aheedfoodcentre.nocaped.com` |
| aheed-food-centre | `staging.aheedfoodcentre.nocaped.com` |
| srimart | `srimart.nocaped.com` |
| srimart | `srimart-staging.nocaped.com` |

**The reverse direction was checked before assuming it was one-way**, as `#519` asked. Staging holds
`localhost`, `staging.aheedfoodcentre.nocaped.com` and `srimart-staging.nocaped.com` — correct for
staging, with no production hosts. So the contamination is one-directional and staging needed no
change.

## Decisions taken during the build

**No seed-side guard was added.** `#519` suggests `upsertVendorDomain` might refuse a host that does
not match the environment it is connected to. That is a reasonable idea and deliberately not built
here: the seed has no reliable way to know which environment it is pointed at — a Neon connection
host does not say "this is staging" — so the guard would need a new explicit signal, which is its
own design decision rather than a line in this script. Left in `#519`'s discussion.

## What ran live during Build

| Row | Result |
|---|---|
| R1 | no args, and `--env-file` only: exit **1** with the usage line |
| R2 | dry run without `--apply`: prints `DRY RUN`, writes nothing, row still present afterwards |
| R3 | output shows `database:` as a host only; no connection string, no credential |
| R4 | `--remove not-a-real-host.example.com`: "no row for ... nothing to remove", exit **0** |
| R5 | `--remove aheedfoodcentre.nocaped.com` (Aheed's only canonical host): **exit 1**, refused with "would leave vendor ... with no canonical host" |
| R6 | production now holds exactly 2 rows, both canonical, no host containing `staging`; a re-run reports "nothing to do" |
| R7 | both live sites 200 and serving their **own** tenant — titles "Aheed Food Centre — ... Milton Keynes" and "SriMart — ... Reading", neither `/coming-soon` |
| R8 | staging's table unchanged, no production hosts |
| R9 | `git diff` on `prisma/seed.ts` and `lib/tenant.ts` empty |
| R11 | lint, typecheck, format:check green; full suite run before commit |

**Exit codes were re-checked without a pipe.** The first pass read `$?` after piping through
`tail`, which reports the pipe's status rather than the script's — R5 appeared to exit 0 when it
actually exits 1. Redirect to a file and check, per `CLAUDE.md`'s note about not truncating a
script's output.

## Environment obstacles — not defects in this diff

**`curl` is unusable from this sandbox for the live-site check**: `curl -o /dev/null -w "%{http_code}"`
returned `000` for both production hosts while Node's `fetch` returned 200 for the same URLs
moments later. R7 was verified with `fetch`. Combined with the IPv6 failures recorded in the two
previous slices, treat sandbox egress as unreliable and confirm a negative result a second way
before believing it.

## Known-shaky areas

- **R7 checks the two production hosts only.** Nothing verifies that a host which *should not*
  resolve (say, a removed staging host pointed at production's Worker) now correctly falls through
  to `/coming-soon` — that host does not route to the production Worker at all, so there is nothing
  to request.
- **The orphaned objects and rows question is untouched.** This slice removed mapping rows only; no
  storage or product data was involved.
