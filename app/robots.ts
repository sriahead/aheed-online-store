import type { MetadataRoute } from "next";
import { headers } from "next/headers";

const PRODUCTION_HOST = "aheedfoodcentre.nocaped.com";

// Staging must never be indexed — only the production host allows crawling.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "";
  const isProduction = host === PRODUCTION_HOST;

  if (!isProduction) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `https://${PRODUCTION_HOST}/sitemap.xml`,
  };
}
