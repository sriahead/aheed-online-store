| Req | How to verify |
|---|---|
| R1 | `grep -q "brandGreenDark" lib/brand-colour-form.ts && echo pass` |
| R2 | `grep -q "ParseResult" lib/brand-colour-form.ts && echo pass` |
| R3 | `grep -v "throw" lib/brand-colour-form.ts > /dev/null && echo pass` |
| R4 | `grep -q "initial" lib/brand-colour-form.ts && echo pass` |
| R5 | `grep -q "useActionState" components/staff/StorefrontConfigForm.tsx && echo pass` |
| R6 | `grep -q "brandingState.error" components/staff/StorefrontConfigForm.tsx && echo pass` |
| R7 | `grep -q "DEFAULT_BRAND_PRIMITIVES" lib/vendor-theme.ts && echo pass` |
| R8 | Run `npm test tests/brand-colour-validation.test.ts` and verify it exits 0. |
| R9 | Run `npm test tests/vendor-theme-fallback.test.ts` and verify it exits 0. |
| R10 | `cat specs/2026-09-10-brand-colour-validation/build-notes.md` and verify the recorded audit results are present for the `dev`, `staging`, and `production` environments. |
