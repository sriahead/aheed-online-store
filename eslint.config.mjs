import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    // kms/site-*/ are independent nested Next.js projects (own package.json,
    // own tsconfig, own dependency tree) — each lints itself, not the root.
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "node_modules/**",
      "prisma/generated/**",
      "kms/site-internal/**",
      "kms/site-public/**",
    ],
  },
  ...nextCoreWebVitals,
];

export default config;
