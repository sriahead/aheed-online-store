import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { getEnv, readEnv } from "@/lib/config";
import { getReferenceStatus } from "@/lib/reference/reference-status-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const body: Record<string, unknown> = {
    service: "aheed-online-store",
    status: "ok",
    time: new Date().toISOString(),
    // Set via `wrangler deploy --var GIT_COMMIT_SHA:...` in deploy-staging/production.yml;
    // unset locally (npm run preview/dev) and on any environment deployed manually.
    commit: readEnv("GIT_COMMIT_SHA") ?? null,
  };

  // 1) Real DB round-trip through Prisma -> Neon (the end-to-end proof).
  try {
    const row = await getPrisma().healthCheck.findFirst({ orderBy: { checkedAt: "desc" } });
    body.db = { ok: true, label: row?.label ?? null, checkedAt: row?.checkedAt ?? null };
  } catch (e) {
    body.status = "degraded";
    body.db = { ok: false, error: (e as Error).message };
  }

  // 2) Storage config presence (no network call in the smoke test — extend later).
  try {
    const env = getEnv();
    body.storage = {
      configured: Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY),
      cdnBase: env.CDN_BASE_URL ?? null,
    };
  } catch {
    body.storage = { configured: false };
  }

  // 3) Reference database (#771): configured, reachable, and whether materialised coverage matches
  // UK_LOCATION_REF_POSTCODE_AREAS in both directions.
  //
  // REPORTED, NEVER FATAL — `body.status` is deliberately untouched here. An absent or unsynced
  // reference database is a designed, recoverable state: the address surfaces degrade to manual
  // entry, and `lib/config.ts` declines to make these variables required-in-production for exactly
  // that reason. Failing the health check on it would invert that decision and make a provisioning
  // gap look like an outage.
  //
  // Reached through `lib/reference/` only (architecture §3.0, rule 1), and `getReferenceStatus()`
  // resolves in every failure mode rather than throwing — but the try/catch stays, because this
  // route's job is to report what it can, never to 500 on the way to saying so.
  try {
    body.reference = await getReferenceStatus();
  } catch (e) {
    body.reference = { configured: false, reachable: false, error: (e as Error).message };
  }

  return NextResponse.json(body, { status: body.status === "ok" ? 200 : 503 });
}
