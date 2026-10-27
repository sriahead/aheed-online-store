import { requireVendorRole } from "@/lib/auth-rbac";
import { analyse, COMMITTED } from "@/lib/pricing/committed";
import { buildCsv, CSV_SECTIONS, type CsvSection } from "@/lib/pricing/csv";

/**
 * #1309 - CSV export of one section of /staff/platform/costs. Platform admins only: 401 without a
 * session, 403 for anyone else, and no data in either. Reads only the committed registries.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return new Response(auth.status === 401 ? "Sign in required" : "Platform admin only", {
      status: auth.status,
    });
  }
  if (auth.via !== "platform-admin") {
    return new Response("Platform admin only", { status: 403 });
  }

  const section = new URL(request.url).searchParams.get("section");
  if (!section || !CSV_SECTIONS.includes(section as CsvSection)) {
    return new Response(`section must be one of: ${CSV_SECTIONS.join(", ")}`, { status: 400 });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const body = buildCsv(section as CsvSection, COMMITTED, analyse(COMMITTED, now), today);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${section}-${today}.csv"`,
      "cache-control": "no-store",
    },
  });
}
