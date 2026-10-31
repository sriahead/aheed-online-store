# Platform name Merqify by default; Third-party credits (requirements)

Closes `#1371`. Narrative: `plan.md`.

R1. `getPlatformBrandingEnv()` returns `PLATFORM_NAME: "Merqify"` and
    `PLATFORM_TAGLINE: "Your Merchandise, Digitised Quickly"` when both are unset or blank, and the
    trimmed configured values otherwise.

R2. `wrangler.toml` sets `PLATFORM_NAME = "Merqify"` and
    `PLATFORM_TAGLINE = "Your Merchandise, Digitised Quickly"` in both `[env.staging.vars]` and
    `[env.production.vars]`, and no longer contains `[PLATFORM NAME]`.

R3. The storefront footer shows "Powered by Merqify · Your Merchandise, Digitised Quickly", and its
    link to `/icon-credits` reads "Third-party credits".

R4. The `/icon-credits` page's h1 reads "Third-Party Credits & Licences", and its metadata title
    starts with the same words.

R5. `CHANGELOG.md` names `#1371`. `lint`, `typecheck`, `format:check` and
    `npx vitest run --maxWorkers=4` pass.

R6. After the staging deploy, both staging hosts' HTML contains "Powered by Merqify" and
    "Third-party credits".
