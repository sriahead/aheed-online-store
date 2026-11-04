# Client Setup: info- sender suggestion from the store's subdomain (requirements)

Closes `#1419`. Replaces the email rule of `#1403`'s R12
(`specs/2026-11-02-forward-dropdown-default-sender/`) in `suggestSender`
(`lib/client-setup/sender-suggestion.ts`). The one-line version of `plan.md`: suggest
`info@<custom domain>`, else `info-<platform subdomain>@<platform domain>`, else
`info-<slug>@<platform domain>`.

Terms: the **platform domain** is the `platformDomain` argument, trimmed and lower-cased. A
**custom host** is an eligible host (no port, not `localhost`, not `*.localhost`, not an IPv4
literal) that is neither the platform domain nor under it, exactly as `customHosts` computes today.

R1. When the store has at least one custom host, `suggestSender` returns
`{ name: vendorName, email: "info@<domain>" }`. `<domain>` is chosen as today: the alphabetically
first canonical custom host, else the alphabetically first custom host, with one leading `www.`
removed. This holds whether or not a platform domain is given.

R2. Otherwise, when a platform domain is given and at least one eligible host has the form
`<label>.<platform domain>`, where `<label>` is non-empty and contains no `.`, `suggestSender`
returns `{ name: vendorName, email: "info-<label>@<platform domain>" }`. The host is chosen by the
same tie-break as R1: the alphabetically first canonical such host, else the alphabetically first
such host. The match is case-insensitive and the label is returned lower-cased.

R3. Otherwise, when a platform domain is given, `suggestSender` returns
`{ name: vendorName, email: "info-<slug>@<platform domain>" }`. This covers no hosts, only dev
hosts, a host equal to the platform domain, and only multi-level platform hosts
(`a.b.<platform domain>`).

R4. With no custom host and no platform domain, `suggestSender` returns `null` (unchanged).

R5. No string in `lib/client-setup/sender-suggestion.ts` produces an `orders@` or `orders-`
address, and its JSDoc owner-decision note states the R1–R3 rule with the date 2026-11-04 and
`#1419`.

R6. `isRoutableSenderDomain` and `isOwnDomainHost` keep their signatures and behaviour. Every
existing `isRoutableSenderDomain (R13)` and `isOwnDomainHost` test in
`tests/client-setup-sender-suggestion.test.ts` passes, unmodified apart from address local-parts in
fixtures.

R7. `tests/client-setup-sender-suggestion.test.ts` has a `suggestSender` case for each of:

- R1 with a canonical custom host;
- R1 `www.` stripping;
- R1 canonical over alphabetical;
- R1 alphabetical fallback;
- R1 with no platform domain;
- R1 beating a platform subdomain in the same host list;
- R2 single subdomain;
- R2 canonical over alphabetical;
- R2 alphabetical fallback;
- R2 case-insensitivity;
- R3 for a host equal to the platform domain;
- R3 for a multi-level platform host;
- R3 with only dev hosts;
- R3 with no hosts;
- R4.

R8. `docs/developer-portal/env-setup.md` and `docs/platform-admin-guide/platform-admin-guide.md`
state the R1–R3 rule, and neither describes the suggested sender as `orders@<…>`, `orders-<…>@` or
`orders-<store>@`.

R9. `CHANGELOG.md` updated (Gate 4).

R10. `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check`
and `npm run kms:validate` all exit 0 after this slice.
