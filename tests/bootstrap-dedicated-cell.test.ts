import { describe, it, expect, vi } from "vitest";
import {
  parseBootstrapArgs,
  bootstrapDedicatedCell,
  AHEED_VENDOR_ID,
  AFC_HOSTS,
} from "@/scripts/bootstrap-dedicated-cell";
import type { PrismaClient } from "@prisma/client";

describe("Bootstrap Dedicated Cell CLI & Logic", () => {
  describe("parseBootstrapArgs", () => {
    it("handles help flag", () => {
      expect(parseBootstrapArgs(["--help"])).toEqual({ help: true });
      expect(parseBootstrapArgs(["-h"])).toEqual({ help: true });
    });

    it("errors when --env is missing", () => {
      const result = parseBootstrapArgs([]);
      expect(result.error).toContain("Missing required flag: --env");
    });

    it("errors on invalid environment name", () => {
      const result = parseBootstrapArgs(["--env", "invalid-env"]);
      expect(result.error).toContain("Invalid --env");
    });

    it("successfully parses valid afc-staging environment", () => {
      const result = parseBootstrapArgs(["--env", "afc-staging"]);
      expect(result.args).toEqual({
        env: "afc-staging",
        dryRun: false,
      });
    });

    it("successfully parses valid afc-production with --dry-run", () => {
      const result = parseBootstrapArgs(["--env", "afc-production", "--dry-run"]);
      expect(result.args).toEqual({
        env: "afc-production",
        dryRun: true,
      });
    });
  });

  describe("bootstrapDedicatedCell", () => {
    it("refuses bootstrap on afc-production if demo users exist", async () => {
      const mockPrisma = {
        user: {
          count: vi.fn().mockResolvedValue(3),
        },
      } as unknown as PrismaClient;

      await expect(bootstrapDedicatedCell(mockPrisma, { env: "afc-production" })).rejects.toThrow(
        "Production safety violation: target database contains 3 demo user(s)",
      );
    });

    it("performs dry-run without writing to database", async () => {
      const mockPrisma = {
        user: {
          count: vi.fn().mockResolvedValue(0),
        },
        healthCheck: {
          count: vi.fn(),
          create: vi.fn(),
        },
      } as unknown as PrismaClient;

      const result = await bootstrapDedicatedCell(mockPrisma, {
        env: "afc-staging",
        dryRun: true,
      });

      expect(result.vendorId).toBe(AHEED_VENDOR_ID);
      expect(result.host).toBe(AFC_HOSTS["afc-staging"]);
      expect(mockPrisma.healthCheck.create).not.toHaveBeenCalled();
    });
  });
});
