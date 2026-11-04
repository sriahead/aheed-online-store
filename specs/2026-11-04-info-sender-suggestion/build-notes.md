# Client Setup: info- sender suggestion from the store's subdomain (build notes)

## What changed and why

- `lib/client-setup/sender-suggestion.ts`: `suggestSender` now has three branches (R1 custom host,
  R2 one-level platform subdomain, R3 slug). Two private helpers were added:
  `platformSubdomainLabel(host, platformDomain)`, which returns the label or `null`, and
  `pickHost(hosts)`, which picks canonical first, then alphabetical. `pickHost` replaced the inline
  sort that the custom-host branch already had, so R1 and R2 share one tie-break by construction.
  `customHosts`, `isRoutableSenderDomain` and `isOwnDomainHost` are untouched.
- `tests/client-setup-sender-suggestion.test.ts`: the `suggestSender` describe block was replaced
  with 15 cases, one per R7 bullet and labelled `R1:`…`R4:`. The `isRoutableSenderDomain` and
  `isOwnDomainHost` blocks are byte-identical; only the file header comment changed.
- Docs:
  - `docs/developer-portal/env-setup.md`: the suggested-sender section is now a numbered
    first-match list. The staging-subdomain caveat says `info@`. Sanity step 7 for `#1403` gives
    `info-<subdomain>@merqify.com`.
  - `docs/platform-admin-guide/platform-admin-guide.md`: "Set the sender" is updated to match.
- `CHANGELOG.md`: a `### Changed` entry. The branch was cut from `docs/1409-followups`, so it also
  carries two post-ship `#1409` doc commits, `07263b93` and `52675c40`. The entry says so.

## Decisions taken during the build

- **Labels are filtered on the trimmed, lower-cased host**, and so is the custom-host path. A
  subdomain host is only considered if `isEligibleHost` passes, so `corner.localhost:8787` can never
  produce a label.
- **The R2 filter re-derives the label after `pickHost`.** It calls `platformSubdomainLabel` twice
  rather than carrying the label in the mapped object, which keeps `pickHost` typed on `StoreHost`.
  The cost is negligible, since a store has a handful of hosts.
- Test fixtures keep `corner` / `platform.test` (neutral, as before).

## Deviations from the spec

None.

## Known-shaky areas

- **Which host is canonical in each real database is unverified.** The spec expects staging to
  suggest `info-aheed-staging@merqify.com` and production `info-aheed@merqify.com`, but that depends
  on the `VendorDomain.isCanonical` rows. If both of a store's platform hosts are canonical (or
  neither is), the alphabetical tie-break picks `aheed` over `aheed-staging` on either database.
  Check the Sender card on staging after deploy.
- Validation runs in the same session that built this, per the owner's under-60%-context practice,
  so it is not independent.
