"use server";

import { previewCheckoutCode } from "@/lib/checkout-preview-service";
import type { CodePreview } from "@/lib/checkout-code-preview";

/**
 * #973 — the checkout form's Apply control. Checks a typed code against this shopper's own cart
 * without reserving it. The code string is the only input taken from the browser; every figure is
 * resolved on the server by `previewCheckoutCode`.
 *
 * NOTE: this file may export async functions and nothing else. A single value export makes every
 * action in it fail at runtime while `build`, `typecheck` and `test` all stay green (CLAUDE.md's
 * Server Actions section). The result type lives in `lib/checkout-code-preview.ts`.
 */
export async function previewDiscountCode(code: string): Promise<CodePreview | null> {
  return previewCheckoutCode(typeof code === "string" ? code : "");
}
