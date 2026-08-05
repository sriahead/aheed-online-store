/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the app on the Node.js runtime (OpenNext/Workers) — do NOT set runtime: 'edge'.
};

export default nextConfig;

// Enables Cloudflare bindings (env/secrets, R2, KV) during `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
