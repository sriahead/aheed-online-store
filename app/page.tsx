import { getPrisma } from "@/lib/db";

// Always render at request time (never statically prerender — there is no DB at build).
export const dynamic = "force-dynamic";

export default async function Home() {
  let dbState: "connected" | "error" = "error";
  let detail = "";
  try {
    const row = await getPrisma().healthCheck.findFirst({ orderBy: { checkedAt: "desc" } });
    dbState = "connected";
    detail = row
      ? `latest row: "${row.label}" @ ${row.checkedAt.toISOString()}`
      : "(no rows yet — run the seed)";
  } catch (e) {
    detail = (e as Error).message;
  }

  return (
    <main>
      <h1 className="text-3xl font-semibold text-primary">Aheed Food Centre</h1>
      <p>
        Walking skeleton — proving the full path{" "}
        <code className="rounded-sm bg-black/10 px-1.5 py-0.5">
          browser → Worker → Prisma → Neon
        </code>
        .
      </p>

      <div className="mt-4 rounded-md border border-black/10 bg-surface-muted p-5">
        <p>
          Database:{" "}
          {dbState === "connected" ? (
            // text-primary (not text-action): --color-action's brand green is too
            // light for AA text contrast on white — see specs/design-system.md.
            <span className="font-semibold text-primary">connected ✓</span>
          ) : (
            <span className="font-semibold text-danger">error ✗</span>
          )}
        </p>
        <p className="m-0">
          <small>{detail}</small>
        </p>
      </div>

      <p className="mt-6">
        Machine-readable health:{" "}
        <a href="/api/health" className="text-primary underline">
          <code className="rounded-sm bg-black/10 px-1.5 py-0.5">/api/health</code>
        </a>
      </p>
    </main>
  );
}
