import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reference database's operational status (#771).
 *
 * The behaviour worth pinning is not the happy path — it is that this function RESOLVES in every
 * failure mode. `/api/health` renders it unconditionally, and the whole reason this exists is that
 * an unconfigured or unreachable reference database is a designed, recoverable state rather than an
 * outage. A version of this that threw on an absent binding would turn the exact provisioning gap
 * it was written to reveal into a 500 on the health endpoint.
 *
 * Mocked at the module boundary rather than with a stub client, because the drift arithmetic is the
 * subject and the client is not.
 */

const configured = vi.fn(() => true);
const getReferencePrisma = vi.fn(() => ({}) as never);
const getRequiredPostcodeAreas = vi.fn(() => ["MK", "RG"]);
const listDatasetStatuses = vi.fn();
const listCoveredAreas = vi.fn();

vi.mock("@/lib/reference-db", () => ({
  isReferenceDatabaseConfigured: () => configured(),
  getReferencePrisma: () => getReferencePrisma(),
}));

vi.mock("@/lib/config", () => ({
  getRequiredPostcodeAreas: () => getRequiredPostcodeAreas(),
}));

vi.mock("@/lib/repositories/reference-data", () => ({
  listDatasetStatuses: (...args: unknown[]) => listDatasetStatuses(...args),
}));

vi.mock("@/lib/repositories/reference-coverage", () => ({
  listCoveredAreas: (...args: unknown[]) => listCoveredAreas(...args),
}));

function dataset(sourceKey: string, overrides: Record<string, unknown> = {}) {
  return {
    sourceKey,
    sourceVersion: "2026-08",
    recordCount: 40031,
    cacheVersion: 3,
    lastCheckedAt: new Date("2026-09-16T00:00:00.000Z"),
    lastSyncedAt: new Date("2026-09-16T00:00:00.000Z"),
    syncStatus: "SUCCEEDED",
    syncError: null,
    initialised: true,
    ...overrides,
  };
}

function areas(...list: string[]) {
  return list.map((postcodeArea) => ({
    postcodeArea,
    sourceVersion: "2026-08",
    recordCount: 1,
    materialisedAt: new Date("2026-09-16T00:00:00.000Z"),
  }));
}

async function subject() {
  const loaded = await import("@/lib/reference/reference-status-service");
  return loaded.getReferenceStatus;
}

describe("getReferenceStatus", () => {
  beforeEach(() => {
    vi.resetModules();
    configured.mockReturnValue(true);
    getRequiredPostcodeAreas.mockReturnValue(["MK", "RG"]);
    listDatasetStatuses.mockReset();
    listCoveredAreas.mockReset();
  });

  it("reports no drift when coverage matches configuration", async () => {
    listDatasetStatuses.mockResolvedValue([dataset("code-point-open")]);
    listCoveredAreas.mockResolvedValue(areas("MK", "RG"));

    const status = await (await subject())();

    expect(status.configured).toBe(true);
    expect(status.reachable).toBe(true);
    expect(status.requiredAreas).toEqual(["MK", "RG"]);
    expect(status.drift).toBe(false);
    expect(status.sources[0]).toMatchObject({
      sourceKey: "code-point-open",
      coveredAreas: ["MK", "RG"],
      missingAreas: [],
      unsupportedAreas: [],
      lastSyncedAt: "2026-09-16T00:00:00.000Z",
    });
  });

  it("reports a required area that has never been imported", async () => {
    listDatasetStatuses.mockResolvedValue([dataset("os-open-names")]);
    listCoveredAreas.mockResolvedValue(areas("MK"));

    const status = await (await subject())();

    expect(status.sources[0].missingAreas).toEqual(["RG"]);
    expect(status.sources[0].unsupportedAreas).toEqual([]);
    expect(status.drift).toBe(true);
  });

  it("reports an area that is covered but no longer configured", async () => {
    // The LU case: nothing will ever refresh it, yet its coverage row claims authority over it.
    listDatasetStatuses.mockResolvedValue([dataset("code-point-open")]);
    listCoveredAreas.mockResolvedValue(areas("LU", "MK", "RG"));

    const status = await (await subject())();

    expect(status.sources[0].unsupportedAreas).toEqual(["LU"]);
    expect(status.sources[0].missingAreas).toEqual([]);
    expect(status.drift).toBe(true);
  });

  it("reports drift in both directions at once", async () => {
    listDatasetStatuses.mockResolvedValue([dataset("code-point-open")]);
    listCoveredAreas.mockResolvedValue(areas("LU", "MK"));

    const status = await (await subject())();

    expect(status.sources[0]).toMatchObject({
      missingAreas: ["RG"],
      unsupportedAreas: ["LU"],
    });
    expect(status.drift).toBe(true);
  });

  it("returns configured: false rather than throwing when there is no reference database", async () => {
    // The staging failure this endpoint exists to expose: the binding is simply absent, nothing
    // logs, and every postcode silently answers UNVERIFIED.
    configured.mockReturnValue(false);

    const status = await (await subject())();

    expect(status).toMatchObject({
      configured: false,
      reachable: false,
      requiredAreas: ["MK", "RG"],
      sources: [],
      drift: false,
    });
    expect(listDatasetStatuses).not.toHaveBeenCalled();
  });

  it("still reports the areas it EXPECTS when unconfigured", async () => {
    // Which is what makes `configured: false` actionable rather than merely true.
    configured.mockReturnValue(false);
    getRequiredPostcodeAreas.mockReturnValue(["MK", "RG"]);

    const status = await (await subject())();

    expect(status.requiredAreas).toEqual(["MK", "RG"]);
  });

  it("resolves rather than rejects when the database is unreachable", async () => {
    listDatasetStatuses.mockRejectedValue(new Error("Can't reach database server"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const status = await (await subject())();

    expect(status).toMatchObject({ configured: true, reachable: false, sources: [], drift: false });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("resolves when the schema has never been migrated", async () => {
    // Production's reference branch was in exactly this state: reachable, zero tables.
    listDatasetStatuses.mockRejectedValue(
      new Error("The table `public.ReferenceDataset` does not exist in the current database."),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const status = await (await subject())();

    expect(status.reachable).toBe(false);
    expect(status.drift).toBe(false);
    error.mockRestore();
  });

  it("reports an empty required list without claiming drift", async () => {
    // Unset configuration means we cannot say what is expected — not that everything is unsupported.
    getRequiredPostcodeAreas.mockReturnValue([]);
    listDatasetStatuses.mockResolvedValue([dataset("code-point-open")]);
    listCoveredAreas.mockResolvedValue(areas("MK", "RG"));

    const status = await (await subject())();

    expect(status.requiredAreas).toEqual([]);
    expect(status.sources[0].missingAreas).toEqual([]);
    // Covered-but-not-required IS reported here, because rows exist that nothing claims to need.
    expect(status.sources[0].unsupportedAreas).toEqual(["MK", "RG"]);
  });

  it("carries no connection detail in its result", async () => {
    listDatasetStatuses.mockResolvedValue([dataset("code-point-open")]);
    listCoveredAreas.mockResolvedValue(areas("MK", "RG"));

    const status = await (await subject())();

    expect(JSON.stringify(status)).not.toMatch(/postgres|neon\.tech|password|ep-[a-z]+-[a-z]+/i);
  });
});
