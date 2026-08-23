import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentVendorId } from "@/lib/tenant";
import { getGuestDataRightsService } from "@/lib/data-rights-service";
import { checkOrderLookupRateLimit } from "@/lib/repositories/order-lookup-rate-limit";

// Reads the caller's order and their IP for throttling — must run per request.
export const dynamic = "force-dynamic";

/**
 * Art. 15 access for GUESTS — download the one order proven by an
 * order-number/email pair (#253, P8.1b).
 *
 * Guests gained erasure (Art. 17) in the P7 closeout and could already SEE this
 * order in human-readable form on /orders/lookup, so what was missing was the
 * machine-readable format, not the right. This route is modelled on
 * `app/(storefront)/account/data/export/route.ts` — a route handler rather than
 * a Server Action because an action cannot cleanly hand the browser a file, and
 * `no-store` because a per-person document must never be reused for a second
 * request from behind Cloudflare's edge cache.
 *
 * RATE LIMITED with the same throttle as the lookup page itself. An export
 * endpoint is a strictly more attractive enumeration target than the page it
 * sits behind — it returns a whole order as JSON in one request — so leaving it
 * off the throttle would have widened the surface #123 closed.
 *
 * 404 on a bad pair, never 403 and never a distinct "wrong email" message:
 * `exportGuestOrderData` verifies the pair inside its WHERE and returns null for
 * both cases, so this route cannot leak the existence of an order it will not
 * hand over.
 */

/**
 * Cloudflare always sets CF-Connecting-IP on a real request; x-forwarded-for is
 * the fallback for `next dev`/local tooling. Same resolution the lookup page
 * uses — the two must agree or they would be separate throttle buckets.
 */
async function resolveClientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderNumber = searchParams.get("orderNumber")?.trim() ?? "";
  const email = searchParams.get("email")?.trim() ?? "";

  if (!orderNumber || !email) {
    return NextResponse.json(
      { error: "Both an order number and the email used to place the order are required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const vendorId = await getCurrentVendorId();
  const { allowed } = await checkOrderLookupRateLimit(vendorId, await resolveClientIp());
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const data = await getGuestDataRightsService().exportGuestOrder(orderNumber, email);
  if (!data) {
    return NextResponse.json(
      { error: "Order number and email combination did not match our records." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="order-${data.order.orderNumber}-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
