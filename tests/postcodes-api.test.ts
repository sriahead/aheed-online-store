import { describe, it, expect, vi, afterEach } from "vitest";
import { lookupPostcode, PostcodeNotFoundError, PostcodeApiError } from "../lib/postcodes-api";

/**
 * `lib/postcodes-api.ts` against a stubbed `fetch` (#751).
 *
 * These tests used to call the real `api.postcodes.io`. That made a unit test depend on the public
 * internet: it failed `#748`'s full-suite run with `PostcodeApiError: This operation was aborted`
 * (the module's own 3s timeout) and passed in 907ms when run alone, and it would fail on any CI
 * runner with slow or restricted egress. A stub also lets the 404, 5xx, malformed-body and network
 * paths be asserted, none of which a live call can produce on demand.
 */

function stubFetch(impl: (url: string) => Promise<Response> | Response) {
  const spy = vi.fn((input: RequestInfo | URL) => Promise.resolve(impl(String(input))));
  vi.stubGlobal("fetch", spy);
  return spy;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupPostcode", () => {
  it("maps a successful response to the three fields the caller uses", async () => {
    stubFetch(() =>
      jsonResponse({
        status: 200,
        result: {
          postcode: "SW1A 1AA",
          admin_district: "Westminster",
          admin_county: null,
          // A real postcodes.io body carries dozens more fields; none of them should survive.
          longitude: -0.141588,
          country: "England",
        },
      }),
    );

    const result = await lookupPostcode("SW1A 1AA");

    expect(result).toEqual({
      postcode: "SW1A 1AA",
      admin_district: "Westminster",
      admin_county: null,
    });
  });

  it("strips whitespace before building the request URL", async () => {
    const spy = stubFetch(() =>
      jsonResponse({
        status: 200,
        result: { postcode: "MK9 1AA", admin_district: "Milton Keynes", admin_county: null },
      }),
    );

    await lookupPostcode("  mk9  1aa  ");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toBe("https://api.postcodes.io/postcodes/mk91aa");
  });

  it("throws PostcodeNotFoundError on 404", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    await expect(lookupPostcode("XX99 9XX")).rejects.toThrow(PostcodeNotFoundError);
  });

  it("throws PostcodeNotFoundError for an empty postcode without calling the API", async () => {
    const spy = stubFetch(() => jsonResponse({ status: 200 }));
    await expect(lookupPostcode("   ")).rejects.toThrow(PostcodeNotFoundError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("throws PostcodeApiError on a 5xx", async () => {
    stubFetch(() => new Response("", { status: 503 }));
    await expect(lookupPostcode("SW1A 1AA")).rejects.toThrow(PostcodeApiError);
  });

  it("throws PostcodeApiError when the body carries no result", async () => {
    stubFetch(() => jsonResponse({ status: 200 }));
    await expect(lookupPostcode("SW1A 1AA")).rejects.toThrow(PostcodeApiError);
  });

  it("throws PostcodeApiError when the network itself fails", async () => {
    stubFetch(() => Promise.reject(new Error("fetch failed")));
    await expect(lookupPostcode("SW1A 1AA")).rejects.toThrow(PostcodeApiError);
  });

  it("does not leak a PostcodeNotFoundError as a PostcodeApiError", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    // The module catches its own throw and re-wraps everything else; a 404 must survive that.
    await expect(lookupPostcode("XX99 9XX")).rejects.not.toThrow(PostcodeApiError);
  });
});
