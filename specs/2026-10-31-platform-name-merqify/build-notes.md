# Platform name Merqify by default; Third-party credits (build notes)

Branch `feature/platform-name-merqify` from `staging` at `8e9a165`. Issue `#1371`. Small
owner-requested copy/config change; validated in the same session.

## What changed and why

- `lib/config.ts`: `DEFAULT_PLATFORM_NAME` / `DEFAULT_PLATFORM_TAGLINE` and an `orDefault` helper.
- `StorefrontChrome` passes both values; `StorefrontFooter` gains an optional `platformTagline`.
- Credits page, `lib/icon-slots.ts` surface label, `design-system.md` and the help-centre table say
  "Third-party credits". `ARTIFACT_INDEX.md` and the runbook docs are regenerated.
- New `tests/config-platform-branding.test.ts`; footer and credits-page tests updated.

## Decisions taken during the build

- The tagline sits on the same line, separated by " · ", matching the footer's legal line style.
- The URL `/icon-credits` is kept rather than renamed.

## Deviations from the spec

None.

## Known-shaky areas

- R6 needs the staging deploy.

## Validation record

Local: 367 files / 5347 tests pass with `--maxWorkers=4`; typecheck, lint, format, `kms:validate`
and the `kms/site-internal` build pass.
