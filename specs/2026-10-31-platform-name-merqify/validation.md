# Platform name Merqify by default; Third-party credits (validation)

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/config-platform-branding.test.ts`. **Expect:** pass. |
| R2  | Unit | Same test (wrangler.toml case); `rg -n "PLATFORM NAME" wrangler.toml` prints nothing. |
| R3  | Unit | `npx vitest run tests/storefront-footer.test.tsx`. **Expect:** pass. |
| R4  | Unit | `npx vitest run tests/icon-credits-and-tooltips.test.tsx`. **Expect:** pass. |
| R5  | Regression | The four local commands; CI green on the PR. |
| R6  | E2E (live) | `curl -sS https://aheed-staging.merqify.com/ \| grep -o "Powered by Merqify\|Third-party credits"`, same for `srimart-staging`. **Expect:** both strings on each. |
