import type { MetadataRoute } from "next";
import { headers } from "next/headers";

// Just the homepage for now — grows as real routes (catalogue, etc.) land in P1+.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host") ?? "aheedfoodcentre.nocaped.com";

  return [
    {
      url: `https://${host}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
