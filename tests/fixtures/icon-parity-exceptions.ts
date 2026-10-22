/**
 * Icons whose Iconify geometry differs from the installed `lucide-react` beyond the tolerance in
 * `scripts/lib/svg-geometry.ts` (#1223, R26). Each entry needs a reason; the parity test fails if an
 * entry no longer diverges, so this list cannot rot into a blanket allowance.
 *
 * Empty at Build: with `@iconify-json/lucide` pinned to 1.2.122 (published the same day as lucide-react
 * 1.30.0), all 102 icons in use match. The newest Iconify release at the time (1.2.147) did NOT: it
 * redrew `circle-check`, `cookie`, `trash` and others, which is why the pin is where it is.
 */
export const LUCIDE_PARITY_EXCEPTIONS: Array<{ key: string; reason: string }> = [];

/**
 * Elements that legitimately carry their own `fill`, `stroke` or `stroke-width` in the generated data
 * because `lucide-react` renders the same attribute on the same element (R13). Empty at Build.
 */
export const LUCIDE_CHILD_ATTRIBUTE_EXCEPTIONS: Array<{ key: string; reason: string }> = [];
