import { describe, it, expect, vi } from "vitest";

// Same module-load mocks as tests/discounts-repository.test.ts: the repository
// imports lib/db (→ @prisma/client/wasm, unresolvable under vitest).
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn() }));

const { claimCode, previewCode } = await import("@/lib/repositories/discounts");

/**
 * #967 (R12, R13, R23) — `previewCode` is `claimCode`'s decision without the
 * reservation. The checkout page calls it for a code pre-filled from the
 * referral cookie, so it must (a) reach the same answer `claimCode` would and
 * (b) never write: rendering checkout must not use a code up.
 */

const VENDOR = "v-1";
const USER = "u-1";
const NOW = new Date("2026-10-03T12:00:00Z");

type CodeRow = {
  id: string;
  kind: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  minSubtotalPence: number;
  startsAt: Date;
  endsAt: Date | null;
  remainingRedemptions: number | null;
  maxPerCustomer: number | null;
  isActive: boolean;
  description?: string | null;
};

const aCode = (overrides: Partial<CodeRow> = {}): CodeRow => ({
  id: "c-1",
  kind: "FIXED_AMOUNT",
  value: 300,
  minSubtotalPence: 0,
  startsAt: new Date("2026-01-01"),
  endsAt: null,
  remainingRedemptions: 5,
  maxPerCustomer: null,
  isActive: true,
  ...overrides,
});

/** Reads answer from fixtures; every write method throws. */
function readOnlyDb(code: CodeRow | null, priorUses = 0) {
  const refuse = () => {
    throw new Error("previewCode must not write");
  };
  return {
    discountCode: {
      findUnique: async () => code,
      update: refuse,
      updateMany: refuse,
      create: refuse,
      upsert: refuse,
      delete: refuse,
      deleteMany: refuse,
    },
    discountRedemption: {
      findFirst: async () => (priorUses > 0 ? { seq: priorUses - 1 } : null),
      count: async () => priorUses,
      update: refuse,
      updateMany: refuse,
      create: refuse,
      upsert: refuse,
      delete: refuse,
      deleteMany: refuse,
    },
  };
}

/** The same reads, plus the one write `claimCode` makes, which succeeds. */
function claimingDb(code: CodeRow | null, priorUses = 0) {
  const db = readOnlyDb(code, priorUses);
  return {
    ...db,
    discountCode: { ...db.discountCode, updateMany: async () => ({ count: 1 }) },
  };
}

const base = { subtotalPence: 2000, deliveryFeePence: 300, now: NOW };

const scenarios: {
  name: string;
  code: CodeRow | null;
  input: { code: string; userId: string | null };
  priorUses?: number;
}[] = [
  { name: "unknown code", code: null, input: { code: "NOPE", userId: null } },
  { name: "inactive", code: aCode({ isActive: false }), input: { code: "x", userId: null } },
  {
    name: "expired",
    code: aCode({ endsAt: new Date("2026-02-01") }),
    input: { code: "x", userId: null },
  },
  {
    name: "below minimum",
    code: aCode({ minSubtotalPence: 5000 }),
    input: { code: "x", userId: null },
  },
  {
    name: "guest with a per-customer cap",
    code: aCode({ maxPerCustomer: 1 }),
    input: { code: "x", userId: null },
  },
  {
    name: "customer limit reached",
    code: aCode({ maxPerCustomer: 1 }),
    input: { code: "x", userId: USER },
    priorUses: 1,
  },
  { name: "valid code", code: aCode(), input: { code: "spec967a", userId: USER } },
];

describe("previewCode", () => {
  it.each(scenarios)("$name: same answer as claimCode, with no write", async (s) => {
    const input = { ...base, ...s.input };
    const preview = await previewCode(readOnlyDb(s.code, s.priorUses) as never, VENDOR, input);
    const claim = await claimCode(claimingDb(s.code, s.priorUses) as never, VENDOR, input);

    expect(preview.ok).toBe(claim.ok);
    if (preview.ok && claim.ok) {
      expect(preview.discountPence).toBe(claim.claim.discountPence);
      expect(preview.codeId).toBe(claim.claim.codeId);
      expect(preview.seq).toBe(claim.claim.seq);
    } else if (!preview.ok && !claim.ok) {
      expect(preview.reason).toBe(claim.reason);
    }
  });

  it("names the expected reasons, so the comparison above is not vacuous", async () => {
    const reasons = await Promise.all(
      scenarios.map(async (s) => {
        const r = await previewCode(readOnlyDb(s.code, s.priorUses) as never, VENDOR, {
          ...base,
          ...s.input,
        });
        return r.ok ? `ok:${r.discountPence}` : r.reason;
      }),
    );
    expect(reasons).toEqual([
      "UNKNOWN",
      "INACTIVE",
      "EXPIRED",
      "BELOW_MINIMUM",
      "SIGN_IN_REQUIRED",
      "CUSTOMER_LIMIT_REACHED",
      "ok:300",
    ]);
  });
});

/**
 * #972 (R2, R3) — a shopper's own `REF-` code is refused before any other
 * evaluation, by `previewCode` and therefore by `claimCode`.
 */
describe("previewCode — own referral code (#972)", () => {
  const OWNER = "user_abc123";
  const referral = (overrides: Partial<CodeRow> = {}) =>
    aCode({
      value: 500,
      minSubtotalPence: 2000,
      maxPerCustomer: 1,
      remainingRedemptions: null,
      description: `Referral from user ${OWNER}`,
      ...overrides,
    });
  const input = (userId: string | null, code = "ref-userabc1") => ({ ...base, code, userId });

  it("refuses the owner's own code in previewCode", async () => {
    const result = await previewCode(readOnlyDb(referral()) as never, VENDOR, input(OWNER));
    expect(result).toEqual({ ok: false, reason: "OWN_REFERRAL_CODE" });
  });

  it("refuses it in claimCode with no reservation written", async () => {
    const db = readOnlyDb(referral()); // updateMany throws if it is ever reached
    const result = await claimCode(db as never, VENDOR, input(OWNER));
    expect(result).toEqual({ ok: false, reason: "OWN_REFERRAL_CODE" });
  });

  it("outranks every evaluateCode reason, including INACTIVE", async () => {
    const db = readOnlyDb(referral({ isActive: false, endsAt: new Date("2026-02-01") }));
    const result = await previewCode(db as never, VENDOR, input(OWNER));
    expect(result).toEqual({ ok: false, reason: "OWN_REFERRAL_CODE" });
  });

  it("(a) does not refuse another shopper's code for that reason", async () => {
    const result = await previewCode(readOnlyDb(referral()) as never, VENDOR, input("user_other"));
    expect(result).toEqual(expect.objectContaining({ ok: true, discountPence: 500 }));
  });

  it("(b) leaves a guest to the existing evaluation", async () => {
    const result = await previewCode(readOnlyDb(referral()) as never, VENDOR, input(null));
    expect(result).toEqual({ ok: false, reason: "SIGN_IN_REQUIRED" });
  });

  it("(c) does not refuse a non-REF code whose description names the shopper", async () => {
    const result = await previewCode(readOnlyDb(referral()) as never, VENDOR, {
      ...input(OWNER),
      code: "WELCOME5",
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, discountPence: 500 }));
  });
});
