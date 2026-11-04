import type { InboundDefaultForward } from "@/lib/config";
import type { InboundAddressPurposeValue } from "@/lib/repositories/inbound-address";

/**
 * #1409 R16 — where a storefront contact-form message goes, from Client Setup only.
 *
 * A complaint, or anything about an order, wants the store's ORDERS receiving address; an enquiry
 * wants SUPPORT. The message goes to that address's `forwardTo` (the store's real mailbox), then to
 * the other purpose's, then to the platform default inbox (#1399). `null` means nowhere is
 * configured, which the caller reports to the shopper rather than queueing.
 */

export type ContactType = "COMPLAINT" | "ENQUIRY";

export interface RecipientAddress {
  address: string;
  purpose: InboundAddressPurposeValue;
  forwardTo: string;
}

function firstForwardTo(
  addresses: readonly RecipientAddress[],
  purpose: InboundAddressPurposeValue,
): string | null {
  const match = addresses
    .filter((a) => a.purpose === purpose)
    .sort((a, b) => a.address.localeCompare(b.address))[0];
  return match ? match.forwardTo : null;
}

export function resolveContactRecipient(input: {
  type: ContactType;
  hasOrder: boolean;
  addresses: readonly RecipientAddress[];
  defaultForward: InboundDefaultForward;
}): string | null {
  const wanted: InboundAddressPurposeValue =
    input.type === "COMPLAINT" || input.hasOrder ? "ORDERS" : "SUPPORT";
  const other: InboundAddressPurposeValue = wanted === "ORDERS" ? "SUPPORT" : "ORDERS";
  return (
    firstForwardTo(input.addresses, wanted) ??
    firstForwardTo(input.addresses, other) ??
    (input.defaultForward.status === "set" ? input.defaultForward.address : null)
  );
}
