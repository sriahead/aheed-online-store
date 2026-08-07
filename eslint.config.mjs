import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    // kms/site-*/ are independent nested Next.js projects (own package.json,
    // own tsconfig, own dependency tree) — each lints itself, not the root.
    // docs/ui-ref/ is the P2.5b mockup's extracted reference source, kept for
    // comparison only — never built or imported by this app.
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "node_modules/**",
      "prisma/generated/**",
      "kms/site-internal/**",
      "kms/site-public/**",
      "docs/ui-ref/**",
    ],
  },
  ...nextCoreWebVitals,
];

export default config;
