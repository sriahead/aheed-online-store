import type { CSSProperties } from "react";
import type { BrandPrimitives } from "@/lib/repositories/vendor";
import { clampForContrast, darkenForHover } from "@/lib/color-contrast";

/**
 * The per-vendor brand CSS custom properties (ADR-004 decision 5).
 *
 * Extracted from `app/(storefront)/layout.tsx` in P6a (#158), when the admin
 * panel gained its own route group and therefore its own top-level layout. Two
 * layouts each carrying a literal copy of this mapping would drift on the first
 * token change — and the drift would be invisible, because each layout renders a
 * different half of the app. Both layouts still call this, so a change here
 * reaches the storefront AND `/staff/*`.
 *
 * Pure: takes primitives, returns a style object. No I/O, no request context, so
 * it is unit-testable and callable from either layout.
 *
 * ── WHY ANY OF THIS IS RE-DECLARED HERE AT ALL ────────────────────────────────
 *
 * Tailwind v4 emits the semantic tokens at `:root` as aliases, e.g.
 * `--color-primary: var(--color-brand-green-dark)`. A custom property's `var()`
 * is substituted ONCE, where that property is DECLARED, using whatever the
 * referenced primitive resolves to AT THAT POINT — and the result is what
 * inherits down the tree. A descendant overriding `--color-brand-green-dark`
 * does NOT make an ancestor's already-computed `--color-primary` recompute. So a
 * semantic alias has to be re-declared at the same element that overrides the
 * primitive, or a vendor's colour never reaches the component using it.
 *
 * ── AND WHY THAT IS DANGEROUS ─────────────────────────────────────────────────
 *
 * This function's return value is applied as an INLINE STYLE on the root
 * element, and an inline style outranks a `:root` stylesheet rule on
 * specificity. Whatever is listed below therefore WINS over
 * `design-system/tokens/tokens.css`, unconditionally, on every page.
 *
 * That is not theoretical. In P7 closeout (#251) `tokens.css` darkened
 * `--color-action`/`-accent`/`-danger` for WCAG AA, its contrast test passed,
 * and every real page kept serving the old AA-*failing* hex — because this
 * function was re-declaring those three from each vendor's raw primitive. The
 * jsdom test never saw it: it parses `tokens.css` directly rather than rendering
 * through the real layout. It was found only by pulling live HTML from
 * `npm run preview`. **Any change here must be verified against live rendered
 * output for both vendors, not against a unit test.**
 *
 * ── WHAT IS RE-DECLARED, AND HOW IT IS MADE SAFE (P7.5c+f, #255; widened P8.1a, #281) ──
 *
 * #251's fix was to stop re-declaring the three semantic base colours at all,
 * which bought the AA guarantee by giving up per-vendor differentiation — every
 * vendor rendered the same platform green regardless of their brand. P7.5c+f
 * restored the differentiation and KEPT the guarantee, by passing each value
 * through `clampForContrast` (`lib/color-contrast.ts`) instead of using the raw
 * primitive:
 *
 *   - `--color-action`, `--color-accent`, `--color-danger` — derived from the
 *     vendor's green/orange/red, clamped to 4.5:1 against white, the vendor's
 *     cream, AND their own matching tint (`green-tint`/`orange-tint`/
 *     `red-tint` respectively) — widened in P8.1a (#281) after a repo-wide grep
 *     of real usage found `text-danger` actually renders on `bg-danger-tint`
 *     (error banners) and was unguarded: the original clamp list only checked
 *     white and cream, never the matching tint. `action`/`accent` gained the
 *     same treatment defensively, though nothing currently renders them on
 *     their own tint.
 *   - `--color-action-hover`, `--color-accent-hover` — a darker shade of the
 *     already-clamped base, re-clamped, so a hover state cannot be the one thing
 *     on the page that fails. (`tokens.css` defines no `--color-danger-hover`,
 *     so none is emitted.)
 *   - `--color-primary` — clamped against white, the vendor's cream AND all
 *     three tints, because it renders on all of them (`bg-action-tint
 *     text-primary` in the homepage trust strip). This was already the widest
 *     clamp list here, which is why #281's actual gap was narrower than its
 *     title suggested — every `text-primary`-on-tint pairing the app renders
 *     was already safe; only the `danger`/`red-tint` pairing was not.
 *   - `--color-surface-muted` and the three tints THEMSELVES — still plain 1:1
 *     aliases, NOT clamped. They are backgrounds, not foregrounds; clamping the
 *     raw tint/cream hex would move the surface a reader's text sits on rather
 *     than the text itself, a different transform with different failure modes,
 *     and one that visibly restyles a vendor's page for a failure mode that
 *     does not currently reproduce anywhere in real usage (see plan.md,
 *     `specs/2026-08-23-p8.1a-frontend-a11y-debt/`). Widening the foreground
 *     clamp lists above closes the one real gap without that risk.
 *
 * The clamp is not a guard around SriMart's edge case. Measured at
 * P7.5c+f's /propose, Aheed's OWN primitives fail hardest of anything in the
 * repo — `#4caf50` at 2.78:1 and `#f57c00` at 2.70:1, against SriMart's
 * `#1e88e5` at 3.68:1 — so restoring per-vendor derivation without it would
 * re-break the vendor that has been live longest. `#d32f2f` (Aheed's red,
 * 4.98:1) already complies and comes back untouched, which is the property
 * `tests/color-contrast.test.ts` pins.
 *
 * `design-system.md`'s rule still stands and is unchanged by this: do not
 * restore the raw brand hex into the semantic layer. A clamped derivation is not
 * the brand hex.
 */

