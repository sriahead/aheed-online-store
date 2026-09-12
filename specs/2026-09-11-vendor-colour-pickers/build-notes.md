## What changed and why
- **Made colour fields controlled:** Refactored `components/staff/StorefrontConfigForm.tsx` to use local `colors` React state initialized from `initialBranding`. A render-phase state adjustment syncs it if the parent sends a new `initialBranding` (e.g. after applying a theme).
- **Added native colour pickers:** Bound an `<input type="color">` alongside each hex text box. Kept the text box visible so operators can paste existing brand hex codes.
- **Added Live Preview:** Displayed a dynamically updated preview box below the inputs, demonstrating the actual `--color-*` CSS variables resulting from passing the current form state through `clampForContrast()`. This solves the issue of vendors being confused when their selected colours are shifted by the WCAG AA accessibility enforcer.
- **Updated CHANGELOG.md:** Documented the feature addition and closed #714.

## Decisions taken during the build
- The native `<input type="color">` fields omit the `name` attribute, ensuring that the form serialization only targets the original hex text inputs. This cleanly preserves the existing form submission boundaries.
- Render-phase state adjustment was selected over `useEffect` to avoid React cascaded render warnings and performance overhead.

## Deviations from the spec
- None.

## Known-shaky areas
- None. The feature strictly adds local UI enhancements to the admin panel with no schema migrations or backend logic alterations.
