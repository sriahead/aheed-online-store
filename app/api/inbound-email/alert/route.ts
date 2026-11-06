import { getInboundEmailEnv, readOptional } from "@/lib/config";
import { timingSafeEqual } from "@/lib/stripe-webhook";
import { alertForInboundEmail } from "@/lib/inbound-email-service";

export const dynamic = "force-dynamic";

/**
 * Alert a store's staff about an order-related email (#1390).
 *
 * Called by `workers/inbound-email` AFTER it has forwarded the message, never by a browser, so an
 * alert can never delay or break delivery. Guard shape is identical to the resolve route: fail
 * closed (503) when the token is unset, constant-time compare, 401 otherwise. The address is
 * re-resolved here rather than trusting a vendor id from the caller.
 *
 * Stores nothing and logs nothing from the body: the subject and sender name go only into the alert.
 */

const INBOUND_TOKEN_HEADER = "x-inbound-token";

export async function POST(request: Request) {
  const INBOUND_EMAIL_TOKEN = readOptional(getInboundEmailEnv)?.INBOUND_EMAIL_TOKEN;
  if (!INBOUND_EMAIL_TOKEN) {
    console.error("inbound email alert invoked but INBOUND_EMAIL_TOKEN is unset");
    return Response.json({ error: "Inbound email is not configured" }, { status: 503 });
  }

  const supplied = request.headers.get(INBOUND_TOKEN_HEADER);
  if (!supplied || !timingSafeEqual(supplied, INBOUND_EMAIL_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const fields = (body ?? {}) as { to?: unknown; subject?: unknown; fromName?: unknown };
  const { to, subject, fromName } = fields;
  if (
    typeof to !== "string" ||
    to.trim() === "" ||
    typeof subject !== "string" ||
    !(fromName === undefined || fromName === null || typeof fromName === "string")
  ) {
    return Response.json(
      { error: "Body needs string `to` and `subject`, and an optional string `fromName`" },
      { status: 400 },
    );
  }

  const outcome = await alertForInboundEmail({ to, subject, fromName: fromName ?? null });
  if (!outcome) {
    return Response.json({ error: "Unknown recipient" }, { status: 404 });
  }
  return Response.json(outcome, { status: 200 });
}

export function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
