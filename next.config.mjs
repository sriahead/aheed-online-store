/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the app on the Node.js runtime (OpenNext/Workers) — do NOT set runtime: 'edge'.
  // Treat the DB stack as external so bundlers defer resolution to the actual runtime
  // rather than statically rewriting these imports.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon", "@neondatabase/serverless"],
};

export default nextConfig;

// Enables Cloudflare bindings (env/secrets, R2, KV) during `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
