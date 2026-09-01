# Remove staging hosts from production's VendorDomain (validation)

Run from a fresh context. R6 and R7 describe production state produced during Build; they are
verification queries, not repeatable mutations — the rows are already gone, so re-running the
removal is a no-op that reports "nothing to do".

> **Testing strategy.** The script's guards (usage, dry-run default, last-canonical-host refusal)
> are checked by running it — the dry run writes nothing, so they can be exercised against a real
> environment safely. The outcome is then checked against the live sites, because the failure this
> slice risks is not a wrong row count but a vendor that stops resolving.

## Preconditions

- `secrets/production.vars` and `secrets/staging.vars` present. **Confirm the resolved host before
  trusting any production result** — only the host proves the target (`CLAUDE.md`, P5a).
- If a request fails with `UND_ERR_CONNECT_TIMEOUT` against an IPv6 address, re-run with
  `NODE_OPTIONS=--dns-result-order=ipv4first`. `curl` was unusable from the sandbox during this
  slice (returned `000`); Node's `fetch` worked.

| Req | How to verify |
|---|---|
| R1 | Run the script with no arguments, then with only `--env-file secrets/production.vars`. Both exit non-zero with a usage line naming `--env-file` and `--remove`. |
| R2 | Run with `--env-file secrets/production.vars --remove aheedfoodcentre.nocaped.com` and **no** `--apply`. It prints `DRY RUN`, reports it would remove 1 row, and changes nothing — re-query `VendorDomain` and confirm the row is still there. |
| R3 | From that same run's output: the `database:` line shows a host only, and every current row is listed with vendor and `canonical=`. Grep the output for `postgresql://` and for the value of `S3_SECRET_KEY` — both must return nothing. |
| R4 | Run a dry run with `--remove NOT-A-REAL-HOST.example.com`. It reports "no row for ... — nothing to remove" and exits 0 without error. |
| R5 | Run a dry run naming **both** of a vendor's canonical hosts, e.g. `--remove aheedfoodcentre.nocaped.com`. Because Aheed now has only that one canonical row, the script must exit non-zero with the "would leave vendor ... with no canonical host" refusal. This is the load-bearing guard; confirm it fires. |
| R6 | Query production: `VendorDomain` has exactly 2 rows — `aheedfoodcentre.nocaped.com` / `aheed-food-centre` and `srimart.nocaped.com` / `srimart`, both `isCanonical: true`, and `SELECT count(*) ... WHERE host LIKE '%staging%'` returns 0. |
| R7 | Fetch `https://aheedfoodcentre.nocaped.com/` and `https://srimart.nocaped.com/`. Each returns 200, neither redirects to or renders `/coming-soon`, and their `<title>` differs — Aheed's names Milton Keynes groceries, SriMart's names Reading tech. **Checking only the status code is not enough**: `/coming-soon` also returns 200. |
| R8 | Query staging's `VendorDomain`: it holds `localhost`, `staging.aheedfoodcentre.nocaped.com` and `srimart-staging.nocaped.com`, and no host matching `aheedfoodcentre.nocaped.com` or `srimart.nocaped.com` exactly. |
| R9 | `git diff origin/staging -- prisma/seed.ts lib/tenant.ts` produces no output. |
| R10 | `git diff origin/staging -- CHANGELOG.md` shows an entry referencing #519. |
| R11 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` all exit 0. CI on the PR is the authority. |

## Notes for the validator

- **R7 is the row that would catch a real mistake.** A wrong deletion does not corrupt data
  visibly — it makes `lib/tenant.ts` fail to resolve a host, and the vendor silently serves
  `/coming-soon` with a 200. Compare the page content, not the status.
- **R5 must be exercised, not reasoned about.** It is the only thing standing between a typo in the
  `--remove` list and a live outage, and it is now trivially testable because each vendor has
  exactly one canonical host.
