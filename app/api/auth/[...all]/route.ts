import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// getAuth() reads env via lib/config's getEnv() and resolves the per-request auth
// origin (host/VendorDomain/cookie domain, ADR-004 slice 3c) — both must run in
// request scope on Workers (see lib/config.ts) — so it's awaited inside each
// handler, not once at module scope, matching lib/db.ts's pattern.
export async function GET(req: Request) {
  return toNextJsHandler(await getAuth()).GET(req);
}

export async function POST(req: Request) {
  return toNextJsHandler(await getAuth()).POST(req);
}
