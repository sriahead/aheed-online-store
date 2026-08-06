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
      <h1>Aheed Food Centre</h1>
      <p>
        Walking skeleton — proving the full path <code>browser → Worker → Prisma → Neon</code>.
      </p>

      <div className="card">
        <p>
          Database:{" "}
          {dbState === "connected" ? (
            <span className="ok">connected ✓</span>
          ) : (
            <span className="bad">error ✗</span>
          )}
        </p>
        <p style={{ margin: 0 }}>
          <small>{detail}</small>
        </p>
      </div>

      <p style={{ marginTop: "1.5rem" }}>
        Machine-readable health:{" "}
        <a href="/api/health">
          <code>/api/health</code>
        </a>
      </p>
    </main>
  );
}
