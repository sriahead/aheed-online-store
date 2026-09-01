# Remove staging hosts from production's VendorDomain (requirements / acceptance criteria)

Issue **#519**, found while verifying #518's production seed. Production's `VendorDomain` held two
staging hosts alongside the two correct production ones, all four marked canonical. They are inert
today only because staging's Worker resolves against staging's database; `lib/tenant.ts` treats a
match as authoritative, so they are a latent mis-tenanting. See `plan.md`.

R1. `scripts/remove-vendor-domains.ts` requires `--env-file <path>` and at least one
    `--remove <host>`; invoked without either it exits non-zero and prints a usage line naming both.

R2. Without `--apply` the script performs no writes and says it is a dry run, reporting how many
    rows it would remove.

R3. Before acting the script prints the resolved database host and every current `VendorDomain` row
    with its vendor and `isCanonical` value, marking those it would remove. It prints no connection
    string and no credential.

R4. The script matches `--remove` values case-insensitively against stored hosts, and reports a
    named host that has no matching row rather than failing.

R5. The script exits non-zero without deleting anything if the requested removals would leave any
    vendor with no canonical `VendorDomain` row.

R6. After running with `--apply` against production, `VendorDomain` contains exactly two rows:
    `aheedfoodcentre.nocaped.com` for `aheed-food-centre` and `srimart.nocaped.com` for `srimart`,
    each canonical, and no host containing `staging`.

R7. After the removal, `https://aheedfoodcentre.nocaped.com/` and `https://srimart.nocaped.com/`
    each return HTTP 200 and serve their **own** vendor's page — not `/coming-soon`, and not each
    other's.

R8. Staging's `VendorDomain` is unchanged by this slice and contains no production host.

R9. `prisma/seed.ts` and `lib/tenant.ts` are unmodified by this slice.

R10. `CHANGELOG.md` updated (Gate 4).

R11. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
