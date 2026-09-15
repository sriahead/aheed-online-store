export interface PostcodeResult {
  postcode: string;
  admin_district: string | null;
  admin_county: string | null;
}

export interface PostcodesIoResponse {
  status: number;
  result?: PostcodeResult;
  error?: string;
}

export class PostcodeNotFoundError extends Error {
  constructor() {
    super("Invalid postcode");
    this.name = "PostcodeNotFoundError";
  }
}

export class PostcodeApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostcodeApiError";
  }
}

/**
 * Validates a UK postcode and fetches locality data from postcodes.io.
 * Throws PostcodeNotFoundError for 404 responses.
 * Throws PostcodeApiError for 5xx, timeouts, or network failures.
 */
export async function lookupPostcode(postcode: string): Promise<PostcodeResult> {
  const normalized = postcode.trim().replace(/\s+/g, "");
  if (!normalized) throw new PostcodeNotFoundError();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(normalized)}`,
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      },
    );

    clearTimeout(timeout);

    if (res.status === 404) {
      throw new PostcodeNotFoundError();
    }

    if (!res.ok) {
      throw new PostcodeApiError(`API returned ${res.status}`);
    }

    const data: PostcodesIoResponse = await res.json();
    if (!data.result) {
      throw new PostcodeApiError("Malformed API response");
    }

    return {
      postcode: data.result.postcode,
      admin_district: data.result.admin_district,
      admin_county: data.result.admin_county,
    };
  } catch (error) {
    if (error instanceof PostcodeNotFoundError) throw error;
    throw new PostcodeApiError(error instanceof Error ? error.message : "Unknown error");
  }
}

/**
 * The shape `features/checkout/postcode-lookup.ts` returns to the browser (P10, #749).
 *
 * A thrown error cannot cross the server-action boundary usefully — Next replaces a production
 * throw with an opaque digest, so `err.name === "PostcodeNotFoundError"` (what `CheckoutForm` used
 * to branch on, back when this ran in the browser) can never be true on a deployed environment.
 * The two outcomes the UI actually distinguishes are therefore returned as data.
 *
 * `"unavailable"` deliberately collapses a 5xx, a timeout and a network failure into one case: the
 * UI's response to all three is identical — let the shopper type the address themselves rather than
 * block checkout on a third-party lookup.
 */
export type PostcodeLookupOutcome =
  { ok: true; result: PostcodeResult } | { ok: false; reason: "not-found" | "unavailable" };
