/**
 * #1217 R30 — what a duplicate VendorInboundAddress insert really throws, through BOTH Neon
 * adapters, against a DEV database (the host guard in scripts/lib/dev-client.ts refuses anything
 * deployed).
 *
 * Why both: the Client Setup action writes through `getPrisma()` — `PrismaNeonHttp` — which reports
 * a unique violation as raw SQLSTATE "23505", while `getPrismaWs()` — `PrismaNeon` — reports Prisma's
 * "P2002" (CLAUDE.md, the #232 lesson). Probing only the WebSocket client would print a green
 * result that never exercised the code path the dashboard actually runs.
 *
 * It then calls the real repository function through the HTTP client and expects the handled
 * `{ ok: false, reason: "duplicate" }`. Every probe row is removed at the end.
 *
 *   npx tsx scripts/verify-inbound-address-unique.ts
 */
import { connectDev } from "./lib/dev-client";
import { isUniqueViolation } from "../lib/repositories/prisma-errors";
import { createInboundAddress, deleteInboundAddress } from "../lib/repositories/inbound-address";

async function main() {
  const http = connectDev("http");
  const ws = connectDev("ws");
  console.log(`dev host: ${http.host}`);

  const vendor = await http.prisma.vendor.findFirst({ select: { id: true, slug: true } });
  if (!vendor) throw new Error("no vendor on this database");
  const address = `r30-probe-${Date.now()}@example.invalid`;
  const data = {
    vendorId: vendor.id,
    address,
    purpose: "SUPPORT" as const,
    forwardTo: "x@example.invalid",
  };

  let failed = false;
  try {
    await http.prisma.vendorInboundAddress.create({ data });

    for (const [label, client] of [
      ["getPrisma() / PrismaNeonHttp", http.prisma],
      ["getPrismaWs() / PrismaNeon", ws.prisma],
    ] as const) {
      try {
        await client.vendorInboundAddress.create({ data });
        console.log(`✗ ${label}: duplicate insert did NOT throw`);
        failed = true;
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        const handled = isUniqueViolation(error);
        console.log(
          `${handled ? "✓" : "✗"} ${label}: code=${String(code)} isUniqueViolation=${handled}`,
        );
        if (!handled) failed = true;
      }
    }

    const viaRepository = await createInboundAddress(http.prisma as never, vendor.id, data);
    const ok = !viaRepository.ok && viaRepository.reason === "duplicate";
    console.log(
      `${ok ? "✓" : "✗"} createInboundAddress over HTTP: ${JSON.stringify(viaRepository)}`,
    );
    if (!ok) failed = true;
  } finally {
    const row = await http.prisma.vendorInboundAddress.findUnique({ where: { address } });
    if (row) await deleteInboundAddress(http.prisma as never, vendor.id, row.id);
    await Promise.all([http.prisma.$disconnect(), ws.prisma.$disconnect()]);
  }

  console.log(failed ? "R30 FAILED" : "R30 PASSED");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
