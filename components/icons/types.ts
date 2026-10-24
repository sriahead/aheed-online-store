/**
 * Shared types and the two tables the icon system reads at render time (#1223, ADR-008).
 *
 * Kept free of React and of any generated import so that `scripts/build-icons.ts` (a Node script) and
 * the registry can both depend on it without pulling the component tree in.
 */

/** Where an inline icon's artwork comes from. Department tile illustrations are static files in `public/illustrations/departments/`. */
export type IconProvider = "lucide" | "ph" | "noto";

/**
 * `functional` — controls and navigation; Lucide only (enforced below by the type and by a test).
 * `status` — alerts and success; never colour-only.
 * `decorative` — meaning is carried by adjacent text; the tier that may carry a second hue.
 */
export type IconTier = "functional" | "status" | "decorative";

/**
 * The discriminated union is what makes "a functional icon cannot come from Phosphor" a COMPILE error
 * (R16), not only a test failure: `ICON_REGISTRY` is checked with `satisfies Record<string, RegistryEntry>`.
 */
export type RegistryEntry =
  | { tier: "functional"; provider: "lucide"; id: string }
  | { tier: "status" | "decorative"; provider: IconProvider; id: string };

/** What the generator emits per icon and what `Icon` renders. */
export interface IconData {
  /** `min-x min-y width height`, taken from the icon set's own defaults. */
  viewBox: string;
  /**
   * Presentation attributes hoisted onto the root `<svg>`. Lucide's Iconify data repeats them on every
   * child, where a root Tailwind class such as `fill-current` cannot reach them; `lucide-react` puts them
   * on the root, so callers rely on that (R13).
   */
  root: Record<string, string>;
  /** The inner markup, injected unescaped. Only ever build-time, generator-checked data. */
  body: string;
}

export const ICON_SIZES = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
export type IconSize = (typeof ICON_SIZES)[number];

/** Pixel size per token. 24 is also the default, matching `lucide-react`. */
export const SIZE_PX: Record<IconSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  "2xl": 48,
};
export const DEFAULT_SIZE_PX = 24;

export const ICON_TONES = ["current", "muted", "primary", "action", "accent", "danger"] as const;
export type IconTone = (typeof ICON_TONES)[number];

/**
 * Tone table (plan.md, "Tone map"). Class strings are written out in full so Tailwind's scanner sees
 * them; none of them carries an alpha modifier (design-system: no alpha on a themed foreground).
 */
export const TONE_CLASS: Record<IconTone, string | null> = {
  current: null,
  muted: "text-primary-muted",
  primary: "text-primary",
  action: "text-action",
  accent: "text-accent",
  danger: "text-danger",
};

/**
 * The second hue of a duotone icon, as a CSS variable `brandStyle()` already emits per vendor. A tone
 * with no entry leaves the icon exactly as drawn (one colour, faint secondary layer).
 */
export const TONE_SECONDARY: Record<IconTone, string | null> = {
  current: null,
  muted: null,
  primary: "var(--color-accent)",
  action: "var(--color-accent)",
  accent: "var(--color-action)",
  danger: "var(--color-accent)",
};

/** Opacity the secondary layer takes when a second hue is applied (the drawn default is .2). */
export const SECONDARY_OPACITY = ".7";
