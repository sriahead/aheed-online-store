import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// getAuth() is a lazy singleton reading env via lib/config's getEnv(), which
// must run in request scope on Workers (see lib/config.ts) — so it's called
// inside each handler, not once at module scope, matching lib/db.ts's pattern.
export async function GET(req: Request) {
  return toNextJsHandler(getAuth()).GET(req);
}

export async function POST(req: Request) {
  return toNextJsHandler(getAuth()).POST(req);
}
