/**
 * #1435 R13/R16/R17 — the absolute links an order message carries.
 *
 * A message is sent from a webhook or a job, where there is no customer request host to build a
 * link from, so the store's own canonical `VendorDomain` decides. No canonical host means no link at
 * all — never a guessed or platform URL that could send a customer to the wrong store.
 */

/** `https://<host>` of the lowest canonical host, or null when the store has none. */
export function canonicalBaseUrl(
  hosts: readonly { host: string; isCanonical: boolean }[],
): string | null {
  const host = hosts
    .filter((h) => h.isCanonical)
    .map((h) => h.host.trim().toLowerCase())
    .filter((h) => h !== "")
    .sort()[0];
  return host ? `https://${host}` : null;
}

/**
 * Where "View your order" goes: a member's account page; a guest's tokenised confirmation page (the
 * capability checkout already issues, P9.1 #427); otherwise the lookup page, where the order number
 * plus the email this message went to is enough.
 */
export function customerOrderHref(
  baseUrl: string,
  order: { orderNumber: string; userId: string | null; confirmationToken: string | null },
): string {
  const n = encodeURIComponent(order.orderNumber);
  if (order.userId) return `${baseUrl}/account/orders/${n}`;
  if (order.confirmationToken) {
    return `${baseUrl}/checkout/${n}?t=${encodeURIComponent(order.confirmationToken)}`;
  }
  return `${baseUrl}/orders/lookup?orderNumber=${n}`;
}

export function staffOrderHref(baseUrl: string, orderNumber: string): string {
  return `${baseUrl}/staff/orders/${encodeURIComponent(orderNumber)}`;
}
