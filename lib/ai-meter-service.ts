import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { createAiMeter, type AiFeature, type AiMeter } from "@/lib/ai-meter";

/**
 * Request-scoped entry point for the Workers AI meter (#1017): the current request's vendor, a
 * fresh client. Built on every call and never cached across requests (CLAUDE.md). `app/` and
 * `features/` may not import `@/lib/db` (ESLint, ADR-004 slice 2), so this is how they get a meter.
 */
export async function getCurrentAiMeter(feature: AiFeature): Promise<AiMeter> {
  return createAiMeter(getPrisma(), await getCurrentVendorId(), feature);
}

/**
 * A meter for a vendor the caller already holds — a route's `auth.vendorId` — so the vendor charged
 * is always the one the session acts for, never one read from the request body.
 */
export function getVendorAiMeter(vendorId: string, feature: AiFeature): AiMeter {
  return createAiMeter(getPrisma(), vendorId, feature);
}
