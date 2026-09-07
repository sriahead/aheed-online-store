/**
 * The shared form-control class strings.
 *
 * WHY THIS FILE EXISTS. These four strings were duplicated VERBATIM across the
 * app — `inputClass` in 11 files, `labelClass` in 15, `errorInputClass` in 8,
 * `buttonClass` in 2 — and that duplication is not a tidiness observation, it is
 * the mechanism by which two accessibility defects reached double digits from a
 * single author decision:
 *
 *   - `labelClass` carried `text-primary/70`, measured at 3.54:1 against Aheed's
 *     tints (#649). One string made every form label in the application fail
 *     WCAG AA at once.
 *   - `inputClass` suppressed the browser's focus outline with only a 1px
 *     border-colour change to replace it (#650) — which vanishes entirely in Windows High
 *     Contrast mode, where author border colours are overridden.
 *
 * Fixing those at 11 and 15 call sites without consolidating would have left the
 * next author the same defaults to copy.
 *
 * WHAT THIS FILE IS NOT. It deduplicates STRINGS, not markup. There is
 * deliberately no `Input`, `FormField` or `Button` component here — that
 * primitive layer is #656 and is post-launch work with decisions this slice does
 * not make. Keeping it to strings means every call site stays a plain
 * server-rendered `<input>`/`<button>`, so the progressive-enhancement stance
 * (forms that work with no client JavaScript) is untouched.
 *
 * This is a plain module, not a `"use server"` file, and exports only constants —
 * see CLAUDE.md's Server Actions section for why a value export must never live
 * beside server actions.
 */

/**
 * Text, email, number, date and textarea controls.
 *
 * FOCUS IS `focus-visible:`, NOT `focus:`. `focus:` fires on mouse click too,
 * so a ring drawn there appears on every click; `focus-visible:` is the variant
 * that means "the browser thinks this user needs a focus indicator". The ring is
 * 2px with a 2px offset rather than a border-colour change, because WCAG 2.2
 * SC 2.4.11 wants an indicator area equivalent to a 2px perimeter — and because
 * a ring survives forced-colors mode, which a border colour does not.
 *
 * `focus-visible:border-primary` is kept alongside the ring: it is the existing
 * visual language of these forms, and it costs nothing to retain now that it is
 * no longer the ONLY indicator.
 */
export const inputClass =
  "w-full rounded-xl border border-black/15 bg-surface-muted px-3 py-2 text-sm " +
  "focus-visible:border-primary focus-visible:bg-white " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2";

/**
 * The `uppercase` variant, used where the field's value is a code rather than
 * prose (delivery-area postcode prefixes). Derived from `inputClass` rather than
 * re-typed, so a future focus or contrast change reaches both.
 */
export const uppercaseInputClass = `${inputClass} uppercase`;

/**
 * Field labels.
 *
 * `text-primary-muted`, NOT `text-primary/70` — see #649 and the token's own
 * comment in `design-system/tokens/tokens.css`. The alpha modifier this replaces
 * composited a contrast-clamped token back below the AA floor, at `text-xs`, on
 * every form in the application.
 */
export const labelClass = "mb-1 block text-xs font-medium text-primary-muted";

/**
 * Appended to `inputClass` on the field an action reported as invalid.
 *
 * COLOUR IS NOT THE ONLY SIGNAL. This class marks the field visually; the call
 * site must also set `aria-invalid` and point `aria-describedby` at the element
 * rendering the message (#650). A red border alone is WCAG SC 1.4.1 (Use of
 * Colour) and SC 3.3.1 (Error Identification) — it tells a sighted mouse user
 * which field is wrong and tells a screen-reader user nothing at all.
 */
export const errorInputClass = "border-danger bg-danger-tint";

/** The primary submit control on a staff-panel form. */
export const buttonClass =
  "inline-flex items-center gap-2 rounded-full bg-action px-4 py-2 text-sm font-semibold " +
  "text-white transition-colors hover:bg-action-hover disabled:opacity-60 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2";
