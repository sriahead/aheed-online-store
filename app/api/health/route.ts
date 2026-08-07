import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { getEnv, readEnv } from "@/lib/config";

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

  return NextResponse.json(body, { status: body.status === "ok" ? 200 : 503 });
}
