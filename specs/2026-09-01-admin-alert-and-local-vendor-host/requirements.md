# Blocking admin alert, and a second local vendor by host (requirements)

Two small, independent fixes with a shared property: each makes something that was **unverifiable**
verifiable. Issues **#507** and **#514**, both filed from `/validate` passes where they blocked the
verification rather than the feature.

R1. `components/staff/BackfillImagesButton.tsx` contains no call to `alert()`, and
    `grep -rn "alert(" components/staff/ "app/(admin)/"` returns no result-reporting `alert` in the
    admin panel.

R2. That component reports a successful run inline in an element with `role="status"`, including the
    processed count when it is non-zero.

R3. It reports a failure inline in an element with `role="alert"` — both a non-OK response (using
    the route's `error` field, which is what 401/403 return) and a thrown/network failure.

R4. The button is re-enabled after a run completes, so a second attempt is possible without a
    reload.

R5. Tests cover R2–R4 and assert that `alert` was **never** called in any of those paths.

R6. `lib/tenant.ts`'s `getCurrentVendorIdOrNull` resolves a `VendorDomain` row whose `host` includes
    a port (e.g. `srimart.localhost:8787`) when the request's `Host` header matches it literally.

R7. That fallback runs **only** when the raw host differs from the port-stripped hostname, so a
    request to a portless host issues exactly one `vendorDomain.findUnique` — unchanged from before
    this slice.

R8. The port-stripped lookup still takes precedence: if it matches, the ported fallback is not
    queried at all.

R9. The ported fallback compares a lower-cased host, matching how `upsertVendorDomain` stores rows.

R10. Tests cover R6–R8 with no database.

R11. `CHANGELOG.md` updated (Gate 4).

R12. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
