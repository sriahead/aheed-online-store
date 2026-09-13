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

    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(normalized)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    
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
