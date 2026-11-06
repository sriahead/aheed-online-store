---
id: 2026-11-06-ios15-safari-compat-plan
title: "iPhone 6s / Safari 15 compatibility: browser targets and a client-syntax guard (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-06
visibility: internal
summary: Next.js 16 compiled for Safari 16.4+, so on iOS 15 a framework chunk failed to parse and React never hydrated. That left Google sign-in, add to basket and every form dead. This slice sets browserslist to Safari/iOS 15.4 and adds a post-build guard.
tags: [compatibility, safari, ios, browserslist, build]
---

# iPhone 6s / Safari 15 compatibility (plan)

Issue `#1445`. Reported by the owner on 2026-11-06, testing on an iPhone 6s in Safari. The proposal was approved the same day.

## The problem

On an iPhone 6s (iOS 15 is its last major version) the owner reported:

- "Continue with Google" cannot be clicked.
- Products cannot be added to the basket.
- Icons are not visible.
- The address bar says "Not Secure".

## Cause (measured 2026-11-06, not guessed)

- **Next.js 16 compiles client JavaScript for `chrome 111, edge 111, firefox 111, safari 16.4`** unless the project sets `browserslist` (`node_modules/next/dist/docs/03-architecture/supported-browsers.md`). This project set none.
- **The live framework chunk used syntax Safari 15 cannot parse.** `/_next/static/chunks/3794-d7cddff008311ab3.js` on `aheed.merqify.com` contained `class h extends o.default.Component{static{this.contextType=d.AppRouterContext}…`.
  - That is a class static initialisation block (ES2022), which Safari parses only from 16.4.
  - A parse error discards the whole chunk.
  - So React never hydrates. The server-rendered HTML is visible, but every client handler is dead: `GoogleSignInButton` (`onClick`), `AddToCartButton` (`onClick`), `LoginForm`/`RegisterForm` (`onSubmit`).
- **A probe build fixed it.** The probe added `browserslist` (`safari >= 15`, `ios_saf >= 15`) to `package.json`. `next build --webpack` lowered the block to `static #e=this.contextType=…`, a static private field Safari 15 parses. Grepping its 158 emitted `.js` files found no `static{`, no regex lookbehind, and no logical-assignment operators.

## Why the floor is 15.4, not 15.0

Two things already in the build need Safari 15.4, and neither is fixed by changing browser targets:

- **Tailwind v4's stylesheet is wrapped in `@layer`** (cascade layers, Safari 15.4). Below 15.4 the whole stylesheet is ignored.
- **Next's App Router calls `structuredClone` unguarded** (Safari 15.4). It is a runtime API, not syntax, so SWC does not polyfill it.

An iPhone 6s can update to iOS 15.8 for free. The floor is therefore **Safari / iOS 15.4**, written into `browserslist` so the targets and the documented floor are the same fact.

## Scope (this slice)

1. **`browserslist` in `package.json`:** `chrome >= 111`, `edge >= 111`, `firefox >= 111`, `safari >= 15.4`, `ios_saf >= 15.4`.
   - Next's own defaults for the other engines are kept, so modern-browser output is unchanged apart from Safari lowering.
2. **`scripts/check-client-syntax.ts`** parses every emitted client `.js` file with `acorn` and fails on syntax Safari 15.4 cannot parse:
   - class static blocks;
   - regex lookbehind `(?<=`/`(?<!` in a regex **literal** (Safari 16.4);
   - the regex `v` flag (Safari 17).
   - It parses the files rather than grepping them, because `(?<=` also occurs legitimately inside string literals.
   - It takes a directory argument (default `.next/static`), so the validator can point it at chunks downloaded from staging.
   - It fails when it finds **zero** files, so a wrong path cannot pass vacuously.
3. **`postbuild` npm script** runs the checker.
   - npm runs `postbuild` automatically after `npm run build`.
   - `@opennextjs/aws` `buildNextjsApp` runs `npm run build` (`node_modules/@opennextjs/aws/dist/build/buildNextApp.js`).
   - So both deploy workflows run the check between build and deploy, with no workflow edit.
   - `quality.yml` does not build (a PR runner has no build secrets), so the build-time half cannot live there. The cheap half (R2) runs in `npm test`, which `quality.yml` already calls.
4. **`acorn` 8.18.0 as an exact-pinned devDependency.**
   - It is already in the tree via eslint's `espree` at that version, MIT, zero dependencies.
   - It is listed in `tests/dependency-pins.test.ts`'s style of check in the new test.
5. **Docs:**
   - `specs/tech-stack.md` records the floor and the guard.
   - `CLAUDE.md` gets one rule line so a future session does not delete `browserslist` as noise.
   - `docs/developer-portal/runtime-pitfalls.md` records the failure signature (green build, dead page on old Safari).

## Deliberately excluded

- **"Not Secure" is not code.**
  - The merqify.com Cloudflare zone does not redirect HTTP to HTTPS: `http://aheed.merqify.com` and `http://aheed-staging.merqify.com` return `200`, while the nocaped zone `301`s.
  - HSTS on an HTTP response is ignored by browsers.
  - The fix is the zone's **Always Use HTTPS** toggle, plus **Minimum TLS Version 1.2** (currently `1.0`). It is owner-gated and tracked in `#1445`.
  - A code-level redirect was rejected. Without middleware it would have to key on `x-forwarded-proto` in `next.config` redirects, whose value under `npm run preview` is unverified, and it could redirect localhost to https.
- **Icons.** Every inline SVG icon is present in the server HTML, and the markup uses only plain SVG and hex fills, so no icon-specific cause was found. If icons are still missing on a 15.4+ device after this ships, that is a new investigation and needs a device screenshot. This slice does not claim to fix icons.
- **iOS below 15.4.** It would need a cascade-layer flattening step and a `structuredClone` polyfill. That is not worth it when the device updates to 15.8.
- **Runtime-API detection.** The guard checks syntax only, because an API call such as `structuredClone` cannot be told apart from a guarded use by parsing.
- **`'unsafe-eval'` in the production CSP and the deprecated `X-XSS-Protection` header.** These are security hardening unrelated to old iPhones and get separate issues.

## Open items carried forward

- Owner: merqify.com zone, Always Use HTTPS on, Minimum TLS 1.2 (`#1445`).
- Device test on a real iOS 15.4+ iPhone after the staging deploy (validation step V-manual).
