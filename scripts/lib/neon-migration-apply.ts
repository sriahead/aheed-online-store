/**
 * #1333 — the `--apply` write block of `scripts/migrate-to-new-neon.ts`, kept free of imports so a
 * test can drive it with a recording fake. Spec: specs/2026-10-31-atomic-neon-copy/.
 *
 * The script runs `applyPlan` inside ONE interactive transaction on its WebSocket (`PrismaNeon`)
 * client, so any error thrown here rolls the target back to what `migrate deploy` left. That is why
 * nothing here catches: swallowing an error would commit a partial copy.
 */

type Row = Record<string, unknown>;

export type WriteDelegate = {
  createMany: (args: { data: Row[] }) => Promise<unknown>;
  deleteMany: (args: { where: { id: string } }) => Promise<unknown>;
};

/** Model name (`VendorFaq`) to the writes this needs on it. */
export type ApplyClient = (model: string) => WriteDelegate;

export type ApplyPlan = {
  order: string[];
  rows: Map<string, Row[]>;
  domains: Row[];
};

export type ApplyOptions = {
  /** The target is `seeded-only`: delete the migration-seeded vendor before any copied row. */
  replaceSeeded: boolean;
  seededVendorId: string;
  /** `--simulate-failure`: throw after the last write so the live check can prove the rollback. */
  simulateFailure?: boolean;
  log?: (line: string) => void;
};

export class SimulatedFailure extends Error {
  constructor() {
    super("simulated failure after every write (--simulate-failure)");
    this.name = "SimulatedFailure";
  }
}

/**
 * Prisma's interactive defaults (5 s timeout, 2 s wait) are too tight for a network copy; the
 * staging plan is ~600 rows, so ten minutes leaves two orders of magnitude of headroom.
 */
export const APPLY_TRANSACTION_OPTIONS = { maxWait: 30_000, timeout: 600_000 };

const CHUNK = 500;

export async function applyPlan(
  client: ApplyClient,
  plan: ApplyPlan,
  options: ApplyOptions,
): Promise<void> {
  const log = options.log ?? (() => {});
  // The copied `aheed-food-centre` would otherwise collide with the seeded one on both its primary
  // key and its unique slug.
  if (options.replaceSeeded) {
    await client("Vendor").deleteMany({ where: { id: options.seededVendorId } });
    log("removed the migration-seeded vendor (inside the transaction).");
  }
  for (const model of plan.order) {
    const data = plan.rows.get(model) ?? [];
    for (let i = 0; i < data.length; i += CHUNK) {
      await client(model).createMany({ data: data.slice(i, i + CHUNK) });
    }
  }
  if (plan.domains.length > 0) {
    await client("VendorDomain").createMany({ data: plan.domains });
  }
  log("rows written (not yet committed).");
  if (options.simulateFailure) throw new SimulatedFailure();
}
