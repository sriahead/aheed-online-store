import { getInboundEmailEnv, readOptional } from "@/lib/config";
import { timingSafeEqual } from "@/lib/stripe-webhook";
import { recordInboundEmailEnquiry } from "@/lib/enquiries-service";

export const dynamic = "force-dynamic";

const INBOUND_TOKEN_HEADER = "x-inbound-token";

/**
 * #1482 R27 — per-field caps. The Worker already cuts the body to 4,000 characters, but the route
 * does not trust its caller's arithmetic: anything over a cap is refused, not truncated.
 * 320 is the longest legal address, 998 the RFC 5322 line limit a subject cannot exceed.
 */
const FIELD_CAPS = { to: 320, fromEmail: 320, fromName: 200, subject: 998, message: 4000 } as const;

export async function POST(request: Request) {
  const INBOUND_EMAIL_TOKEN = readOptional(getInboundEmailEnv)?.INBOUND_EMAIL_TOKEN;
  if (!INBOUND_EMAIL_TOKEN) {
    console.error("inbound email record invoked but INBOUND_EMAIL_TOKEN is unset");
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

  const payload = body as {
    to?: unknown;
    fromEmail?: unknown;
    fromName?: unknown;
    subject?: unknown;
    message?: unknown;
  } | null;

  if (
    typeof payload?.to !== "string" ||
    typeof payload?.fromEmail !== "string" ||
    typeof payload?.subject !== "string" ||
    typeof payload?.message !== "string" ||
    payload.to.trim() === "" ||
    payload.fromEmail.trim() === ""
  ) {
    return Response.json(
      { error: "Body needs string `to`, `fromEmail`, `subject`, and `message`" },
      { status: 400 },
    );
  }

  const fromName = typeof payload.fromName === "string" ? payload.fromName : null;
  const lengths = {
    to: payload.to.length,
    fromEmail: payload.fromEmail.length,
    fromName: fromName?.length ?? 0,
    subject: payload.subject.length,
    message: payload.message.length,
  };
  const overCap = (Object.keys(FIELD_CAPS) as (keyof typeof FIELD_CAPS)[]).find(
    (field) => lengths[field] > FIELD_CAPS[field],
  );
  if (overCap) {
    return Response.json(
      { error: `\`${overCap}\` exceeds ${FIELD_CAPS[overCap]} characters` },
      { status: 400 },
    );
  }
  const result = await recordInboundEmailEnquiry({
    to: payload.to,
    fromEmail: payload.fromEmail,
    fromName,
    subject: payload.subject,
    message: payload.message,
  });

  if (!result.recorded) {
    return Response.json({ error: "Unknown recipient" }, { status: 404 });
  }

  return Response.json(result, { status: 200 });
}

export function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
