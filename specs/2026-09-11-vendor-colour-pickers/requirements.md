# Vendor colour pickers (requirements)

This slice builds on the `#713` brand colour validation fix to replace the raw hex text inputs with native colour pickers, adding a live WYSIWYG preview of the contrast-clamped semantic tokens to prevent vendor confusion.

R1. The `StorefrontConfigForm` component uses controlled React state to manage the eight brand colour fields during editing, whilst preserving its existing form-action submission behavior.
R2. Each of the eight brand colour fields renders an `<input type="color">` and an `<input type="text">` bound to the same local state value, updating synchronously on change.
R3. The form dynamically constructs a `BrandPrimitives` object from the current state and passes it to `brandStyle()` to generate the clamped CSS custom properties.
R4. A "Live Preview" container is rendered in the form, applying the `brandStyle()` inline style and demonstrating the resulting semantic colours (e.g. `bg-primary text-white`, `bg-action-tint text-action`, `bg-danger-tint text-danger`) to accurately reflect the contrast clamp.
R5. `CHANGELOG.md` updated (Gate 4).
R6. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
