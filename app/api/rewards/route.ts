import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getRewardsDataForUser } from "@/lib/rewards-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Combine request headers and next/headers to ensure cookies are never missed
  const reqHeaders = new Headers(request.headers);
  const nextHeaders = await headers();
  if (!reqHeaders.has("cookie") && nextHeaders.has("cookie")) {
    reqHeaders.set("cookie", nextHeaders.get("cookie")!);
  }

  const session = await (await getAuth()).api.getSession({ headers: reqHeaders });

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const data = await getRewardsDataForUser(session?.user?.id ?? null, baseUrl);

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
