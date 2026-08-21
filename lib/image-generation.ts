import { getAiEnv } from "./config";

/**
 * ImageGenerationService port.
 * Uses Cloudflare Workers AI REST API to generate images.
 * Kept vendor-agnostic by using standard fetch and external REST endpoints
 * rather than proprietary Cloudflare AI bindings.
 */

export interface ImageGenerationService {
  generateImage(prompt: string): Promise<ArrayBuffer | null>;
}

export function getImageGenerationService(): ImageGenerationService {
  return {
    async generateImage(prompt: string) {
      const env = getAiEnv();
      const accountId = env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = env.CLOUDFLARE_API_TOKEN;
      if (!accountId || !apiToken) {
        console.warn(
          "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN. AI generation degraded.",
        );
        return null; // Degrade gracefully if not configured
      }

      let attempt = 0;
      let res;

      while (attempt < 3) {
        res = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ prompt }),
          },
        );

        if (res.status === 429) {
          attempt++;
          if (attempt >= 3) break;
          // Exponential backoff: 2s, then 4s
          await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
          continue;
        }
        break;
      }

      if (!res || !res.ok) {
        const text = res ? await res.text() : "Unknown error";
        const status = res ? res.status : 500;

        // If it's still 429 after retries, throw a clean error
        if (status === 429) {
          throw new Error(
            "Cloudflare AI is temporarily at capacity. Please try again in a few seconds.",
          );
        }
        throw new Error(`AI generation failed: ${status} - ${text}`);
      }

      // The REST API for text-to-image returns binary by default unless response_format is used
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = (await res.json()) as any;
        if (data.result && data.result.image) {
          // Cloudflare sometimes returns base64 inside JSON depending on the model/client
          return Uint8Array.from(atob(data.result.image), (c) => c.charCodeAt(0)).buffer;
        }
        throw new Error("AI returned JSON but no image field.");
      }

      return await res.arrayBuffer();
    },
  };
}