/** WCAG 2.2 AA for normal text. */
const AA_NORMAL = 4.5;

const WHITE = "#ffffff";

export function brandStyle(primitives: BrandPrimitives): CSSProperties {
  const p = primitives;

  // The light surfaces a foreground token can land on. `cream` is the vendor's
  // own muted page background, so it belongs here rather than a fixed value.
  const surfaces = [WHITE, p.cream] as const;
  const primarySurfaces = [
    WHITE,
    p.cream,
    p["green-tint"],
    p["orange-tint"],
    p["red-tint"],
  ] as const;

  // Each colour's own matching tint joins its clamp list (P8.1a, #281): the app
  // renders `text-danger` on `bg-danger-tint` (error banners), and `action`/
  // `accent` gain the same treatment defensively even though nothing currently
  // renders them on their own tint. See the doc comment above for why this is
  // narrower than clamping the tints/cream themselves.
  const action = clampForContrast(p.green, [...surfaces, p["green-tint"]], AA_NORMAL);
  const accent = clampForContrast(p.orange, [...surfaces, p["orange-tint"]], AA_NORMAL);
  const danger = clampForContrast(p.red, [...surfaces, p["red-tint"]], AA_NORMAL);

  return {
    // primitives (for any brand-* utility used directly) — never clamped: they
    // are the vendor's declared brand values and the source the clamp reads.
    "--color-brand-green-dark": p["green-dark"],
    "--color-brand-green": p.green,
    "--color-brand-orange": p.orange,
    "--color-brand-red": p.red,
    "--color-brand-cream": p.cream,
    "--color-brand-green-tint": p["green-tint"],
    "--color-brand-orange-tint": p["orange-tint"],
    "--color-brand-red-tint": p["red-tint"],
    // semantic FOREGROUNDS — per-vendor, contrast-clamped
    "--color-primary": clampForContrast(p["green-dark"], primarySurfaces, AA_NORMAL),
    "--color-action": action,
    "--color-accent": accent,
    "--color-danger": danger,
    "--color-action-hover": darkenForHover(action, surfaces, AA_NORMAL),
    "--color-accent-hover": darkenForHover(accent, surfaces, AA_NORMAL),
    // semantic BACKGROUNDS — plain per-vendor aliases, deliberately unclamped
    "--color-surface-muted": p.cream,
    "--color-action-tint": p["green-tint"],
    "--color-accent-tint": p["orange-tint"],
    "--color-danger-tint": p["red-tint"],
  } as CSSProperties;
}
