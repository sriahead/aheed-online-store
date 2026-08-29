import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAuthRateLimit } from "@/lib/repositories/auth-rate-limit";

const count = vi.fn();
const create = vi.fn();

const mockPrisma = {
  authenticationAttempt: {
    count,
    create,
  },
} as any;

describe("checkAuthRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests when under the limit", async () => {
    count.mockResolvedValue(4);
    
    const result = await checkAuthRateLimit(mockPrisma, "vendor-1", "127.0.0.1");
    
    expect(result.allowed).toBe(true);
    expect(count).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    
    // Ensure IP was hashed (SHA-256 length is 64 hex characters)
    const callArgs = create.mock.calls[0][0];
    expect(callArgs.data.vendorId).toBe("vendor-1");
    expect(callArgs.data.ipHash).toHaveLength(64);
  });

  it("blocks requests when limit is reached", async () => {
    count.mockResolvedValue(5);
    
    const result = await checkAuthRateLimit(mockPrisma, "vendor-1", "127.0.0.1");
    
    expect(result.allowed).toBe(false);
    expect(count).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });
});
