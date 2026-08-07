---
id: dev-view
title: "Dev View — Admin diagnostics page (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-07
visibility: internal
summary: A minimal ADMIN-gated /dev page showing non-secret environment diagnostics (deployed commit, environment, integration on/off flags, session) and a link to the KMS internal docs.
tags: [dev-view, admin, rbac, diagnostics]
related: [architecture, adr-002-auth-library]
---

# Dev View — Admin diagnostics page (plan)

**Goal:** give admins a single place to see **which environment they're on and what's wired**, plus
a way into the internal KMS docs — the safe, minimal core of the mockup's "Developer Control
Toolbar" (issue #41), without any of its unsafe or premature parts.

**Trigger:** issue #41, scope confirmed with the human 2026-08-07 (chose "minimal admin-gated /dev
now" over a fuller toolbar). The mockup's toolbar switches between Guest/User/Staff/Admin/Dev-KMS
views and shows API keys / webhook logs — but **staff/admin panels are P6** (a switcher would be
mostly stubs today) and **showing secrets in the UI violates `CLAUDE.md`** (secrets live only in
Cloudflare's store). This slice builds only the parts that are safe and useful now.

**Scope (this slice):**
- **Route `app/(storefront)/dev/page.tsx`**, `force-dynamic`, gated with
  `lib/auth-rbac.ts`'s `requireRole("ADMIN")`: 401 (no session) → redirect to `/login`; 403 (signed
  in, not ADMIN) → a plain "administrators only" message (not the diagnostics). Real RBAC, **not** a
  client-side "Dev Mode" toggle anyone can flip (the mockup's toggle is insecure).
- **`lib/dev-diagnostics.ts`** — a pure `getDevDiagnostics()` returning **non-secret** values only:
  the deployed commit (`GIT_COMMIT_SHA`, same var `/api/health` already surfaces), and
  **configured-or-not booleans** for each integration (Google sign-in, storage, email, CDN,
  `BETTER_AUTH_URL`) computed as "are these keys present" — **never the key values**. Plus the
  optional `KMS_INTERNAL_URL` (a URL, non-secret).
- **The page renders**: environment (derived from the request host — Staging / Production / Local),
  the deployed commit, the integration flags as ✓/✗, the signed-in admin's own session
  (id/email/role), and a **link to the KMS internal docs** — or a "pending setup" note when
  `KMS_INTERNAL_URL` is unset.

**Deliberately excluded:**
- **Any secret / API-key / webhook / token value** — the page shows only booleans and non-secret
  identifiers. This is the hard line from #41.
- **View / role switching or impersonation** — deferred until the Staff/Admin panels it would
  switch to actually exist (P6). A switcher now would be mostly empty.
- **A header toolbar** — a dedicated `/dev` page is simpler and sufficient; a persistent toolbar can
  come with P6 if wanted.
- **Setting up the KMS internal URL itself** — that needs DNS + a Cloudflare Access gate on
  `docs.internal.aheedfoodcentre.nocaped.com` (human infra, see `kms/site-internal/wrangler.toml`).
  The page reads `KMS_INTERNAL_URL` and degrades gracefully until it's set.

**Open items carried forward:**
- KMS internal URL activation (DNS + Cloudflare Access) — human task; the link shows "pending"
  until then.
- View-switching / staff-admin panels — P6.
