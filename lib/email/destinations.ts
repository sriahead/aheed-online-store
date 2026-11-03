/**
 * #1392 / #1403 — reads the Cloudflare account's Email Routing destination addresses, so Client
 * Setup can offer the verified ones as Forward to choices. Cloudflare forwards only to a verified
 * destination; a forward-to nobody verified saves fine and then silently delivers nothing.
 *
 * `fetch` and the credentials are passed in so the reader is unit-testable with a stub. It never
 * throws and writes no log line: every failure becomes an `unavailable` result the page explains,
 * and the token never leaves this function.
 */

export interface DestinationAddress {
  email: string;
  verified: boolean;
}

export type DestinationUnavailableReason = "not-configured" | "forbidden" | "error";

export type DestinationsResult =
  | { status: "ok"; addresses: DestinationAddress[] }
  | { status: "unavailable"; reason: DestinationUnavailableReason };

const API_BASE = "https://api.cloudflare.com/client/v4/accounts";
const PER_PAGE = 50;
/** Cloudflare's published account limit is 200 destination addresses: 4 pages of 50. */
const MAX_PAGES = 4;
const REQUEST_TIMEOUT_MS = 5_000;

type PageOutcome =
  | { ok: true; addresses: DestinationAddress[]; count: number }
  | { ok: false; reason: "forbidden" | "error" };

async function readPage(url: string, token: string, fetchImpl: typeof fetch): Promise<PageOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "forbidden" };
    }
    if (!response.ok) return { ok: false, reason: "error" };
    const body = (await response.json()) as {
      success?: unknown;
      result?: unknown;
    };
    if (body?.success !== true || !Array.isArray(body.result)) {
      return { ok: false, reason: "error" };
    }
    const addresses: DestinationAddress[] = [];
    for (const entry of body.result as { email?: unknown; verified?: unknown }[]) {
      if (typeof entry?.email !== "string") continue;
      addresses.push({
        email: entry.email.trim().toLowerCase(),
        verified: typeof entry.verified === "string" && entry.verified.length > 0,
      });
    }
    return { ok: true, addresses, count: body.result.length };
  } catch {
    // A thrown fetch, an abort after REQUEST_TIMEOUT_MS, or a body that is not JSON.
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(timer);
  }
}

export async function readDestinationAddresses(
  credentials: { accountId?: string; token?: string },
  fetchImpl: typeof fetch,
): Promise<DestinationsResult> {
  const accountId = credentials.accountId?.trim();
  const token = credentials.token?.trim();
  if (!accountId || !token) return { status: "unavailable", reason: "not-configured" };

  const addresses: DestinationAddress[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${API_BASE}/${encodeURIComponent(accountId)}/email/routing/addresses?page=${page}&per_page=${PER_PAGE}`;
    const outcome = await readPage(url, token, fetchImpl);
    if (!outcome.ok) return { status: "unavailable", reason: outcome.reason };
    addresses.push(...outcome.addresses);
    if (outcome.count < PER_PAGE) break;
  }
  return { status: "ok", addresses };
}
