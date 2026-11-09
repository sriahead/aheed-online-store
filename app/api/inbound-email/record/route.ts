import { getInboundEmailEnv, readOptional } from "@/lib/config";
import { timingSafeEqual } from "@/lib/stripe-webhook";
import { recordInboundEmailEnquiry } from "@/lib/enquiries-service";

export const dynamic = "force-dynamic";

const INBOUND_TOKEN_HEADER = "x-inbound-token";

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
