R1. `lib/brand-colour-form.ts` exports a pure function that validates a `FormData` object containing the eight `VendorBranding` colour fields, plus `bannerNote` and `heroSubtitle`.
R2. The validator returns a `ParseResult` containing typed `FieldError`s if any of the eight colour fields is present but is not a 6-digit hex string matching the `/^#[0-9a-f]{6}$/i` format.
R3. The validator returns the parsed values in its success object and does not throw an exception on malformed input.
R4. `lib/brand-colour-form.ts` defines and exports the `useActionState` state interface and initial constant for the form.
R5. `components/staff/StorefrontConfigForm.tsx`'s form action uses `useActionState` instead of `useTransition` to handle submissions.
R6. `components/staff/StorefrontConfigForm.tsx` renders field-specific validation error messages immediately below any colour input that fails validation.
R7. `lib/vendor-theme.ts`'s `brandStyle()` replaces any malformed (non-hex) primitive in the provided `BrandPrimitives` object with the corresponding value from `DEFAULT_BRAND_PRIMITIVES` before passing it to `clampForContrast` or any other color function, preventing the function from throwing.
R8. `tests/brand-colour-validation.test.ts` (or similar) exists and verifies that the form validator rejects malformed hex codes (e.g. `green`, `2e4d26`, `#2e4d2`, `rgb(0,0,0)`) and accepts valid ones.
R9. `tests/vendor-theme-fallback.test.ts` (or similar) exists and verifies that `brandStyle()` falls back to defaults for invalid hex inputs without throwing.
R10. `build-notes.md` contains the recorded result of auditing the `dev`, `staging`, and `production` environments for invalid `VendorBranding` and `Theme` colour rows.
