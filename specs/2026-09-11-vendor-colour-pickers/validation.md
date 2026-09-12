# Vendor colour pickers (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | E2E | Run `npm run preview`. Log in as a staff member and navigate to `/staff/storefront`. Verify the branding form loads the current hex values successfully and saving still works. |
| R2  | E2E | On `/staff/storefront`, verify each of the eight colour fields has both a text box and a colour picker, and that changing one immediately updates the other. |
| R3  | E2E | Open the browser DevTools and inspect the "Live Preview" container. Verify that its inline `style` attribute dynamically updates with the contrast-clamped `--color-*` variables when a colour picker is changed. |
| R4  | E2E | In the "Live Preview" area, pick a very pale/light hex (e.g. `#e0f2f1`) for the Primary Brand Color. Verify that the previewed `bg-primary` element renders a much darker, readable green (proving the contrast clamp is live). |
| R5  | Review | Inspect `CHANGELOG.md` to confirm a new entry exists documenting the changes and closing `#714`. |
| R6  | Unit | Run `npm run check`. Verify that ESLint, TypeScript, Vitest, and Prettier all exit 0. |
