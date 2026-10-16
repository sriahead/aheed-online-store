---
id: p1045-1043-shopper-copy-truth
title: "Shopper copy that contradicts the system — points expiry and the guest-lookup prefix (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-16
visibility: internal
summary: "Club E (#1045, #1043): /help, the help assistant and the staff label stop describing a per-point points expiry the platform never implemented, all three from one shared helper; and the guest-lookup placeholder derives the viewing vendor's own order-number prefix instead of hardcoding AHE-."
tags: [copy, loyalty, points-expiry, multi-tenant, vendor-neutral, guest-lookup, p10, user-testing]
related: [p1107-1041-privacy-consent, p1080-1065-neutral-storage-keys, app-conventions, architecture]
---

# Shopper copy that contradicts the system (plan)

Two defects of the same kind: user-facing copy that states something the code does not do. Neither
is a bug in behaviour, so no test caught either — the only witness is a reader comparing the
sentence to the function behind it. Both were found at `/validate` for `#1015`/`#1014` and were
deliberately left out of that slice.

**Goal:** make three surfaces describe the loyalty expiry rule the platform actually implements, and
make the guest-lookup example order number belong to the vendor the shopper is looking at. Shipping
this removes the two places where the storefront is, in plain terms, telling shoppers something
untrue.

## Why the expiry copy is wrong, precisely

`lib/loyalty.ts:71` `isLapsed()` lapses the **entire balance** once `lastActivityAt +
pointsExpiryMonths` has passed. Expiry is **inactivity-based**: a shopper who keeps ordering never
loses a point, and a shopper who stops loses everything at once, including points earned the day
before their last order. The docstring is explicit that this is deliberate — it is what makes
expiry derivable from one column at read time, with no scheduled sweep, which P5a chose on purpose
because this codebase has no cron surface.

Three surfaces describe per-point aging instead:

- `app/(storefront)/help/page.tsx:281` — "Points expire {N} months after you earn them."
- `lib/assistant-content.ts:178` — the identical sentence, copied from `/help` by `#1015`.
- `components/staff/LoyaltyConfigForm.tsx:105` — "Points expire after (months, blank = never)",
  the label on the control that **sets** the value.

The shopper-facing pair is what `#1045` reports. The staff label is outside that issue's literal
scope and is included here by explicit approval, because it is the same sentence on the input that
configures the rule: a vendor who reads it as per-point aging picks the wrong number, and the cost
of fixing it alongside is one line.

`app/(storefront)/account/loyalty/page.tsx:151` already words it correctly — "Your points expired
after {N} months without an order." — so this slice has a precedent in the repo to match rather
than a wording question to invent.

## Why the lookup placeholder is wrong

`app/(storefront)/orders/lookup/page.tsx:114` hardcodes `placeholder="e.g. AHE-20260813-K4M2XQ"`.
`AHE-` is not a platform prefix: `lib/order-totals.ts:158` `vendorOrderPrefix()` derives it from the
vendor's slug (`aheed-food-centre` → `AHE`, `srimart` → `SRI`). Every vendor other than Aheed shows
a guest an example order number that can never exist in their store. Same class as `#729`/`#239`,
and `docs/developer-portal/app-conventions.md` ("User-facing copy") already forbids it;
`tests/vendor-neutral-copy.test.ts` is a denylist and simply never listed this string.

`#1043` offered a choice — derive the prefix, or drop to a neutral placeholder. **It is not a real
choice.** `VendorProfile` already carries `slug` (annotated in `lib/repositories/vendor.ts:41` as
"used to derive the order-number prefix"), and `getCurrentVendorProfile()`
(`lib/vendor-service.ts:41`) is `cache()`-wrapped and **already called by the `(storefront)` layout
on the same request**. Deriving the true prefix therefore costs **zero additional queries**, so the
weaker option buys nothing.

**Scope (this slice):**

- A new exported helper in `lib/help-facts.ts` returning the expiry sentence from a month count.
  That module is already imported by **both** `app/(storefront)/help/page.tsx` and
  `lib/assistant-content.ts`, and already exists to hold facts shared by exactly this pair
  (`helpDeliveryFacts`), so sharing the sentence makes the two surfaces **incapable** of drifting
  rather than merely guarded against it. `#1045` asked for a test pinning the two sentences
  together; one source plus one test on it is the stronger form of the same request.
- `app/(storefront)/help/page.tsx` renders that helper in the loyalty section's Expiry line.
- `lib/assistant-content.ts` `rewardsEntry()` pushes the same helper's output.
- `components/staff/LoyaltyConfigForm.tsx` relabels the months input to name inactivity.
- `app/(storefront)/orders/lookup/page.tsx` builds its placeholder from
  `vendorOrderPrefix(profile.slug)` via the already-cached `getCurrentVendorProfile()`.
- `tests/help-vendor-facts.test.tsx:142` currently asserts `/expire 12 months/i` and so **pins the
  wrong wording today**; it is corrected, not merely kept passing.
- `tests/assistant-content.test.ts:207,210` assert only that `/expire/i` and `"12 months"` appear,
  which would survive this reword unnoticed; tightened to pin the inactivity phrasing.
- `"AHE-"` added to `FORBIDDEN` in `tests/vendor-neutral-copy.test.ts`. Safe by construction: that
  test walks `.tsx` files only and strips comments, so `vendorOrderPrefix`'s own
  `AHE-20260810-K4M2XQ` doc comment — a comment, in a `.ts` file — is out of its reach twice over.

**Deliberately excluded:**

- **`app/(admin)/staff/reports/page.tsx:178`** — "this store's expiry setting", which is vague but
  not wrong. Changing it would be preference, not correction.
- **`components/rewards/RewardsPanel.tsx:120` and `app/(storefront)/account/loyalty/page.tsx:116`**
  — "Expiration date: {date}". Behaviourally **correct**: the date is computed from
  `lastActivityAt`, so it already moves when the shopper orders. It does not tell the shopper that
  ordering moves it, which is a real gap in helpfulness but not a false statement. Left alone; it
  needs its own issue and a copy decision, not a drive-by edit inside a correction slice.
- **Any change to `isLapsed()`, `visibleBalance()` or the loyalty schema.** This slice changes what
  the platform *says*, never what it *does*. If the inactivity rule is itself the wrong product
  decision, that is a separate proposal with a migration behind it.
- **Widening `tests/vendor-neutral-copy.test.ts` beyond one literal.** It stays a denylist; making
  it detect vendor-derived strings generally is `#997`'s prerequisite work, not this slice's.
- **Backfilling the `AHE-` example in `lib/order-totals.ts`'s doc comment.** It documents the
  format for developers, is not user-facing, and renaming it would make the docstring harder to
  read for no shopper benefit.

**Reconciliation this slice creates (for `/document`):**

- `docs/model-handoff.md:945` records `#1045` as an open defect, quoting the wrong wording while
  stating the real rule. It is **correct today** and becomes stale the moment this ships, so the
  final `/document` must retire that entry rather than leave a shipped defect described as open.
  Flagged here because the handoff is the file a fresh session trusts first.

**Open items carried forward:**

- **`#1125`** — a full `npx vitest run` is currently nondeterministic: it can lose whole jsdom test
  files while still printing a plausible pass line. Gate 3 for this slice therefore reports the
  **file count** alongside the result, and a run that does not reach the expected total is not a
  pass. This slice does not fix `#1125`.
- **`#1123`** — unrelated to this slice, but open and dated (the reference-data sync fails from
  2026-11-03 until `UK_LOCATION_REF_DIRECT_URL` points at the primary endpoint).
