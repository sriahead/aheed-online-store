import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isIndexable } from "@/lib/config";

/**
 * robots.txt, decided by ENVIRONMENT and served for whichever host asked (#955).
 *
 * WHAT THIS REPLACED, AND WHY IT MATTERED. This file hardcoded
 * `const PRODUCTION_HOST = "aheedfoodcentre.nocaped.com"` and served `Disallow: /` to anything
 * that did not match it. The intent was right — staging must never be indexed — but the mechanism
 * made "is this production?" and "is this Aheed?" the same question, so in production
 * `https://srimart.nocaped.com/robots.txt` forbade crawling outright. Every vendor other than the
 * first was de-indexed, which breaks ADR-004's rule that nothing vendor-specific lives in code.
 * The two questions are now separate: `isIndexable()` answers the environment one from
 * `SEO_INDEXABLE`, and the request's own host answers the other.
 *
 * THE SAFE STATE IS STILL THE DEFAULT. `isIndexable()` is true only when `SEO_INDEXABLE` is
 * exactly `"true"`, which only `[env.production.vars]` in `wrangler.toml` sets. Staging, preview
 * and local are therefore non-indexable by being unconfigured, so this change cannot accidentally
 * open an environment that was closed before — see `seoSchema` in `lib/config.ts`.
 *
 * A missing `Host` header is treated as not indexable: there is no host to publish a `Sitemap:`
 * line for, and `app/sitemap.ts` returns an empty document in the same situation.
 */

/**
 * Paths no crawler should spend budget on: a signed-in surface, a transactional step, or a
 * developer page. `/` was previously allowed wholesale, so these were crawlable in production.
 * `/login`, `/register` and the password routes are intentionally absent — they are harmless to
 * crawl, and `app/sitemap.ts` simply never lists them.
 */
const DISALLOWED_PATHS = ["/account", "/cart", "/checkout", "/orders/lookup", "/dev"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");

  if (!isIndexable() || !host) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: DISALLOWED_PATHS },
    sitemap: `https://${host}/sitemap.xml`,
  };
}
