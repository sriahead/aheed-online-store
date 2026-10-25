import { getPrisma, getPrismaWs } from "@/lib/db";
import { applyPlan, type ApplyResult, type ImportDb } from "@/lib/catalogue-import/apply";
import type { ImportPlan } from "@/lib/catalogue-import/plan";

const CHUNK_SIZE = 1000;

/**
 * Counts how many products matching the given slugs already exist for this vendor.
 * Runs read-only queries using the lightweight HTTP client.
 */
export async function countExistingProductsBySlugs(
  vendorId: string,
  slugs: readonly string[],
): Promise<number> {
  const prisma = getPrisma();
  let count = 0;

  for (let i = 0; i < slugs.length; i += CHUNK_SIZE) {
    const chunk = slugs.slice(i, i + CHUNK_SIZE);
    const chunkCount = await prisma.product.count({
      where: {
        vendorId,
        slug: { in: chunk },
      },
    });
    count += chunkCount;
  }

  return count;
}

/**
 * Executes an ImportPlan for the vendor using the WebSocket client for interactive transactions.
 */
export async function applyImportPlanForVendor(
  vendorId: string,
  plan: ImportPlan,
): Promise<ApplyResult> {
  const prismaWs = getPrismaWs();
  return applyPlan(prismaWs as unknown as ImportDb, vendorId, plan);
}
