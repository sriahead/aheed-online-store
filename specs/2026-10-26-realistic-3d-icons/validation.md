# Validation Plan: Realistic 3D Icon Suite & Visual Standards

Closes `#1280`.

## Automated Tests

1. `tests/realistic-3d-icons.test.tsx`:
   - Validates all 11 realistic 3D icon assets exist under `public/images/icons-3d/` with valid image headers, non-zero file sizes, and <60KB footprint.
   - Validates `Icon3D` renders `img` with correct src and dimension attributes when image assets exist.
   - Validates `Icon3D` preserves accessibility semantics (`alt=""`, `aria-hidden="true"` when decorative; `aria-label` when non-decorative).
   - Validates fallback to inline SVG when image is missing or omitted.
   - Validates existing tests in `tests/3d-icons-expansion.test.tsx` and `tests/api-icons.test.ts` pass without regressions.

2. Quality & Verification Commands:
   - `npm run lint` (0 errors)
   - `npm run typecheck` (0 errors)
   - `npm run format:check` (clean formatting)
   - `npm run kms:validate` (valid KMS front-matter)
   - `npm run kms:check-generated` (up-to-date index)
   - `npx vitest run --maxWorkers=4` (full test suite green)

## Manual Verification

- Inspect `Header.tsx` on staging: Verify `Shop`, `Quick Shop`, `Sign In`/`Account`, and `Cart` display crisp, vibrant realistic 3D icons without layout shift.
- Inspect Landing Page Trust Values strip: Verify `delivery-van`, `secure-checkout`, and `order-updates` display in matching 3D render style.
- Inspect Location Modal and Floating Contact: Verify `postcode-search` and `contact-follow` display correctly.
