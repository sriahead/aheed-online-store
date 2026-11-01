import { getInboundEmailEnv, readOptional } from "@/lib/config";
import { timingSafeEqual } from "@/lib/stripe-webhook";
import { resolveInboundEmail } from "@/lib/inbound-email-service";

export const dynamic = "force-dynamic";

/**
 * Where should a received email go? (#1217)
 *
 * Called by `workers/inbound-email`, never by a browser. That Worker has no database and no vendor
 * knowledge — the same split as `workers/scheduler` and `app/api/jobs/*` — so it asks here which
 * vendor owns the address, the mailbox to forward to, and whether the message is order-related.
 * Guard shape is deliberately identical to the job routes: fail closed (503) when the token is
 * unset, constant-time compare, 401 otherwise.
 *
 * Stores nothing: the subject is read to find an order number and then dropped (R19).
 */

const INBOUND_TOKEN_HEADER = "x-inbound-token";

export async function POST(request: Request) {
  const INBOUND_EMAIL_TOKEN = readOptional(getInboundEmailEnv)?.INBOUND_EMAIL_TOKEN;
  if (!INBOUND_EMAIL_TOKEN) {
    console.error("inbound email resolve invoked but INBOUND_EMAIL_TOKEN is unset");
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
  const to = (body as { to?: unknown } | null)?.to;
  const subject = (body as { subject?: unknown } | null)?.subject;
  if (typeof to !== "string" || typeof subject !== "string" || to.trim() === "") {
    return Response.json({ error: "Body needs string `to` and `subject`" }, { status: 400 });
  }

  const resolution = await resolveInboundEmail({ to, subject });
  if (!resolution) {
    return Response.json({ error: "Unknown recipient" }, { status: 404 });
  }
  return Response.json(resolution, { status: 200 });
}

export function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
