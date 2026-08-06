import type { MetadataRoute } from "next";

// Placeholder colors/icons — no brand assets or design-system tokens exist yet
// (specs/design-system.md hasn't been written). Real values are a follow-up
// requiring actual brand input, not fabricated here. See specs/2026-08-06-p0-foundation/plan.md.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aheed Food Centre",
    short_name: "Aheed",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [],
  };
}
