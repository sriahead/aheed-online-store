/**
 * #973 — what a checkout code preview concludes, as the page and the form see it.
 *
 * A plain module, not `features/checkout/preview-code.ts`: that file is `"use server"` and may export
 * only async functions (CLAUDE.md's Server Actions section).
 */

/** `code` is normalised. A refusal carries the shopper-facing message, not the reason. */
export type CodePreview =
  { code: string; ok: true; discountPence: number } | { code: string; ok: false; message: string };

/** Shown when the preview itself failed. `placeOrder` still decides the code on submit. */
export const PREVIEW_FAILED_MESSAGE =
  "We couldn't check that code just now. It will be checked again when you continue to payment.";
