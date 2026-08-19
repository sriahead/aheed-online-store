/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the app on the Node.js runtime (OpenNext/Workers) — do NOT set runtime: 'edge'.
  // Treat the DB stack as external so bundlers defer resolution to the actual runtime
  // rather than statically rewriting these imports.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon", "@neondatabase/serverless"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          // requirements.md §3.3 (P7a). No nonce middleware exists (this project
          // avoids Next middleware/edge — see ADR-004 slice 3b), so script/style
          // stay 'unsafe-inline'; 'unsafe-eval' covers `next dev`'s HMR runtime.
          // img-src/connect-src are scoped to this project's actual external
          // hosts: the per-vendor CDN (images.<vendor>.nocaped.com, both envs
          // live under *.nocaped.com) and the R2 S3 endpoint that P6b2's
          // browser-direct presigned PUT uploads straight to (bypassing the
          // Worker) — a bare 'self' here would silently break image upload.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://*.nocaped.com",
              "font-src 'self' data:",
              "connect-src 'self' https://*.r2.cloudflarestorage.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
      // P7.5a (#237). `/staff/reports` served stale financial figures to a
      // signed-in admin despite `export const dynamic = "force-dynamic"` — so
      // Next was not the cache; something in front of the Worker was. Measured
      // on staging seconds apart: £2,982.02/109 cached vs £3,003.49/110 with a
      // cachebust, the database agreeing with the UNCACHED figure. Nothing in
      // this app emitted any Cache-Control at all, which leaves an intermediary
      // free to invent one.
      //
      // Scoped to the whole panel rather than just the reports page on purpose:
      // every /staff/* route is per-vendor, role-gated, mutable operational
      // data, and a cached packing queue on /staff/orders is the same defect
      // with worse consequences. `private` because these responses are
      // per-session; `no-store` because there is no version of them worth
      // keeping. Storefront routes are deliberately untouched — they benefit
      // from edge caching and carry no per-session data.
      {
        source: "/staff/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

// Enables Cloudflare bindings (env/secrets, R2, KV) during `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
