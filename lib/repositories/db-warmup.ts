import type { DbWarmupMode } from "@prisma/client/wasm";
import type { getPrisma } from "@/lib/db";

/**
 * #1491 R3 — the cell's single `DbWarmupConfig` row. Platform-wide: one database serves every vendor
 * in a cell, so there is no `vendorId` (the model is not vendor-scoped). Takes its client explicitly
 * (tests/repository-client-injection.test.ts). Singular `findUnique`/`upsert` only, both safe on the
 * HTTP adapter.
 */

type Db = ReturnType<typeof getPrisma>;

const CONFIG_ID = "default";

export interface DbWarmupConfigRow {
  enabled: boolean;
  mode: DbWarmupMode;
  activityEnabled: boolean;
  activityMinutes: number;
  leadMinutes: number;
  customStart: string | null;
  customEnd: string | null;
  computeMilliUnits: number;
  priceMicroUsdPerCuHour: number;
  updatedBy: string | null;
  updatedAt: Date | null;
}

/** The schema defaults, returned when no row exists yet (nothing has ever been saved). */
export const DB_WARMUP_DEFAULTS: DbWarmupConfigRow = {
  enabled: false,
  mode: "OPENING_HOURS",
  activityEnabled: true,
  activityMinutes: 30,
  leadMinutes: 30,
  customStart: null,
  customEnd: null,
  computeMilliUnits: 250,
  priceMicroUsdPerCuHour: 106000,
  updatedBy: null,
  updatedAt: null,
};

const SELECT = {
  enabled: true,
  mode: true,
  activityEnabled: true,
  activityMinutes: true,
  leadMinutes: true,
  customStart: true,
  customEnd: true,
  computeMilliUnits: true,
  priceMicroUsdPerCuHour: true,
  updatedBy: true,
  updatedAt: true,
} as const;

export async function getDbWarmupConfig(prisma: Db): Promise<DbWarmupConfigRow> {
  const row = await prisma.dbWarmupConfig.findUnique({ where: { id: CONFIG_ID }, select: SELECT });
  return row ?? DB_WARMUP_DEFAULTS;
}

export type DbWarmupConfigInput = Omit<DbWarmupConfigRow, "updatedBy" | "updatedAt">;

export async function saveDbWarmupConfig(
  prisma: Db,
  input: DbWarmupConfigInput,
  actorEmail: string,
): Promise<DbWarmupConfigRow> {
  // Copy only the writable fields: a caller's object may carry more (e.g. a spread of a row with
  // `updatedAt`), and nothing but these nine plus `updatedBy` may ever reach the database.
  const data = {
    enabled: input.enabled,
    mode: input.mode,
    activityEnabled: input.activityEnabled,
    activityMinutes: input.activityMinutes,
    leadMinutes: input.leadMinutes,
    customStart: input.customStart,
    customEnd: input.customEnd,
    computeMilliUnits: input.computeMilliUnits,
    priceMicroUsdPerCuHour: input.priceMicroUsdPerCuHour,
    updatedBy: actorEmail,
  };
  return prisma.dbWarmupConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID, ...data },
    update: data,
    select: SELECT,
  });
}
