import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POSTCODE_INTENT_FIELD, parsePostcodeIntent } from "@/lib/delivery-cookie";

/**
 * `#1087` (R1, R3-R6) — which postcode submissions set the fulfilment method.
 *
 * WHY THIS TEST EXISTS. `setDeliveryPostcode` used to set the method NEVER, which read as `#748`'s
 * rule but was wider than that rule needed to be: once the `fulfilment-method` cookie held
 * `COLLECTION`, entering a postcode could not select Delivery, so a shopper who clicked **Delivery**,
 * was asked for a postcode and gave a deliverable one stayed on Click & Collect. The fix is scoped to
 * the submitted intent, which means there are now four outcomes to hold apart — delivery intent with
 * a deliverable postcode, delivery intent with an undeliverable one, edit intent, and no intent field
 * at all — and only the first may touch the method.
 *
 * WHAT IT CAN AND CANNOT PROVE. It proves the DECISION: given an intent and a deliverability verdict,
 * which cookies get written, with which attributes. The cookie jar and the eligibility service are
 * mocked, so it does not prove that a real request resolves the vendor's prefixes the same way or
 * that a Worker serves the `Set-Cookie` — that is `validation.md`'s R3-E2E and R5-E2E, which drive
 * the real control in a browser. This control is not curl-drivable (see
 * `docs/developer-portal/local-dev-playbook.md`), so a browser is the only live route.
 */

const jar = {
  set: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
};

const isPostcodeDeliverable = vi.fn<(postcode: string) => Promise<boolean>>();
const recordRefusalForPostcode = vi.fn(async (..._args: unknown[]) => {});
const revalidatePath = vi.fn();

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/lib/delivery-eligibility-service", () => ({
  isPostcodeDeliverable: (postcode: string) => isPostcodeDeliverable(postcode),
}));
vi.mock("@/lib/delivery-refusals-service", () => ({
  recordRefusalForPostcode: (...args: unknown[]) => recordRefusalForPostcode(...args),
}));

const { setDeliveryPostcode } = await import("@/features/storefront/delivery");

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/** The attributes every cookie this action writes must carry, host-only by design (no `domain`). */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: THIRTY_DAYS_SECONDS,
};

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};

/** Every `jar.set` call that wrote the fulfilment-method cookie. */
const methodWrites = () => jar.set.mock.calls.filter((call) => call[0] === "fulfilment-method");

beforeEach(() => {
  isPostcodeDeliverable.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("parsePostcodeIntent (R1)", () => {
  it("is 'delivery' for exactly that string", () => {
    expect(parsePostcodeIntent("delivery")).toBe("delivery");
  });

  it("is 'edit' for anything else, so an absent or crafted value cannot switch the method", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "DELIVERY",
      "Delivery",
      " delivery",
      "edit",
      "pigeon",
    ]) {
      expect(parsePostcodeIntent(raw)).toBe("edit");
    }
  });

  it("names the field the control submits", () => {
    expect(POSTCODE_INTENT_FIELD).toBe("intent");
  });
});

describe("setDeliveryPostcode", () => {
  it("R3: delivery intent + a deliverable postcode selects DELIVERY, with the postcode cookie's attributes", async () => {
    await setDeliveryPostcode(form({ postcode: "MK9 1AA", intent: "delivery" }));

    expect(jar.set).toHaveBeenCalledWith("delivery-postcode", "MK9 1AA", COOKIE_OPTIONS);
    expect(methodWrites()).toEqual([["fulfilment-method", "DELIVERY", COOKIE_OPTIONS]]);
  });

  it("R4: delivery intent + an undeliverable postcode leaves the method alone", async () => {
    isPostcodeDeliverable.mockResolvedValue(false);

    await setDeliveryPostcode(form({ postcode: "RG1 1AA", intent: "delivery" }));

    // The postcode is still stored — the control shows the ✗ verdict from it.
    expect(jar.set).toHaveBeenCalledWith("delivery-postcode", "RG1 1AA", COOKIE_OPTIONS);
    expect(methodWrites()).toEqual([]);
  });

  it("R5: edit intent never touches the method, even for a deliverable postcode (#748)", async () => {
    await setDeliveryPostcode(form({ postcode: "MK9 1AA", intent: "edit" }));

    expect(jar.set).toHaveBeenCalledWith("delivery-postcode", "MK9 1AA", COOKIE_OPTIONS);
    expect(methodWrites()).toEqual([]);
  });

  it("R5: a form with no intent field is treated as an edit", async () => {
    await setDeliveryPostcode(form({ postcode: "MK9 1AA" }));

    expect(methodWrites()).toEqual([]);
  });

  it("R6: an empty submission clears the postcode and writes no method, under either intent", async () => {
    for (const intent of ["delivery", "edit"]) {
      await setDeliveryPostcode(form({ postcode: "   ", intent }));

      expect(jar.delete).toHaveBeenCalledWith("delivery-postcode");
      expect(methodWrites()).toEqual([]);
      vi.clearAllMocks();
      isPostcodeDeliverable.mockResolvedValue(true);
    }
  });

  it("does not ask whether a postcode is deliverable unless the intent could use the answer", async () => {
    await setDeliveryPostcode(form({ postcode: "MK9 1AA", intent: "edit" }));

    expect(isPostcodeDeliverable).not.toHaveBeenCalled();
  });
});
