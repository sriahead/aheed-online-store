import type { CSSProperties } from "react";
import type { BrandPrimitives } from "@/lib/repositories/vendor";

/**
 * The per-vendor brand CSS custom properties (ADR-004 slice 4).
 *
 * Extracted from `app/(storefront)/layout.tsx` in P6a (#158), when the admin
 * panel gained its own route group and therefore its own top-level layout. Two
 * layouts each carrying a literal copy of this mapping would drift on the first
 * token change — and the drift would be invisible, because each layout renders
 * a different half of the app.
 *
 * Pure: takes primitives, returns a style object. No I/O, no request context, so
 * it is unit-testable and callable from either layout.
 *
 * Why BOTH layers are overridden, not just the eight primitives: Tailwind v4
 * emits the SEMANTIC tokens at `:root` as `--color-primary:
 * var(--color-brand-green-dark)`, and the browser resolves that inner `var()` at
 * `:root` — so the semantic value is frozen to the default palette and never
 * re-flows when a descendant overrides a primitive. Re-declaring the semantic
 * tokens here (same primitive→semantic mapping as
 * design-system/tokens/tokens.css) forces them to resolve against this vendor's
 * palette. Hover shades — hardcoded ~15%-darker hex in tokens.css — are derived
 * per vendor via color-mix so they track the vendor colour too.
 */
export function brandStyle(primitives: BrandPrimitives): CSSProperties {
  const p = primitives;
  return {
    // primitives (for any brand-* utility used directly)
    "--color-brand-green-dark": p["green-dark"],
    "--color-brand-green": p.green,
    "--color-brand-orange": p.orange,
    "--color-brand-red": p.red,
    "--color-brand-cream": p.cream,
    "--color-brand-green-tint": p["green-tint"],
    "--color-brand-orange-tint": p["orange-tint"],
    "--color-brand-red-tint": p["red-tint"],
    // semantic (what components actually use)
    "--color-primary": p["green-dark"],
    "--color-action": p.green,
    "--color-accent": p.orange,
    "--color-danger": p.red,
    "--color-surface-muted": p.cream,
    "--color-action-tint": p["green-tint"],
    "--color-accent-tint": p["orange-tint"],
    "--color-danger-tint": p["red-tint"],
    // derived hover shades (~15% darker), per vendor
    "--color-action-hover": `color-mix(in srgb, ${p.green} 85%, black)`,
    "--color-accent-hover": `color-mix(in srgb, ${p.orange} 85%, black)`,
  } as CSSProperties;
}
