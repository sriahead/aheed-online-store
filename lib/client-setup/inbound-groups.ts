import type { InboundAddressRow } from "@/lib/repositories/inbound-address";
import type { DestinationsResult } from "@/lib/email/destinations";

/**
 * #1399 — a store's receiving addresses grouped by the mailbox they forward to, for Client Setup's
 * "Receiving addresses" card. Several addresses may share one mailbox (only the receiving address
 * is unique), and this makes that visible. Pure, and in a plain module rather than the "use server"
 * actions file, which may export only async functions (CLAUDE.md, Server Actions).
 */

export interface ForwardGroup {
  forwardTo: string;
  /** The mailbox is the platform default inbox (INBOUND_DEFAULT_FORWARD). */
  isDefault: boolean;
  addresses: InboundAddressRow[];
}

export function groupAddressesByForwardTo(
  rows: readonly InboundAddressRow[],
  defaultForward: string | null,
): ForwardGroup[] {
  const byMailbox = new Map<string, InboundAddressRow[]>();
  for (const row of rows) {
    const list = byMailbox.get(row.forwardTo);
    if (list) list.push(row);
    else byMailbox.set(row.forwardTo, [row]);
  }
  return [...byMailbox.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([forwardTo, addresses]) => ({
      forwardTo,
      isDefault: defaultForward !== null && forwardTo === defaultForward,
      addresses: [...addresses].sort((a, b) => a.address.localeCompare(b.address)),
    }));
}

/**
 * #1392 R11 — the "Verify the forward-to mailbox" guide step. `null` when Cloudflare could not be
 * read (only Cloudflare knows), otherwise whether the store has receiving addresses and every
 * distinct forward-to is a verified destination.
 */
export function forwardTargetsVerified(
  rows: readonly Pick<InboundAddressRow, "forwardTo">[],
  destinations: DestinationsResult,
): boolean | null {
  if (destinations.status !== "ok") return null;
  if (rows.length === 0) return false;
  const verified = new Set(
    destinations.addresses.filter((d) => d.verified).map((d) => d.email.toLowerCase()),
  );
  return rows.every((row) => verified.has(row.forwardTo.trim().toLowerCase()));
}
