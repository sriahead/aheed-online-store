import type { AddOutcome } from "@/lib/cart-rules";

/**
 * #956 — what the shopper is told after an add, one string per outcome. `null`
 * stands for a call that rejected (network, isolate limit), which added
 * nothing the button can vouch for.
 *
 * `productName` is the product's own name, so the copy stays vendor-neutral.
 */
export function addFeedbackMessage(outcome: AddOutcome | null, productName: string): string {
  if (outcome === null) return `${productName} couldn't be added. Please try again.`;
  switch (outcome.kind) {
    case "added":
      return `Added ${productName} to your cart (${outcome.inCart} in cart).`;
    case "partial":
      return `Only ${outcome.added} of ${outcome.requested} ${productName} added. That's all we have in stock (${outcome.inCart} in cart).`;
    case "none":
      switch (outcome.reason) {
        case "SOLD_OUT":
          return `${productName} is sold out. Nothing was added.`;
        case "AT_STOCK_LIMIT":
          return `Your cart already has all the ${productName} we have in stock (${outcome.inCart}). Nothing was added.`;
        case "INVALID_QUANTITY":
          return `${productName} couldn't be added. Please try again.`;
      }
  }
}

/**
 * The short text the `drawer` and `full` buttons show for an outcome other
 * than `added` (which keeps each variant's own "Added" wording).
 */
export function addFeedbackButtonText(outcome: AddOutcome | null): string {
  if (outcome === null) return "Try again";
  switch (outcome.kind) {
    case "added":
      return "Added";
    case "partial":
      return `Only ${outcome.added} added`;
    case "none":
      switch (outcome.reason) {
        case "SOLD_OUT":
          return "Sold out";
        case "AT_STOCK_LIMIT":
          return "All in cart";
        case "INVALID_QUANTITY":
          return "Try again";
      }
  }
}
