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
 * Why `--color-primary` and `--color-surface-muted` ARE re-declared here:
 * Tailwind v4 emits them at `:root` as `--color-primary:
 * var(--color-brand-green-dark)` — a custom property's `var()` is substituted
 * once, where that property is DECLARED, using whatever the referenced
 * primitive resolves to AT THAT POINT, and the result is what inherits down the
 * tree. A descendant overriding `--color-brand-green-dark` does not make an
 * ancestor's already-computed `--color-primary` recompute. So the alias has to
 * be re-declared at the same element that overrides the primitive, or a
 * vendor's wordmark/background never picks up their colour at all. Both of
 * these ARE simple 1:1 primitive aliases in tokens.css (`var(...)`, no
 * independent value), so re-deriving them from this vendor's primitives is
 * correct and matches what the stylesheet would compute if it could see this
 * far down the tree.
 *
 * Why `--color-action`, `--color-accent`, `--color-danger` and their hover
 * shades are NOT re-declared here (fixed in #251's /fix — see build-notes.md
 * "Deviations"): P7 closeout darkened those three in tokens.css to independent,
 * WCAG-AA-audited literal hex, deliberately decoupled from the brand
 * primitives — `design-system.md` states explicitly not to restore the brand
 * hex into the semantic layer. Before that decoupling this function's blanket
 * re-declaration was harmless (semantic == primitive everywhere), so nothing
 * exposed that it re-derives these three from `p.green`/`p.orange`/`p.red`
 * rather than reading tokens.css's audited values — an inline style always
 * outranks a stylesheet rule on specificity, so it silently overwrote the fix
 * on every real page for every vendor, Aheed included, whose own
 * VendorBranding row stores the exact pre-slice, AA-*failing* brand-kit hex.
 * ADR-004 decision 5 already says the semantic layer should "stay unchanged"
 * per vendor — only the primitives vary — so leaving these three out matches
 * the accepted architecture, not a new one.
 *
 * The three semantic TINTS (`--color-action-tint` etc.) are a separate case
 * from the base colours: tokens.css still defines them as plain `var()`
 * aliases to the tint primitives (`--color-action-tint: var(--color-brand-
 * green-tint)`) — R7 darkened the base action/accent/danger colours and their
 * hover shades, but never touched the tints. So the tints stay in the same
 * category as `--color-primary`/`--color-surface-muted` (a live alias that
 * needs re-declaring here to track a vendor's primitive) rather than the
 * category the base colours moved into (an independent, audited constant that
 * must NOT be overridden). Get this wrong in either direction and either a
 * vendor's badges stop matching their palette, or the same contrast bug this
 * comment exists to prevent comes back for a token nobody thought to check.
 *
 * CONSEQUENCE, RECORDED RATHER THAN HIDDEN: SriMart's VendorBranding carries
 * its own action/accent/danger primitives (`#1e88e5` blue, `#8e24aa` purple,
 * `#c62828` red) that were never contrast-audited — re-deriving the semantic
 * BASE colours from them would have reintroduced exactly the un-audited-
 * contrast risk this slice fixed for Aheed, just silently, for a second
 * vendor. SriMart now renders the same platform-fixed, audited action/accent/
 * danger (and hover shades) as every vendor; only `--color-primary`,
 * `--color-surface-muted` and the three tints still vary by vendor. A real
 * per-vendor AA guarantee for the base colours needs its own decision
 * (validate at onboarding, or derive with a contrast-preserving transform, not
 * a flat colour swap) — filed as #255, not decided here.
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
    // semantic aliases that ARE STILL 1:1 primitive references in tokens.css
    "--color-primary": p["green-dark"],
    "--color-surface-muted": p.cream,
    "--color-action-tint": p["green-tint"],
    "--color-accent-tint": p["orange-tint"],
    "--color-danger-tint": p["red-tint"],
  } as CSSProperties;
}
