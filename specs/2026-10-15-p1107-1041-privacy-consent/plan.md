---
id: p1107-1041-privacy-consent
title: "Privacy and consent honesty — banner copy, cookie settings, hashed-IP disclosure (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-15
visibility: internal
summary: "Club C (#1107, #1041): the cookie banner stops promising optional cookies that do not exist, gains a way to change a choice later, and /privacy discloses every hashed-IP record with retention rendered from one shared constant module."
tags: [privacy, consent, pecr, uk-gdpr, cookie-banner, retention, p10]
related: [user-testing-feedback-2026-10-13, p1080-1065-neutral-storage-keys, app-conventions]
---

# Privacy and consent honesty (plan)

Closes `#1107` and `#1041`, clubbed as **Club C** at the 2026-10-15 Orient
(`docs/business-analysis/user-testing-feedback-2026-10-13.md`, "Backlog clubbing — 2026-10-15").
Follows `#1065`, which made the referral cookie the storefront's only optional storage.

**Goal:** everything the storefront tells a shopper about what it stores is true. The banner names
what is really stored, a shopper can change their answer, and `/privacy` lists every record that
holds a hashed form of their network address, with retention figures that cannot drift from the
code.

## Owner rulings at Gate 1 (2026-10-15)

1. **Saved checkout details stay essential.** `CheckoutForm` keeps writing and reading
   `store_checkout_details` regardless of consent, and `/privacy` keeps listing it under essential
   storage. `#1107` part 1 is answered with **no code change** (recorded on the issue).
2. **Disclose all hashed-IP records, not only the search log** that `#1041` names.
3. **A "Cookie settings" control is in scope** (the "Related, not filed" point on `#1107`).

## What the code shows (measured 2026-10-15, branch cut from `origin/staging` at `f951bdb`)

- `components/consent/CookieBanner.tsx` says "Optional cookies help us improve site experience."
  No analytics or similar storage exists. The only optional item is `store_referral_code`.
- The banner shows only when no choice is stored. Nothing reopens it, so a choice cannot be changed
  short of clearing cookies by hand.
- `components/rewards/RewardsLauncher.tsx` clears the referral cookie on Essential Only, but it
  **stops listening** once a choice is stored at mount, and it renders only for loyalty-on vendors.
  So a shopper who later switches Accept All → Essential Only through a reopened banner would keep
  the referral cookie. The banner itself must clear it.
- **Seven tables hold a hashed IP with no user link**, and `/privacy` discloses one (the help
  assistant). Retention is a per-file `RETENTION_MS` literal:

  | Table | Repository | Retention |
  | --- | --- | --- |
  | `SearchQueryLog` | `lib/repositories/search-query-log.ts` | 90 days |
  | `AssistantConversation` | `lib/repositories/assistant-conversations.ts` | 90 days (disclosed) |
  | `AuthenticationAttempt` | `lib/repositories/auth-rate-limit.ts` | 1 hour |
  | `OrderLookupAttempt` | `lib/repositories/order-lookup-rate-limit.ts` | 1 hour |
  | `DiscountCodeAttempt` | `lib/repositories/discount-code-throttle.ts` | 1 hour |
  | `CustomerFeedbackAttempt` | `lib/repositories/customer-feedback-rate-limit.ts` | 1 hour |
  | `ListNormalisationAttempt` | `lib/repositories/list-normalisation-rate-limit.ts` | 1 hour |

- **An eighth hashed IP is user-linked:** `CustomerFeedback.ipHash` ("abuse forensics only"). It
  lives as long as the feedback and is deleted with it on erasure
  (`lib/repositories/data-rights.ts`, `customerFeedback.deleteMany`). The feedback paragraph does
  not mention it. Disclosed here too: it is the same omission, one sentence.
- **Deletion is opportunistic, not timed.** Every one of the seven sweeps runs on 1% of writes
  (`SWEEP_PROBABILITY = 0.01`). On a quiet shop a row can outlive its retention by a long way. The
  existing assistant sentence "it is deleted after 90 days" therefore overstates; the new copy says
  a record "becomes due for deletion after N and is removed by routine clean-up after that", and
  the assistant sentence is aligned to it.

## Scope (this slice)

1. **`lib/data-retention.ts` (new, client-safe, imports nothing):** the three retention figures
   (`SEARCH_QUERY_LOG_RETENTION_DAYS`, `ASSISTANT_CONVERSATION_RETENTION_DAYS`,
   `ATTEMPT_RECORD_RETENTION_HOURS`). The seven repositories derive `RETENTION_MS` from them, and
   `/privacy` renders its figures from them, so a retention change cannot leave the policy wrong —
   the same single-source pattern `#1080` used for storage names (`lib/storage-keys.ts`). Behaviour
   does not change: the values are today's.
2. **Banner copy** replaced with approved text that names what is stored and the one optional
   cookie.
3. **Cookie settings:** a client `CookieSettingsButton` dispatches a new
   `CONSENT_SETTINGS_OPEN_EVENT` (in `lib/storage-keys.ts`). `CookieBanner` always listens; on the
   event it shows, states the stored choice, and moves focus to its first button. Choosing Essential
   Only now also expires the referral cookie (and its legacy name) from the banner itself. The
   button sits in the footer's Legal row after "Cookies", and on `/privacy#cookies`.
4. **`/privacy` section 5** gains a Searches paragraph and an abuse-protection paragraph, the
   assistant paragraph's last sentence is aligned, and the feedback paragraph names the stored
   hashed IP.
5. **`docs/developer-portal/app-conventions.md`** gains the standing rule: a record that stores a
   hashed IP takes its retention from `lib/data-retention.ts` and is disclosed on `/privacy`.

## Deliberately excluded

- **Gating saved checkout details on consent** — owner ruling 1. Not a deferral; a decision.
- **Deterministic deletion** (a scheduled sweep so retention is exact). The scheduler exists now
  (`app/api/jobs/*`), but a new job is new operational surface; the 2026-08-31 rate-limit slice
  chose the in-request sweep deliberately. The copy is made honest instead. **To be filed as a
  follow-up at `/build-notes`.**
- **Changing any retention value or sweep probability.** Values move to one module unchanged.
- **Re-capturing a `?ref=` code after Essential Only → Accept All.** The code lives only in the
  URL and `RewardsLauncher`'s closure; a shopper can still type it at checkout (`#1065`'s position).
- **A cookie-settings control on staff pages.** The banner is storefront-only (`StorefrontChrome`).
- **The privacy page's `"Aheed Food Centre"` metadata fallback** (`app/(storefront)/privacy/page.tsx`,
  used when no vendor resolves). Observed, outside this slice's copy; noted for a separate issue.
- **`VendorRoleAuditLog`, `AiUsage` and other logs without a hashed IP** — staff or vendor data, not
  shopper network data.

## Open items carried forward

- Follow-up issue for deterministic retention sweeps (see above), filed at `/build-notes`.
- Whether the five abuse-protection records need a lawful-basis sentence beyond "so repeated
  attempts can be slowed down" is a legal-review question for launch evidence (`#439`–`#445`), not
  this slice.
