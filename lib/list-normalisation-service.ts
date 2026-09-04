import { headers } from "next/headers";
import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import { checkListNormalisationRateLimit } from "@/lib/repositories/list-normalisation-rate-limit";

/**
 * Request-scoped entry point for the AI normalisation throttle (P2.6 slice 4, #567).
 *
 * Lives beside, not inside, `lib/repositories/list-normalisation-rate-limit.ts` so the throttle
 * itself keeps taking `prisma` and `vendorId` explicitly and can be exercised against a real
 * database from a plain `tsx` script. `tests/repository-purity.test.ts` and
 * `tests/repository-client-injection.test.ts` enforce both halves of that rule; this file is the
 * sanctioned place for the request context they forbid there.
 *
 * Resolves the client per call, never cached across requests (CLAUDE.md).
 */

/**
 * Same extraction as `lib/products-service.ts` and `app/(storefront)/orders/lookup/page.tsx`,
 * duplicated rather than shared — matching those files' own reasoning (Cloudflare always sets
 * `cf-connecting-ip` on a real request; `x-forwarded-for` is the local-dev fallback) and this
 * repo's existing convention of a few duplicated lines over a new shared helper nobody asked for.
 */
async function resolveClientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function checkListNormalisationAllowed(): Promise<{ allowed: boolean }> {
  return checkListNormalisationRateLimit(
    getPrisma(),
    await getCurrentVendorId(),
    await resolveClientIp(),
  );
}
