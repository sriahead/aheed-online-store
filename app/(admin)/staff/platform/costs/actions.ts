"use server";

import { requireVendorRole } from "@/lib/auth-rbac";
import { runPricingRefresh } from "@/lib/pricing-refresh-service";
import type { RefreshResult, RefreshScope } from "@/lib/pricing/refresh";

/**
 * #1309 - the two refresh buttons on /staff/platform/costs. Platform admins only. Neither takes an
 * argument: the pages fetched come from the committed registries, never from the request. Both return
 * suggestions only; nothing is saved apart from the AI meter's usage rows.
 *
 * A "use server" file may export ONLY async functions (CLAUDE.md), so the result type lives in
 * lib/pricing/refresh.ts.
 */

type ActionResult = { ok: true; result: RefreshResult } | { ok: false; error: string };

async function run(scope: RefreshScope): Promise<ActionResult> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok || auth.via !== "platform-admin") {
    return { ok: false, error: "Platform admin only" };
  }
  try {
    return { ok: true, result: await runPricingRefresh(auth.vendorId, scope) };
  } catch {
    return { ok: false, error: "The refresh failed. Try again in a moment." };
  }
}

export async function refreshCostsAction(): Promise<ActionResult> {
  return run("costs");
}

export async function refreshRecommendationsAction(): Promise<ActionResult> {
  return run("all");
}
